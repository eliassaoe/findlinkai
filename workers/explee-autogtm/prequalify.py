#!/usr/bin/env python3
"""Change 2: score the leads before a single email goes out.

    python3 prequalify.py plan   --campaign 127292 --out prequalify.json       # free
    python3 prequalify.py search --plan prequalify.json --max-people 1000 \\
                                 --min-score 4 --out qualified.leads.json --apply
    python3 prequalify.py import --plan prequalify.json --leads qualified.leads.json --apply
    python3 leadsource_test.py compare --arm source.arm.json --arm qualified.arm.json \\
                                 --period 30d            # two weeks later

WHAT THIS BUYS, AND WHAT IT DOES NOT
------------------------------------
AutoGTM finds leads on firmographics and writes to all of them. Explee's search
API can do one thing the campaign cannot: score each person 0-5 against your
own criteria, with a reason, for 0.1 credit a criterion. So instead of paying
$0.12 of sends to find out a lead was never a fit, pay a tenth of a cent to
find out first and only import the ones that score.

It is a test, not a fact. The campaign already carries positive and negative
criteria and Explee applies them in its own way; this gates harder and on
explicit scores. Whether that lifts the reply rate is exactly what `compare`
decides, on the same brief, in the same project, over the same days - the
import writes both arm files so the existing verdict gates apply unchanged.

WHAT IT COSTS
-------------
    search    1 credit a person + 0.1 per criterion, first 100 free
    email     1.5 credits per email FOUND, for the qualified people the search
              returned without one (0 when not found)
    import    free; sending is billed as usual once the campaign is live

1,000 people on 4 criteria is about $12.60 of search and at most $15 of
emails. `search` prints the worst case and spends nothing without --apply.
"""

import argparse
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

from explee import Explee, ExpleeError, ShapeError, first_of
from leadsource_test import brief_sha, clean_leads, lead_key
import state

HERE = Path(__file__).resolve().parent
MAX_CRITERIA = 5             # each one is +10% on the search bill; five is plenty
MIN_SCORE = 4                # of 5, on every criterion
PAGE = 100                   # people per search request
SEARCH_CREDIT = 1.0
CRITERION_CREDIT = 0.1
FREE_ZONE = 100
EMAIL_CREDIT = {"basic": 1.5, "premium": 5.0}


# --- the plan: from the campaign's own definition ------------------------------
def as_list(value):
    """positive_criteria may be a list, or one string with lines / semicolons."""
    if not value:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    parts = re.split(r"[\n;]+|(?:^|\s)[-*•]\s+", str(value))
    return [p.strip(" -*•\t") for p in parts if p.strip(" -*•\t")]


def _tidy(items):
    return [re.sub(r"^[\s\-*•]+", "", str(i)).strip() for i in items if str(i).strip()]


def describe_target(definition):
    """The campaign's targeting as one plain-English query for nl-to-filters."""
    role = first_of(definition, "target_role", default="") or ""
    size = first_of(definition, "target_company_size", default="") or ""
    geo = first_of(definition, "target_geography", default="") or ""
    keywords = as_list(first_of(definition, "keywords", default=[]))
    bits = [role.strip() or "decision makers"]
    if size:
        bits.append("at companies of {}".format(size.strip()))
    if keywords:
        bits.append("in {}".format(", ".join(keywords[:6])))
    if geo:
        bits.append("in {}".format(geo.strip()))
    return " ".join(bits)


def criteria_from(definition, cap=MAX_CRITERIA):
    """Positive criteria as they are; negative ones phrased so a HIGH score means safe."""
    out = _tidy(as_list(first_of(definition, "positive_criteria", default=[])))
    for neg in _tidy(as_list(first_of(definition, "negative_criteria", default=[]))):
        out.append("Is NOT the following: {}".format(neg))
    problem = first_of(definition, "customer_problem", default="")
    if not out and problem:
        out.append("Likely has this problem: {}".format(str(problem).strip()))
    return out[:cap]


def search_cost(people, criteria, preset="basic"):
    """Worst case in credits: (search + scoring) on the billable people, then an
    email found for every one of them."""
    billable = max(people - FREE_ZONE, 0)
    search = billable * (SEARCH_CREDIT + CRITERION_CREDIT * len(criteria))
    emails = people * EMAIL_CREDIT[preset]
    return search, emails


