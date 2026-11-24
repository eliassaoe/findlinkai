"""Affiliate recruitment through Explee: website domains -> one decision-maker each
-> email -> a new AutoGTM campaign with an affiliate pitch.

The domains come from AffiliateFinder (sites that already write about B2B data
tools: listicles, reviews, "alternatives" pages). AffiliateFinder can only email
people it enriched itself, so the sites it had no credits left for go out here.

    python3 affiliate_sites.py --domains-file doms.txt            # dry run: cost, balance
    python3 affiliate_sites.py --domains-file doms.txt --apply    # search, enrich, import

Nothing personal is printed or written to the repo: only counts. The campaign is
created *Not started* in Explee, so the owner can read it before it sends.

Cost (Explee prices, README): 1 credit per person found, 1.5 per email found.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from explee import Explee, ExpleeError, first_of  # noqa: E402
from prequalify import as_lead, fill_emails  # noqa: E402

PROJECT = 37934  # linkfinderai-outbound: sells the tool. 30475 is left alone.

TITLES = ["Founder", "Co-Founder", "Owner", "CEO", "Editor", "Editor in Chief",
          "Managing Editor", "Head of Content", "Content Manager", "Partnerships Manager",
          "Head of Partnerships", "Affiliate Manager", "Marketing Manager", "Publisher"]

BRIEF = {
    "language": "en-US",
    "instructions": (
        "This is an affiliate recruitment email, not a sales pitch. The recipient runs a "
        "website that publishes content about B2B sales, lead generation, data enrichment or "
        "AI tools (listicles, reviews, 'alternatives' pages). Open with one specific line "
        "about their site and the kind of tools they cover. Then: LinkFinder AI "
        "turns a LinkedIn URL, a name + company, or a whole CSV into "
        "verified work emails and phone numbers. We would like them as an affiliate: 25% of "
        "every payment, recurring on every renewal, for every customer they send, up to $500 "
        "per referred customer; 90-day cookie; commission confirmed 30 days after each "
        "payment, paid monthly by PayPal once they are owed $50; a dashboard with clicks, "
        "signups and earnings. We give free credits so they can test LinkFinder AI before "
        "writing about it. No link in this first email. Ask one easy "
        "question: would they be open to adding LinkFinder AI to a relevant page? Plain text, "
        "under 120 words, no hype, never 'simply', 'just' or 'easily'. Never invent facts "
        "about their site or traffic."),
    "followup_instructions": (
        "Short, friendly follow-ups (under 60 words). Follow-up 1: offer to send free test "
        "credits right away so they can try it on their own list, and offer to send the affiliate signup link if they reply. Never put a URL in the email. "
        "Follow-up 2: mention one "
        "concrete angle for their content (e.g. LinkFinder AI as a cheaper alternative in a "
        "lead-data or email-finder roundup) and the 25% recurring commission. Last one: "
        "close the loop politely. Never invent facts."),
}


def read_domains(path):
    seen, out = set(), []
    with open(path) as fh:
        for token in fh.read().split():
            d = token.strip().lower().removeprefix("https://").removeprefix("http://")
            d = d.removeprefix("www.").strip("/")
            if d and "." in d and d not in seen:
                seen.add(d)
                out.append(d)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--domains-file", required=True)
    ap.add_argument("--name", default="Affiliates - B2B tool review sites (AffiliateFinder)")
    ap.add_argument("--per-company", type=int, default=1)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)

    domains = read_domains(args.domains_file)
    print("{} domains, {} person each, project {}".format(len(domains), args.per_company,
                                                         PROJECT))
    api = Explee()
    try:
        print("Explee balance: ${:.2f}".format(api.balance()))
    except ExpleeError as err:
        print("balance check failed: {}".format(err.status))
    worst = len(domains) * args.per_company * 2.5 / 100
    print("worst case: {} people + {} emails = ${:.2f}".format(
        len(domains) * args.per_company, len(domains) * args.per_company, worst))
    if not args.apply:
        print("DRY RUN - add --apply")
        return 0

    people = []
    for start in range(0, len(domains), 1000):
        got = api.people_by_domains(domains[start:start + 1000], TITLES, args.per_company)
        people.extend(first_of(got, "people", "results", "contacts", default=[]) or [])
    leads, seen = [], set()
    for person in people:
        lead = {k: v for k, v in as_lead(person).items() if not k.startswith("_")}
        key = (lead["first_name"], lead["last_name"], lead["company_domain"])
        if lead["first_name"] and key not in seen:
            seen.add(key)
            leads.append(lead)
    covered = len({l["company_domain"] for l in leads})
    print("people found: {} across {} of {} domains".format(len(leads), covered, len(domains)))

    found, missing = fill_emails(api, leads)
    with_email = [l for l in leads if l["email"]]
    print("emails: {} already had one, {} of {} enriched -> {} sendable".format(
        len(leads) - missing, found, missing, len(with_email)))
    if not with_email:
        print("nothing to import")
        return 1

    task = api.import_campaign(PROJECT, args.name, with_email,
                               instructions=BRIEF["instructions"],
                               followup_instructions=BRIEF["followup_instructions"],
                               language=BRIEF["language"])
    task_id = first_of(task, "task_id", "id")
    for _ in range(120):
        got = api.import_status(task_id)
        status = first_of(got, "status", default=first_of(
            first_of(got, "meta", default={}), "status", default="pending"))
        if status in ("completed", "failed"):
            break
        time.sleep(5)
    if status != "completed":
        print("import {}: {}".format(status, first_of(got, "error", default="?")))
        return 1
    result = first_of(got, "result", default={})
    print("campaign {} created (Not started) with {} leads submitted".format(
        first_of(result, "campaign_id", default="?"), len(with_email)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
