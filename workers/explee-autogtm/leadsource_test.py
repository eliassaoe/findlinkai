#!/usr/bin/env python3
"""Action 2: does a higher-intent lead source actually reply better?

    python3 leadsource_test.py prepare  --csv gojiberry.csv --out variant.leads.json
    python3 leadsource_test.py control  --filters filters.json --count 500 --out control.leads.json --apply
    python3 leadsource_test.py import   --project 4021 --name "Intent test - control" \\
                                        --leads control.leads.json --brief brief.json --apply
    python3 leadsource_test.py compare  --arm control.arm.json --arm variant.arm.json

THE TEST, AND THE ONLY THING THAT MAKES IT READABLE
---------------------------------------------------
500 Explee leads against 500 sourced leads. Same copy, same sequence, same week,
same project. If any of those three drift the result is unreadable, so `import`
hashes the brief and refuses the second arm when it does not match the first,
and `compare` says so loudly if the arms did not run over the same days.

This costs MORE, not less: you pay for the sends either way, plus the data. It
is a quality bet. The plan's decision rule, and the gates below implement it
literally: sourced replies twice as well -> scale it; the same -> Explee's data
is fine, drop the extra spend. A 30% edge is not a result at this sample size,
it is noise wearing a suit.

OVERLAP IS CONTAMINATION
------------------------
A person who is in both arms replies once and credits one arm at random.
`prepare` and `control` both take --exclude and drop anything already in the
other arm, on email first and on first+last+domain when the email is missing.
"""

import argparse
import csv
import hashlib
import json
import math
import sys
import time
from pathlib import Path

from explee import Explee, first_of

MIN_LEADS_PER_ARM = 300      # below this the comparison is not worth reading
MIN_REPLIES_TOTAL = 12       # across both arms, before reply rate can decide anything
SCALE_EFFECT = 1.0           # "2x better" - a 100% relative lift, not 30%
ALPHA = 0.05
MANDATORY = ("email", "first_name", "last_name", "company_domain", "job_title")


# --- statistics --------------------------------------------------------------
def two_proportion_p(hits_a, n_a, hits_b, n_b):
    """Two-sided p for 'these two rates differ'. None when it cannot be computed."""
    if n_a <= 0 or n_b <= 0:
        return None
    pooled = (hits_a + hits_b) / (n_a + n_b)
    if pooled in (0.0, 1.0):
        return None
    se = math.sqrt(pooled * (1 - pooled) * (1 / n_a + 1 / n_b))
    if se == 0:
        return None
    z = abs(hits_a / n_a - hits_b / n_b) / se
    return math.erfc(z / math.sqrt(2))


# --- leads -------------------------------------------------------------------
def lead_key(lead):
    email = (lead.get("email") or "").strip().lower()
    if email:
        return email
    return "|".join(str(lead.get(k, "")).strip().lower()
                    for k in ("first_name", "last_name", "company_domain"))


def clean_leads(rows, exclude=()):
    """-> (usable leads, why the rest were dropped). Never raises on a bad row."""
    seen, keep, dropped = set(exclude), [], {}
    for row in rows:
        lead = {k: (str(row.get(k) or "").strip()) for k in MANDATORY}
        if row.get("linkedin_url"):
            lead["linkedin_url"] = str(row["linkedin_url"]).strip()
        missing = [k for k in MANDATORY if not lead[k]]
        if missing:
            dropped["missing " + ",".join(missing)] = dropped.get(
                "missing " + ",".join(missing), 0) + 1
            continue
        key = lead_key(lead)
        if key in seen:
            dropped["duplicate or in the other arm"] = dropped.get(
                "duplicate or in the other arm", 0) + 1
            continue
        seen.add(key)
        keep.append(lead)
    return keep, dropped


def load_keys(paths):
    keys = set()
    for path in paths or []:
        for lead in json.loads(Path(path).read_text()):
            keys.add(lead_key(lead))
    return keys


def cmd_filters(args):
    """Plain English -> the exact filter shape the search endpoints want. Free."""
    api = Explee()
    got = api.request("POST", "/public/api/v1/search/nl-to-filters",
                      body={"query": args.query})
    body = {"company_filters": first_of(got, "companies_filters", "company_filters", default={}),
            "people_filters": first_of(got, "people_filters", default={})}
    Path(args.out).write_text(json.dumps(body, indent=1))
    print(json.dumps(body, indent=1))
    print("\n-> {}   (focus: {})".format(args.out, first_of(got, "focus", default="?")))
    print("Read it before spending anything: this is what the search will actually match.")
    return 0