def cmd_plan(args):
    api = Explee()
    definition = api.campaign(args.campaign)
    if first_of(definition, "targeting_editable", default=True) is False:
        print("!! this campaign runs on an imported list - its targeting fields are empty. "
              "Pick the campaign whose audience you want to pre-qualify.")
    query = args.query or describe_target(definition)
    got = api.nl_to_filters(query)
    plan = {
        "campaign_id": args.campaign,
        "project_id": first_of(definition, "project_id"),
        "name": first_of(definition, "name", default=str(args.campaign)),
        "query": query,
        "company_filters": first_of(got, "companies_filters", "company_filters", default={}),
        "people_filters": first_of(got, "people_filters", default={}),
        "criteria": criteria_from(definition),
        "brief": {
            "instructions": first_of(definition, "instructions", default="") or "",
            "followup_instructions": first_of(definition, "followup_instructions",
                                              default="") or "",
            "language": first_of(definition, "language", default="en") or "en",
        },
    }
    plan["brief_sha"] = brief_sha(plan["brief"])
    Path(args.out).write_text(json.dumps(plan, indent=1, ensure_ascii=False))
    print(json.dumps({k: plan[k] for k in ("query", "company_filters", "people_filters",
                                            "criteria")}, indent=1, ensure_ascii=False))
    print("\n-> {}".format(args.out))
    if not plan["criteria"]:
        print("!! the campaign has no positive/negative criteria, so there is nothing to score "
              "on. Add them to the campaign (PATCH positive_criteria) or edit the plan file.")
    if not plan["brief"]["instructions"]:
        print("!! the campaign has no first-email brief of its own; the import will run on "
              "the project description. Both arms then share it, which is still a fair test.")
    search, emails = search_cost(1000, plan["criteria"])
    print("Per 1,000 people: {:.0f} credits of search (${:.2f}) + up to {:.0f} of emails "
          "(${:.2f}). Read the filters above before spending it.".format(
              search, search / 100, emails, emails / 100))
    return 0


# --- the search: score, gate, fill the emails ----------------------------------
def scores_of(person):
    """Every criterion score on one person, as ints. Raises if there are none."""
    raw = first_of(person, "criteria", "criteria_scores", "scores", "enrichment",
                   "ai_enrichment", default=None)
    if raw is None:
        raise ShapeError("no criteria scores on this person. Keys: {}. Add the spelling to "
                         "scores_of() in prequalify.py.".format(sorted(person)))
    if isinstance(raw, dict):
        raw = list(raw.values())
    out = []
    for item in raw:
        if isinstance(item, dict):
            out.append(int(first_of(item, "score", "value", "rating")))
        else:
            out.append(int(item))
    return out


def qualifies(person, min_score=MIN_SCORE):
    scores = scores_of(person)
    return bool(scores) and min(scores) >= min_score


def as_lead(person):
    return {"email": str(first_of(person, "email", "work_email", default="") or "").strip(),
            "first_name": first_of(person, "first_name", default=""),
            "last_name": first_of(person, "last_name", default=""),
            "company_domain": first_of(person, "company_domain", "domain", default=""),
            "job_title": first_of(person, "job_title", "title", default=""),
            "linkedin_url": first_of(person, "linkedin_url", default="") or "",
            "_scores": scores_of(person)}


def search_pages(api, plan, max_people, page=PAGE):
    """Every page of the people search up to max_people. Paging is limit/offset,
    the same convention as the inbox endpoints; a page shorter than `limit` ends it."""
    body = {"company_filters": plan.get("company_filters") or {},
            "people_filters": dict(plan.get("people_filters") or {},
                                   criteria=list(plan["criteria"]))}
    out, offset = [], 0
    while len(out) < max_people:
        limit = min(page, max_people - len(out))
        got = api.search_people(dict(body, limit=limit, offset=offset))
        rows = first_of(got, "people", "results", "contacts", "items", default=[]) or []
        if not rows:
            break
        out.extend(rows)
        if len(rows) < limit:
            break
        offset += len(rows)
    return out[:max_people]


