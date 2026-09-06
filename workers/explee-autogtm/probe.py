#!/usr/bin/env python3
"""Print the real shape of every endpoint the loop reads. Free GETs, no writes.

    python3 probe.py                 # every campaign in the project
    python3 probe.py --campaign 127292

Run it from the workflow (task: probe) when a run reports zero of something
that the dashboard says exists: the loop reads every field through first_of,
and a key spelled differently than expected reads as "nothing there". This
prints the keys and the first item of each payload so the spelling can be
added to the caller. Long strings are cut; emails and names are not hidden -
the Actions log is private to the repository.
"""

import argparse
import json
import sys

from explee import Explee, ExpleeError, first_of
from sequence import default_project

CUT = 160


def trim(value, depth=0):
    if isinstance(value, dict):
        return {k: trim(v, depth + 1) for k, v in list(value.items())[:40]}
    if isinstance(value, list):
        return [trim(v, depth + 1) for v in value[:2]] + (["... {} more".format(len(value) - 2)]
                                                         if len(value) > 2 else [])
    if isinstance(value, str) and len(value) > CUT:
        return value[:CUT] + "…"
    return value


def show(title, payload):
    print("\n### {}".format(title))
    if isinstance(payload, dict):
        print("keys: {}".format(sorted(payload)))
    elif isinstance(payload, list):
        print("a list of {}".format(len(payload)))
    print(json.dumps(trim(payload), indent=1, ensure_ascii=False, default=str))


def get(api, path, params=None):
    try:
        return api.request("GET", path, params=params)
    except ExpleeError as err:
        return {"__error__": "{} {}".format(err.status, err.body[:300])}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--campaign", type=int, action="append")
    ap.add_argument("--project", type=int)
    args = ap.parse_args(argv)
    api = Explee()
    print("balance: {}".format(api.balance()))
    project = args.project or default_project()

    show("GET /autogtm/projects", get(api, "/public/api/v1/autogtm/projects"))
    campaigns = get(api, "/public/api/v1/autogtm/campaigns", {"project_id": project})
    show("GET /autogtm/campaigns?project_id={}".format(project), campaigns)
    rows = first_of(campaigns, "campaigns", default=[]) if isinstance(campaigns, dict) else []
    ids = args.campaign or [first_of(c, "id", "campaign_id") for c in rows]
    show("GET /autogtm/hot-leads?limit=2", get(api, "/public/api/v1/autogtm/hot-leads",
                                              {"limit": 2}))
    show("GET /autogtm/projects/{}/autopilot".format(project),
         get(api, "/public/api/v1/autogtm/projects/{}/autopilot".format(project)))

    for cid in ids[:3]:
        base = "/public/api/v1/autogtm/campaigns/{}".format(cid)
        show("GET {} (definition)".format(base), get(api, base))
        show("GET {}/analytics?period=month".format(base),
             get(api, base + "/analytics", {"period": "month"}))
        person = None
        for tab in ("replied", "need_reply", "sent", None):
            got = get(api, base + "/inbox", {"tab": tab, "limit": 2})
            show("GET {}/inbox?tab={}&limit=2".format(base, tab), got)
            if person is None and isinstance(got, dict):
                for key in ("conversations", "items", "people", "leads", "contacts",
                            "threads", "results", "data", "inbox"):
                    if isinstance(got.get(key), list) and got[key]:
                        person = first_of(got[key][0], "person_id", "id", "lead_id",
                                          default=None)
                        break
        if person is not None:
            show("GET {}/inbox/{} (thread)".format(base, person),
                 get(api, "{}/inbox/{}".format(base, person)))
            show("GET {}/inbox/{}/note".format(base, person),
                 get(api, "{}/inbox/{}/note".format(base, person)))
        else:
            print("\n!! no conversation found in any inbox tab of campaign {} - every tab came "
                  "back without a list under a known key".format(cid))
    return 0


if __name__ == "__main__":
    sys.exit(main())
