#!/usr/bin/env python3
"""Thin client for the Explee public API, and a raw-request CLI to check shapes.

    export EXPLEE_API_KEY=...
    python3 explee.py GET  /public/api/v1/autogtm/campaigns
    python3 explee.py GET  /public/api/v1/billing/balance
    python3 explee.py POST /public/api/v1/autogtm/campaigns/12/inbox/34/note '{"note":null}'

WHY THE FIELD ACCESS IS DEFENSIVE
---------------------------------
Explee publishes response schemas for a handful of endpoints and prose for the
rest, and api.explee.com is not reachable from the sandbox this code was written
in, so no call here has ever been answered by the real server. Every field is
therefore read through `first_of`, which tries the plausible spellings and, when
none of them is present, raises an error naming exactly what it looked for and
what the payload actually contained. The alternative - `row["reply_count"]`
returning None because the key is `replies` - fails silently and quietly reports
a reply rate of zero, which is worse than not running at all.

Before trusting any number out of this directory, run the raw CLI above against
one campaign and read the JSON. It takes a minute and it is the only way to
confirm the mapping.

WHAT IT REFUSES TO RETRY
------------------------
401 (bad key), 402 (no credits), 403 (reply gate: unsubscribed, or the contact
never replied), 404 and 422 are decisions, not weather. Retrying them wastes the
hourly budget and, on 403, hammers a compliance gate that exists for a reason.
429 and 5xx/504 are retried with backoff, honouring Retry-After when the server
sends one.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = os.environ.get("EXPLEE_BASE_URL", "https://api.explee.com")
TIMEOUT = 95            # the documented server timeout is 90s
MAX_RETRIES = 4
NO_RETRY = (400, 401, 402, 403, 404, 409, 422)


class ExpleeError(RuntimeError):
    """A request the API answered with an error status."""

    def __init__(self, status, path, body):
        self.status = status
        self.path = path
        self.body = body
        super().__init__("{} on {}: {}".format(status, path, body))


class ShapeError(RuntimeError):
    """A response that did not contain a field this code needs."""


_MISSING = object()


def first_of(obj, *keys, **kw):
    """Read the first key that exists. Raises ShapeError rather than guessing.

    first_of(row, "reply_count", "replies")            -> required
    first_of(row, "spend_usd", "spend", default=0.0)   -> optional
    """
    default = kw.pop("default", _MISSING)
    if kw:
        raise TypeError("unexpected kwargs: {}".format(sorted(kw)))
    if isinstance(obj, dict):
        for key in keys:
            if key in obj and obj[key] is not None:
                return obj[key]
    if default is not _MISSING:
        return default
    present = sorted(obj.keys()) if isinstance(obj, dict) else type(obj).__name__
    raise ShapeError(
        "none of {} in this payload. It has: {}. Run "
        "`python3 explee.py GET <path>` and fix the key list in the caller.".format(
            list(keys), present))


class Explee:
    def __init__(self, api_key=None, base_url=BASE_URL, opener=None, sleep=time.sleep):
        self.api_key = api_key or os.environ.get("EXPLEE_API_KEY")
        if not self.api_key:
            raise SystemExit("EXPLEE_API_KEY is not set. Get one at https://explee.com/api-keys")
        self.base_url = base_url.rstrip("/")
        self._opener = opener        # tests inject a fake here
        self._sleep = sleep
        self.calls = 0

    # --- transport ---------------------------------------------------------
    def request(self, method, path, body=None, params=None):
        url = self.base_url + path
        if params:
            clean = {k: v for k, v in params.items() if v is not None}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)
        payload = json.dumps(body).encode() if body is not None else None

        for attempt in range(MAX_RETRIES):
            self.calls += 1
            try:
                return self._send(method, url, payload)
            except ExpleeError as err:
                if err.status in NO_RETRY or attempt == MAX_RETRIES - 1:
                    raise
                wait = self._retry_after(err) or 2 ** attempt
                self._sleep(min(wait, 60))
        raise AssertionError("unreachable")

    def _send(self, method, url, payload):
        req = urllib.request.Request(url, data=payload, method=method)
        req.add_header("X-API-Key", self.api_key)
        req.add_header("Accept", "application/json")
        if payload is not None:
            req.add_header("Content-Type", "application/json")
        opener = self._opener or urllib.request.urlopen
        try:
            with opener(req, timeout=TIMEOUT) as resp:
                raw = resp.read().decode() or "{}"
        except urllib.error.HTTPError as err:                      # noqa: PERF203
            detail = err.read().decode(errors="replace")[:800]
            raise ExpleeError(err.code, url, detail)
        except urllib.error.URLError as err:
            raise ExpleeError(0, url, "network: {}".format(err.reason))
        return json.loads(raw)

    @staticmethod
    def _retry_after(err):
        try:
            return float(json.loads(err.body).get("retry_after"))
        except (ValueError, TypeError, AttributeError):
            return None

    # --- billing -----------------------------------------------------------
    def balance(self):
        return float(first_of(self.request("GET", "/public/api/v1/billing/balance"),
                              "remain", "balance"))

    # --- autogtm: structure ------------------------------------------------
    def projects(self):
        return first_of(self.request("GET", "/public/api/v1/autogtm/projects"),
                        "projects", default=[])

    def campaigns(self, project_id=None):
        got = self.request("GET", "/public/api/v1/autogtm/campaigns",
                           params={"project_id": project_id})
        return first_of(got, "campaigns", default=[])

    def campaign(self, campaign_id):
        return self.request("GET", "/public/api/v1/autogtm/campaigns/{}".format(campaign_id))

    # --- autogtm: inbox ----------------------------------------------------
    def inbox(self, campaign_id, tab=None, limit=100, offset=0):
        got = self.request("GET",
                           "/public/api/v1/autogtm/campaigns/{}/inbox".format(campaign_id),
                           params={"tab": tab, "limit": limit, "offset": offset})
        return first_of(got, "conversations", "items", "people", default=[])

    def inbox_all(self, campaign_id, tab=None, page=100, cap=2000):
        """Every page of one tab, stopping at `cap` so a huge inbox cannot run away."""
        out, offset = [], 0
        while len(out) < cap:
            page_rows = self.inbox(campaign_id, tab=tab, limit=page, offset=offset)
            if not page_rows:
                break
            out.extend(page_rows)
            if len(page_rows) < page:
                break
            offset += page
        return out[:cap]

    def thread(self, campaign_id, person_id):
        return self.request(
            "GET", "/public/api/v1/autogtm/campaigns/{}/inbox/{}".format(campaign_id, person_id))

    def reply(self, campaign_id, person_id, message):
        return self.request(
            "POST", "/public/api/v1/autogtm/campaigns/{}/inbox/{}/reply".format(
                campaign_id, person_id),
            body={"message": message})

    def get_note(self, campaign_id, person_id):
        got = self.request(
            "GET", "/public/api/v1/autogtm/campaigns/{}/inbox/{}/note".format(
                campaign_id, person_id))
        return first_of(got, "note", default=None)

    def set_note(self, campaign_id, person_id, note):
        return self.request(
            "POST", "/public/api/v1/autogtm/campaigns/{}/inbox/{}/note".format(
                campaign_id, person_id),
            body={"note": note})

    def hot_leads(self, campaign_id=None, since=None, limit=100, offset=0):
        got = self.request("GET", "/public/api/v1/autogtm/hot-leads",
                           params={"campaign_id": campaign_id, "since": since,
                                   "limit": limit, "offset": offset})
        return first_of(got, "hot_leads", "leads", "items", default=[])

    # --- autogtm: analytics ------------------------------------------------
    def campaign_analytics(self, campaign_id, period=None):
        return self.request(
            "GET", "/public/api/v1/autogtm/campaigns/{}/analytics".format(campaign_id),
            params={"period": period})

    def project_analytics(self, project_id, period=None):
        return self.request(
            "GET", "/public/api/v1/autogtm/projects/{}/analytics".format(project_id),
            params={"period": period})

    # --- autogtm: import ---------------------------------------------------
    def import_campaign(self, project_id, name, leads, instructions=None,
                        followup_instructions=None, language=None):
        body = {"project_id": project_id, "name": name, "leads": leads}
        for key, value in (("instructions", instructions),
                           ("followup_instructions", followup_instructions),
                           ("language", language)):
            if value:
                body[key] = value
        return self.request("POST", "/public/api/v1/autogtm/campaigns/import", body=body)

    def import_status(self, task_id):
        return self.request(
            "GET", "/public/api/v1/autogtm/campaigns/import/{}".format(task_id))

    # --- search / enrich ---------------------------------------------------
    def search_people(self, body):
        return self.request("POST", "/public/api/v1/search/people", body=body)

    def find_and_enrich(self, body):
        return self.request("POST", "/public/api/v1/find-and-enrich", body=body)

    def find_and_enrich_status(self, task_id):
        return self.request("GET", "/public/api/v1/find-and-enrich/{}".format(task_id))


def _cli(argv):
    if len(argv) < 3:
        print(__doc__.strip().split("\n\nWHY")[0])
        return 2
    method, path = argv[1].upper(), argv[2]
    body = json.loads(argv[3]) if len(argv) > 3 else None
    print(json.dumps(Explee().request(method, path, body=body), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(_cli(sys.argv))
    except ExpleeError as exc:
        print("HTTP {} {}\n{}".format(exc.status, exc.path, exc.body), file=sys.stderr)
        sys.exit(1)