def fill_emails(api, leads, preset="basic", out=sys.stdout, sleep=time.sleep):
    """Batch-enrich the qualified leads that came back without an email."""
    missing = [l for l in leads if not l["email"]]
    for start in range(0, len(missing), 100):
        chunk = missing[start:start + 100]
        task = api.enrich_email_batch(
            [{"first_name": l["first_name"], "last_name": l["last_name"],
              "company_domain": l["company_domain"]} for l in chunk], preset=preset)
        task_id = first_of(task, "task_id", "id")
        while True:
            got = api.enrich_email_batch_status(task_id)
            meta = first_of(got, "meta", default={})
            status = first_of(meta, "status", default="pending")
            if status == "completed":
                break
            if status == "failed":
                print("  !! batch {} failed: {}".format(
                    task_id, first_of(meta, "error", default="?")), file=out)
                got = {"contacts": []}
                break
            sleep(3)
        for lead, contact in zip(chunk, first_of(got, "contacts", default=[]) or []):
            email = first_of(contact, "email", default="") if isinstance(contact, dict) else ""
            if email:
                lead["email"] = str(email).strip()
    return sum(1 for l in missing if l["email"]), len(missing)


def cmd_search(args):
    plan = json.loads(Path(args.plan).read_text())
    if not plan.get("criteria"):
        raise SystemExit("the plan has no criteria - nothing to score on. Edit {} first."
                         .format(args.plan))
    search, emails = search_cost(args.max_people, plan["criteria"], args.preset)
    print("{} people max, {} criteria, gate: every score >= {}".format(
        args.max_people, len(plan["criteria"]), args.min_score))
    print("worst case {:.0f} credits of search (${:.2f}) + up to {:.0f} of emails (${:.2f})"
          .format(search, search / 100, emails, emails / 100))
    base = {"source_name": plan.get("name"), "source_campaign": plan.get("campaign_id"),
            "criteria": plan["criteria"], "min_score": args.min_score,
            "max_people": args.max_people, "worst_case_credits": search + emails}
    if not args.apply:
        print("DRY RUN - nothing spent. Add --apply.")
        state.record("prequalify", "{}: would search {} people on {} criteria, worst case "
                     "{:.0f} credits".format(plan.get("name"), args.max_people,
                                              len(plan["criteria"]), search + emails),
                     False, section="prequalify", payload=base)
        return 0

    api = Explee()
    require_balance(api, search + (0 if args.no_enrich else emails))
    people = search_pages(api, plan, args.max_people)
    print("{} people returned".format(len(people)))
    if not people:
        raise SystemExit("the search returned nobody - loosen the filters in the plan")

    leads, histogram = [], {}
    for person in people:
        scores = scores_of(person)
        low = min(scores) if scores else 0
        histogram[low] = histogram.get(low, 0) + 1
        if scores and low >= args.min_score:
            leads.append(as_lead(person))
    print("lowest score per person: " + "  ".join(
        "{}: {}".format(k, histogram[k]) for k in sorted(histogram)))
    print("{} of {} qualify ({:.0%})".format(len(leads), len(people),
                                             len(leads) / len(people)))
    if not args.no_enrich:
        found, asked = fill_emails(api, leads, args.preset)
        print("emails: {} of {} missing ones found".format(found, asked))
    usable, dropped = clean_leads(leads)
    scores = {lead_key(l): l["_scores"] for l in leads}
    for cleaned in usable:
        cleaned["_scores"] = scores.get(lead_key(cleaned), [])
    Path(args.out).write_text(json.dumps(usable, indent=1, ensure_ascii=False))
    print("{} import-ready leads -> {}".format(len(usable), args.out))
    for reason, count in sorted(dropped.items(), key=lambda kv: -kv[1]):
        print("  dropped {:>5}  {}".format(count, reason))
    state.record("prequalify", "{}: {} searched, {} qualified, {} import-ready".format(
        plan.get("name"), len(people), len(leads), len(usable)), True,
        section="prequalify", balance=api.last_balance,
        payload=dict(base, searched=len(people), qualified=len(leads), usable=len(usable),
                     histogram={str(k): v for k, v in histogram.items()},
                     dropped=dropped))
    return 0


