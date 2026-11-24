"""Import affiliate-recruitment leads that already have an email into an Explee
AutoGTM campaign (project 37934, linkfinderai-outbound), with the affiliate brief
from affiliate_sites.py. Created *Not started* so the owner can read it first.

The leads never touch the repo or the logs. The workflow reads them from the
dispatch payload file ($GITHUB_EVENT_PATH, input `leads_b64` = base64 of gzipped
JSON: [{"email", "company_domain", "first_name"?}, ...]); this script prints
counts only.

    python3 affiliate_import.py --event "$GITHUB_EVENT_PATH"            # dry run
    python3 affiliate_import.py --event "$GITHUB_EVENT_PATH" --apply
"""

import argparse
import base64
import gzip
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from explee import Explee, ExpleeError, first_of  # noqa: E402
from affiliate_sites import BRIEF, PROJECT  # noqa: E402

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)


def load_leads(event_path):
    event = json.load(open(event_path))
    blob = (event.get("inputs") or {}).get("leads_b64") or ""
    raw = json.loads(gzip.decompress(base64.b64decode(blob)).decode("utf-8"))
    leads, seen = [], set()
    for row in raw:
        email = str(row.get("email") or "").strip().lower()
        if not EMAIL.match(email) or email in seen:
            continue
        seen.add(email)
        leads.append({"email": email,
                      "first_name": row.get("first_name") or "",
                      "last_name": "",
                      "company_domain": row.get("company_domain") or email.split("@")[1],
                      "job_title": "",
                      "linkedin_url": ""})
    return leads


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--event", required=True)
    ap.add_argument("--name", default="Affiliates - B2B tool review sites (AffiliateFinder)")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)

    leads = load_leads(args.event)
    print("{} valid unique leads, project {}".format(len(leads), PROJECT))
    if not leads:
        return 1
    if not args.apply:
        print("DRY RUN - add --apply")
        return 0
    api = Explee()
    try:
        task = api.import_campaign(PROJECT, args.name, leads,
                                   instructions=BRIEF["instructions"],
                                   followup_instructions=BRIEF["followup_instructions"],
                                   language=BRIEF["language"])
    except ExpleeError as err:
        print("import refused: HTTP {} {}".format(err.status, str(err)[:200]))
        return 1
    task_id = first_of(task, "task_id", "id")
    status, got = "pending", {}
    for _ in range(120):
        got = api.import_status(task_id)
        status = first_of(got, "status", default=first_of(
            first_of(got, "meta", default={}), "status", default="pending"))
        if status in ("completed", "failed"):
            break
        time.sleep(5)
    if status != "completed":
        print("import {}: {}".format(status, str(first_of(got, "error", default="?"))[:200]))
        return 1
    result = first_of(got, "result", default={})
    print("campaign {} created (Not started), {} leads submitted".format(
        first_of(result, "campaign_id", default="?"), len(leads)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