def cmd_prepare(args):
    with open(args.csv, newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    rows = [{k.strip().lower().replace(" ", "_"): v for k, v in row.items()} for row in rows]
    leads, dropped = clean_leads(rows, load_keys(args.exclude))
    Path(args.out).write_text(json.dumps(leads, indent=1))
    print("{} leads -> {}".format(len(leads), args.out))
    for reason, count in sorted(dropped.items(), key=lambda kv: -kv[1]):
        print("  dropped {:>5}  {}".format(count, reason))
    if len(leads) < MIN_LEADS_PER_ARM:
        print("\nthat is under {} - the comparison will not be readable".format(MIN_LEADS_PER_ARM))
    return 0


def cmd_control(args):
    """The Explee arm: search is free, the emails are not (1.5 or 5 credits each found)."""
    filters = json.loads(Path(args.filters).read_text())
    worst_case = args.count * (5.0 if args.preset == "premium" else 1.5)
    print("up to {:.0f} credits (${:.2f}) if every one of the {} emails is found"
          .format(worst_case, worst_case / 100.0, args.count))
    if not args.apply:
        print("DRY RUN - nothing spent. Add --apply.")
        return 0

    api = Explee()
    body = dict(filters, max_contacts=min(args.count, 500), preset=args.preset)
    task = api.find_and_enrich(body)
    task_id = first_of(task, "task_id", "id")
    print("task {} - polling".format(task_id))

    contacts = []
    while True:
        got = api.find_and_enrich_status(task_id)
        meta = first_of(got, "meta", default={})
        status = first_of(meta, "status", default="pending")
        if status == "completed":
            contacts = first_of(got, "contacts", default=[]) or []
            break
        if status == "failed":
            raise SystemExit("job failed: {}".format(first_of(meta, "error", default="?")))
        time.sleep(5)

    rows = [{"email": first_of(c, "email", default=""),
             "first_name": first_of(c, "first_name", default=""),
             "last_name": first_of(c, "last_name", default=""),
             "company_domain": first_of(c, "company_domain", "domain", default=""),
             "job_title": first_of(c, "job_title", "title", default=""),
             "linkedin_url": first_of(c, "linkedin_url", default="")} for c in contacts]
    leads, dropped = clean_leads(rows, load_keys(args.exclude))
    Path(args.out).write_text(json.dumps(leads, indent=1))
    print("{} leads -> {} (dropped {})".format(len(leads), args.out, sum(dropped.values())))
    return 0


def brief_sha(brief):
    return hashlib.sha1(json.dumps(brief, sort_keys=True).encode()).hexdigest()[:8]


def cmd_import(args):
    leads = json.loads(Path(args.leads).read_text())
    brief = json.loads(Path(args.brief).read_text()) if args.brief else {}
    if len(leads) < MIN_LEADS_PER_ARM and not args.force:
        raise SystemExit("{} leads is under {}. --force to import anyway."
                         .format(len(leads), MIN_LEADS_PER_ARM))
    for other in args.exclude or []:
        record = json.loads(Path(other).read_text())
        if record.get("brief_sha") and record["brief_sha"] != brief_sha(brief):
            raise SystemExit("the other arm ran brief {} and this one is {}. Same copy or "
                             "no test.".format(record["brief_sha"], brief_sha(brief)))

    print("{} leads into project {} as {!r}, brief {}".format(
        len(leads), args.project, args.name, brief_sha(brief)))
    if not args.apply:
        print("DRY RUN - nothing imported. Add --apply.")
        return 0

    api = Explee()
    task = api.import_campaign(args.project, args.name, leads,
                               instructions=brief.get("instructions"),
                               followup_instructions=brief.get("followup_instructions"),
                               language=brief.get("language"))
    task_id = first_of(task, "task_id", "id")
    while True:
        got = api.import_status(task_id)
        status = first_of(got, "status", default=first_of(
            first_of(got, "meta", default={}), "status", default="pending"))
        if status == "completed":
            break
        if status == "failed":
            raise SystemExit("import failed: {}".format(first_of(got, "error", default="?")))
        print("  {} ...".format(status))
        time.sleep(5)

    result = first_of(got, "result", default={})
    campaign_id = first_of(result, "campaign_id", default=None)
    if not campaign_id:
        raise SystemExit("no leads survived validation and dedup - no campaign was created")
    record = {"arm": args.name, "campaign_id": campaign_id, "project_id": args.project,
              "leads_submitted": len(leads), "brief_sha": brief_sha(brief),
              "imported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    out = args.out or (Path(args.leads).stem.split(".")[0] + ".arm.json")
    Path(out).write_text(json.dumps(record, indent=1))
    print("campaign {} -> {}".format(campaign_id, out))
    return 0


# --- the verdict -------------------------------------------------------------
def read_arm(api, record, period):
    stats = api.campaign_analytics(record["campaign_id"], period=period)
    flat = dict(first_of(stats, "analytics", "totals", "summary", default={}) or {})
    flat.update({k: v for k, v in stats.items() if not isinstance(v, (dict, list))})
    sent = int(first_of(flat, "emails_sent", "sent", "emails", default=0))
    return {
        "name": record["arm"],
        "sent": sent,
        "replies": int(first_of(flat, "replies", "reply_count", "replied", default=0)),
        "hot": int(first_of(flat, "hot_leads", "hot_lead_count", "hot", default=0)),
        "spend": float(first_of(flat, "spend_usd", "spend", "cost_usd", default=0.0)),
        "brief_sha": record.get("brief_sha"),
        "imported_at": record.get("imported_at"),
    }


def verdict(control, variant):
    """The plan's rule, with the gates that stop it firing on noise."""
    if min(control["sent"], variant["sent"]) < MIN_LEADS_PER_ARM:
        return ("wait", "the smaller arm has sent {} - read nothing before {}".format(
            min(control["sent"], variant["sent"]), MIN_LEADS_PER_ARM))
    total = control["replies"] + variant["replies"]
    if total < MIN_REPLIES_TOTAL:
        return ("wait", "{} replies across both arms - needs {}".format(total, MIN_REPLIES_TOTAL))

    rate_c = control["replies"] / control["sent"]
    rate_v = variant["replies"] / variant["sent"]
    lift = (rate_v - rate_c) / rate_c if rate_c else float("inf")
    p = two_proportion_p(control["replies"], control["sent"],
                         variant["replies"], variant["sent"])
    if p is None or p > ALPHA:
        return ("drop", "reply rates {:.1%} vs {:.1%}, p={} - not distinguishable. Explee's "
                        "data is fine; the sourced list is not worth its price.".format(
                            rate_c, rate_v, "n/a" if p is None else "{:.3f}".format(p)))
    if lift >= SCALE_EFFECT:
        return ("scale", "sourced replies {:.1%} against {:.1%}, a {:.0f}% lift at p={:.3f}. "
                         "Scale it.".format(rate_v, rate_c, lift * 100, p))
    if lift <= -0.2:
        return ("drop", "sourced replies WORSE ({:.1%} vs {:.1%}, p={:.3f})".format(
            rate_v, rate_c, p))
    return ("drop", "a real but small edge ({:+.0f}%, p={:.3f}). The plan's bar was 2x, and "
                    "the data costs more than that edge is worth.".format(lift * 100, p))


def cmd_compare(args):
    api = Explee()
    arms = [read_arm(api, json.loads(Path(p).read_text()), args.period) for p in args.arm]
    if len(arms) != 2:
        raise SystemExit("compare takes exactly two --arm files")
    control, variant = arms

    head = "{:<28}{:>8}{:>9}{:>7}{:>10}{:>12}{:>12}"
    print(head.format("arm", "sent", "replies", "hot", "spend", "reply rate", "$/hot lead"))
    for arm in arms:
        per_hot = (arm["spend"] / arm["hot"]) if arm["hot"] else 0.0
        print(head.format(arm["name"][:28], arm["sent"], arm["replies"], arm["hot"],
                          "${:.0f}".format(arm["spend"]),
                          "{:.1%}".format(arm["replies"] / arm["sent"]) if arm["sent"] else "-",
                          "${:.0f}".format(per_hot) if per_hot else "-"))

    if control["brief_sha"] != variant["brief_sha"]:
        print("\n!! the arms ran different copy ({} vs {}). This comparison measures the copy, "
              "not the lead source.".format(control["brief_sha"], variant["brief_sha"]))
    if control["imported_at"] and variant["imported_at"] and \
            control["imported_at"][:10] != variant["imported_at"][:10]:
        print("!! the arms started on different days ({} vs {}) - a good week can masquerade "
              "as a good lead source".format(control["imported_at"][:10],
                                             variant["imported_at"][:10]))

    call, why = verdict(control, variant)
    print("\n{}: {}".format(call.upper(), why))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    filt = sub.add_parser("filters", help="plain English -> filters.json (free, no credits)")
    filt.add_argument("--query", required=True)
    filt.add_argument("--out", default="filters.json")
    filt.set_defaults(func=cmd_filters)

    prep = sub.add_parser("prepare", help="a sourced CSV -> import-ready leads")
    prep.add_argument("--csv", required=True)
    prep.add_argument("--out", required=True)
    prep.add_argument("--exclude", action="append", help="leads file from the other arm")
    prep.set_defaults(func=cmd_prepare)

    ctrl = sub.add_parser("control", help="the Explee arm, via search + find-and-enrich")
    ctrl.add_argument("--filters", required=True, help="JSON body for find-and-enrich")
    ctrl.add_argument("--count", type=int, default=500)
    ctrl.add_argument("--preset", choices=("basic", "premium"), default="basic")
    ctrl.add_argument("--out", required=True)
    ctrl.add_argument("--exclude", action="append")
    ctrl.add_argument("--apply", action="store_true")
    ctrl.set_defaults(func=cmd_control)

    imp = sub.add_parser("import", help="one arm into a new AutoGTM campaign")
    imp.add_argument("--project", type=int, required=True)
    imp.add_argument("--name", required=True)
    imp.add_argument("--leads", required=True)
    imp.add_argument("--brief", help="JSON: instructions, followup_instructions, language")
    imp.add_argument("--exclude", action="append", help="the other arm's .arm.json")
    imp.add_argument("--out")
    imp.add_argument("--force", action="store_true")
    imp.add_argument("--apply", action="store_true")
    imp.set_defaults(func=cmd_import)

    cmp_ = sub.add_parser("compare", help="read both arms and call it")
    cmp_.add_argument("--arm", action="append", required=True)
    cmp_.add_argument("--period")
    cmp_.set_defaults(func=cmd_compare)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
