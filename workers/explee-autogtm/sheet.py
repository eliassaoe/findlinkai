#!/usr/bin/env python3
"""The Google Sheet that says who booked. Read it, and append new hot leads to it.

    python3 sheet.py booked --csv-url "https://docs.google.com/.../pub?output=csv"
    python3 sheet.py booked --webapp-url "https://script.google.com/macros/s/.../exec" --token X

TWO MODES, AND YOU CAN START WITH THE EASY ONE
-----------------------------------------------
**Published CSV (read-only, two minutes).** In the sheet: File -> Share ->
Publish to web -> the sheet, CSV. Paste that URL. The follow-up loop can then see
who you marked booked. New hot leads are written to a local CSV for you to paste
in yourself.

**Apps Script web app (read and write).** Deploy `sheet-bridge.gs` (in this
directory) as a web app and paste its /exec URL. Then new hot leads append
themselves and you only ever type in the Booked column.

Read-only is enough for the part that matters - nothing sends to someone you
marked booked - so start there and upgrade when the manual paste annoys you.

TWO WAYS TO TAKE SOMEONE OUT OF THE LOOP
-----------------------------------------
`booked` means they have a call - a win, and it is what the numbers count.
`stop` means leave them alone for any other reason: you answered them yourself,
they are a customer already, you simply do not want them chased. Both stop the
follow-ups; only `booked` inflates the booked rate. A sheet with just one of the
two columns works fine.

WHAT COUNTS AS BOOKED
---------------------
Any non-empty value in the booked column that is not a plain no: `x`, `yes`,
`oui`, `TRUE`, a date, a tick. `no`, `non`, `false`, `0` and blank mean not
booked. The column can be called booked, rdv, call, meeting or reserve, in either
language, and the email column email, e-mail or mail. Case and accents ignored.

If the sheet cannot be read, every caller treats that as "I do not know who
booked" and **sends nothing**. A silent empty set would mail everyone who booked
this week, which is the one outcome worse than not following up at all.
"""

import argparse
import csv
import io
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

EMAIL_HEADERS = ("email", "e_mail", "mail", "adresse_email", "courriel")
BOOKED_HEADERS = ("booked", "rdv", "call", "meeting", "reserve", "call_booked",
                  "rendez_vous", "booked_call")
# "Dealt with" is not "booked". Someone you answered yourself, or who is simply
# not to be chased again, needs a home that does not inflate the booked count.
STOP_HEADERS = ("stop", "done", "handled", "traite", "fait", "no_followup",
                "ne_pas_relancer", "closed")
NOT_BOOKED = ("", "no", "non", "false", "0", "n", "nope", "pas encore", "-")
TIMEOUT = 30


class SheetError(RuntimeError):
    """The sheet could not be read. Callers must not send when they see this."""


def norm(name):
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode()
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", text.strip().lower())).strip("_")


def is_booked(value):
    """A mark is a mark. Blank and the words for no are the only ways to say no.

    `norm` strips non-ascii, so a tick or an emoji normalises to the empty string
    and would read as blank - i.e. as not booked, and the lead gets mailed after
    booking. Anything non-empty that does not normalise to a no is booked.
    """
    raw = str(value or "").strip()
    if not raw or raw.lower() in NOT_BOOKED:
        return False
    word = norm(raw).replace("_", " ").strip()
    return True if not word else word not in NOT_BOOKED