# --- the import: same brief, same project, both arm files --------------------
def cmd_import(args):
    plan = json.loads(Path(args.plan).read_text())
    raw = json.loads(Path(args.leads).read_text())
    leads = [{k: v for k, v in lead.items() if not k.startswith("_")} for lead in raw]
    name = args.name or "{} - prequalified".format(plan["name"])
    print("{} leads into project {} as {!r}, brief {}".format(
        len(leads), plan["project_id"], name, plan["brief_sha"]))
    if not args.apply:
        print("DRY RUN - nothing imported. Add --apply.")
        return 0

    api = Explee()
    require_balance(api, 0)
    brief = plan["brief"]
    task = api.import_campaign(plan["project_id"], name, leads,
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
    campaign_id = first_of(first_of(got, "result", default={}), "campaign_id", default=None)
    if not campaign_id:
        raise SystemExit("no leads survived validation and dedup - no campaign was created")

    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    Path(args.out).write_text(json.dumps({
        "arm": name, "campaign_id": campaign_id, "project_id": plan["project_id"],
        "leads_submitted": len(leads), "brief_sha": plan["brief_sha"],
        "imported_at": stamp}, indent=1))
    Path(args.control_out).write_text(json.dumps({
        "arm": plan["name"], "campaign_id": plan["campaign_id"],
        "project_id": plan["project_id"], "brief_sha": plan["brief_sha"],
        "live_campaign": True, "adopted_at": stamp}, indent=1))
    print("campaign {} -> {}\ncontrol arm -> {}".format(campaign_id, args.out,
                                                        args.control_out))
    print("In two weeks: python3 leadsource_test.py compare --arm {} --arm {} --period 30d"
          .format(args.control_out, args.out))
    data = state.load()
    section = dict(data.get("prequalify") or {}, campaign_id=campaign_id, campaign_name=name,
                   leads_submitted=len(leads),
                   compare_after=(dt.date.today() + dt.timedelta(days=14)).isoformat())
    state.record("prequalify import", "{} leads -> campaign {} ({!r})".format(
        len(leads), campaign_id, name), True, section="prequalify", payload=section,
        balance=api.last_balance)
    return 0


def require_balance(api, needed):
    balance = api.balance()
    api.last_balance = balance
    if balance <= 0:
        raise SystemExit("balance is {} credits - every request needs a positive balance, "
                         "free ones included. Top up at https://explee.com/billing".format(
                             balance))
    if balance < needed:
        raise SystemExit("balance is {:.0f} credits and the worst case here is {:.0f}. Top up "
                         "or lower --max-people.".format(balance, needed))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    plan = sub.add_parser("plan", help="campaign definition -> filters + criteria (free)")
    plan.add_argument("--campaign", type=int, required=True)
    plan.add_argument("--query", help="override the plain-English targeting")
    plan.add_argument("--out", default="prequalify.json")
    plan.set_defaults(func=cmd_plan)

    search = sub.add_parser("search", help="search, score, keep the ones that pass")
    search.add_argument("--plan", default="prequalify.json")
    search.add_argument("--max-people", type=int, default=1000)
    search.add_argument("--min-score", type=int, default=MIN_SCORE)
    search.add_argument("--preset", choices=sorted(EMAIL_CREDIT), default="basic")
    search.add_argument("--no-enrich", action="store_true",
                        help="keep only people the search returned with an email")
    search.add_argument("--out", default="qualified.leads.json")
    search.add_argument("--apply", action="store_true", help="actually spend. Off by default.")
    search.set_defaults(func=cmd_search)

    imp = sub.add_parser("import", help="the qualified leads -> a new campaign, same brief")
    imp.add_argument("--plan", default="prequalify.json")
    imp.add_argument("--leads", default="qualified.leads.json")
    imp.add_argument("--name")
    imp.add_argument("--out", default="qualified.arm.json")
    imp.add_argument("--control-out", default="source.arm.json")
    imp.add_argument("--apply", action="store_true")
    imp.set_defaults(func=cmd_import)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ExpleeError as exc:
        print("HTTP {} {}\n{}".format(exc.status, exc.path, exc.body), file=sys.stderr)
        sys.exit(1)
