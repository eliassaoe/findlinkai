#!/usr/bin/env python3
"""Instantly SuperSearch leads -> the CSV that `leadsource_test.py prepare` eats.

    python3 instantly_leads.py leads.json --out intent.csv
    python3 instantly_leads.py leads.json --out intent.csv --signal website_funding

WHERE leads.json COMES FROM
---------------------------
Instantly's list-leads response, verbatim - either `{"items": [...]}` or a bare
list. Two ways to get it, and neither is a guess: the MCP server's `list_leads`
(what produced the field mapping below), or the same endpoint on your own key.
api.instantly.ai is blocked from the sandbox this was written in, so this file
deliberately does no HTTP: it maps a payload you already hold, which is the part
that would otherwise be wrong.

THE MAPPING, TAKEN FROM A REAL RESPONSE
---------------------------------------
    email          <- email
    first_name     <- first_name
    last_name      <- last_name
    company_domain <- company_domain, else payload.companyDomain
    job_title      <- job_title, else payload.jobTitle
    linkedin_url   <- payload.linkedIn  ("linkedin.com/in/x" -> "https://...")

WHAT DOES NOT SURVIVE THE TRIP, AND WHY IT DECIDES THE CAMPAIGN DESIGN
----------------------------------------------------------------------
AutoGTM's import takes five mandatory fields and `linkedin_url`. It takes no
custom variables. So the *reason* a lead is interesting - the funding round, the
new job title, the Reddit thread - cannot ride along per lead, and the email
Explee writes will never mention it.

That is not fatal, it is a constraint on the design: **one signal per campaign.**
If every lead in the campaign raised money in the last 90 days, the brief can say
"every company here has just raised - reference it", and the copy gets its edge
back. A campaign mixing four signals cannot say anything specific about any of
them, and then you have paid intent prices for a firmographic email.

The `--signal` flag writes the signal name into the CSV for your own records and
prints the brief line to paste. It is documentation, not data Explee will see.
"""

import argparse
import csv
import json
import sys
from pathlib import Path

COLUMNS = ("email", "first_name", "last_name", "company_domain", "job_title",
           "linkedin_url", "signal")


def linkedin(value):
    url = (value or "").strip()
    if not url:
        return ""
    if url.startswith(("http://", "https://")):
        return url
    return "https://" + url.lstrip("/")


def to_row(lead, signal=""):
    payload = lead.get("payload") or {}

    def pick(*keys):
        for key in keys:
            for source in (lead, payload):
                value = source.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return ""

    return {
        "email": pick("email").lower(),
        "first_name": pick("first_name", "firstName"),
        "last_name": pick("last_name", "lastName"),
        "company_domain": pick("company_domain", "companyDomain",
                               "sourceCompanyDomain").lower(),
        "job_title": pick("job_title", "jobTitle"),
        "linkedin_url": linkedin(pick("linkedIn", "linkedin_url", "linkedin")),
        "signal": signal,
    }


def convert(payload, signal=""):
    """-> (rows, dropped reasons). Rows missing a mandatory field are reported."""
    items = payload.get("items", payload) if isinstance(payload, dict) else payload
    rows, dropped, seen = [], {}, set()
    for lead in items:
        row = to_row(lead, signal)
        missing = [k for k in COLUMNS[:5] if not row[k]]
        if missing:
            key = "missing " + ",".join(missing)
            dropped[key] = dropped.get(key, 0) + 1
            continue
        if row["email"] in seen:
            dropped["duplicate email"] = dropped.get("duplicate email", 0) + 1
            continue
        seen.add(row["email"])
        rows.append(row)
    return rows, dropped


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("dump", help="Instantly list-leads JSON")
    ap.add_argument("--out", required=True)
    ap.add_argument("--signal", default="", help="the one signal this campaign is built on")
    args = ap.parse_args(argv)

    rows, dropped = convert(json.loads(Path(args.dump).read_text()), args.signal)
    with open(args.out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print("{} leads -> {}".format(len(rows), args.out))
    for reason, count in sorted(dropped.items(), key=lambda kv: -kv[1]):
        print("  dropped {:>4}  {}".format(count, reason))
    if args.signal:
        print("\nPaste into the campaign brief so the copy can use it:\n"
              "  \"Every company in this campaign has a {} signal from the last 90 days. "
              "Reference it in the first line.\"".format(args.signal.replace("_", " ")))
    if not rows:
        print("\nnothing usable - check the dump is the list-leads response, not a summary")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