class Sheet:
    def __init__(self, csv_url=None, webapp_url=None, token=None, opener=None):
        self.csv_url = csv_url
        self.webapp_url = webapp_url
        self.token = token
        self._opener = opener or urllib.request.urlopen
        if not (csv_url or webapp_url):
            raise SheetError("give either --csv-url (published CSV) or --webapp-url")

    def _fetch(self, url, body=None):
        req = urllib.request.Request(url, data=body, method="POST" if body else "GET")
        if body:
            req.add_header("Content-Type", "application/json")
        try:
            with self._opener(req, timeout=TIMEOUT) as resp:
                return resp.read().decode()
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as err:
            raise SheetError("could not read the sheet ({}). Nothing will be sent this "
                             "run - that is deliberate.".format(err))

    # --- who is out of the loop --------------------------------------------
    def exclusions(self):
        """-> (booked, stopped). Both stop follow-ups; only booked is a win."""
        if self.webapp_url:
            data = self._webapp_get("exclusions")
            return ({str(e).strip().lower() for e in data.get("booked", []) if str(e).strip()},
                    {str(e).strip().lower() for e in data.get("stopped", []) if str(e).strip()})
        return self._from_csv(self._fetch(self.csv_url))

    def booked_emails(self):
        """Everyone the loop must not contact - booked or stopped."""
        booked, stopped = self.exclusions()
        return booked | stopped

    def _webapp_get(self, action):
        raw = self._fetch("{}?token={}&action={}".format(
            self.webapp_url, urllib.parse.quote(self.token or ""), action))
        try:
            data = json.loads(raw)
        except ValueError:
            raise SheetError("the web app did not return JSON. Check the token and that the "
                             "deployment is set to 'Anyone with the link'.")
        if isinstance(data, dict) and data.get("error"):
            raise SheetError("web app: {}".format(data["error"]))
        return data

    def _old_booked_emails(self):
        if self.webapp_url:
            raw = self._fetch("{}?token={}&action=booked".format(
                self.webapp_url, urllib.parse.quote(self.token or "")))
            try:
                data = json.loads(raw)
            except ValueError:
                raise SheetError("the web app did not return JSON. Check the token and that "
                                 "the deployment is set to 'Anyone with the link'.")
            if isinstance(data, dict) and data.get("error"):
                raise SheetError("web app: {}".format(data["error"]))
            emails = data.get("booked", data) if isinstance(data, dict) else data
            return {str(e).strip().lower() for e in emails if str(e).strip()}
        return self._booked_from_csv(self._fetch(self.csv_url))

    @staticmethod
    def _from_csv(text):
        """-> (booked, stopped) out of a published CSV."""
        rows = list(csv.DictReader(io.StringIO(text)))
        if not rows:
            raise SheetError("the published CSV is empty - check the publish-to-web link")
        headers = {norm(h): h for h in rows[0]}
        email_col = next((headers[h] for h in EMAIL_HEADERS if h in headers), None)
        booked_col = next((headers[h] for h in BOOKED_HEADERS if h in headers), None)
        stop_col = next((headers[h] for h in STOP_HEADERS if h in headers), None)
        if not email_col or not (booked_col or stop_col):
            raise SheetError("need an email column and a booked column. Found: {}. "
                             "Rename one to 'email' and one to 'booked'.".format(
                                 sorted(headers.values())))
        booked, stopped = set(), set()
        for row in rows:
            email = str(row.get(email_col) or "").strip().lower()
            if not email:
                continue
            if booked_col and is_booked(row.get(booked_col)):
                booked.add(email)
            elif stop_col and is_booked(row.get(stop_col)):
                stopped.add(email)
        return booked, stopped

    @staticmethod
    def _booked_from_csv(text):
        return Sheet._from_csv(text)[0]

    # --- new hot leads into the sheet --------------------------------------
    def update(self, rows):
        """Write loop state back per lead, keyed by email. Read-only mode: None."""
        if not rows or not self.webapp_url:
            return None if not self.webapp_url else 0
        raw = self._fetch(self.webapp_url,
                          json.dumps({"token": self.token, "action": "update",
                                      "rows": rows}).encode())
        try:
            data = json.loads(raw)
        except ValueError:
            raise SheetError("the web app did not return JSON on update")
        if data.get("error"):
            raise SheetError("web app: {}".format(data["error"]))
        return int(data.get("updated", 0))

    def append(self, rows):
        """-> how many were added. Read-only mode returns None and writes nothing."""
        if not rows:
            return 0
        if not self.webapp_url:
            return None
        raw = self._fetch(self.webapp_url,
                          json.dumps({"token": self.token, "action": "append",
                                      "rows": rows}).encode())
        try:
            data = json.loads(raw)
        except ValueError:
            raise SheetError("the web app did not return JSON on append")
        if data.get("error"):
            raise SheetError("web app: {}".format(data["error"]))
        return int(data.get("added", 0))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("command", choices=("booked",))
    ap.add_argument("--csv-url")
    ap.add_argument("--webapp-url")
    ap.add_argument("--token")
    args = ap.parse_args(argv)
    booked = Sheet(args.csv_url, args.webapp_url, args.token).booked_emails()
    print("{} marked booked".format(len(booked)))
    for email in sorted(booked):
        print("  " + email)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SheetError as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)
