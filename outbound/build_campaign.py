#!/usr/bin/env python3
"""
Builds the SEO/AEO cold campaign: domains in, send-ready rows out.

    domains.csv
        -> LinkFinder: decision maker at each company
        -> LinkFinder: their email
        -> LLM: "best <category> tool" - is the prospect named? who is?
        -> composed email
        -> instantly_import.csv

THE ONE RULE THIS FILE ENFORCES
-------------------------------
The email tells the reader "I asked ChatGPT and Perplexity for the best X tool
and you weren't named". That is a claim about something we did. So this script
actually does it, per prospect, and **skips anyone whose check fails** rather
than inventing an answer. There is deliberately no code path that produces a
competitor name without a model returning it.

Beyond it being false, a fabricated competitor is the specific thing that loses
this deal: name a company that is not actually a competitor and the technical
buyer you are pitching stops reading. The real answer is also just better copy.

COST
----
Per prospect: 1 company_domain_to_employees (1 credit) + 1
linkedin_profile_to_email (10 credits) + ~1 LLM call. So ~11 credits and a
fraction of a cent. 200 prospects is ~2,200 credits.

SECRETS
-------
From the environment, never from a file in this repo:
    LINKFINDER_API_KEY      your own key from the dashboard
    OPENROUTER_API_KEY      or set --llm-provider openai and OPENAI_API_KEY
    INSTANTLY_API_KEY       only needed with --instantly-campaign
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

LINKFINDER_API = "https://api.linkfinderai.com"
INSTANTLY_API = "https://api.instantly.ai/api/v2/leads"
OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions"
OPENAI_API = "https://api.openai.com/v1/chat/completions"

# Who we want to reach. Founders answer their own mail; heads of marketing own
# the budget. Anyone below that forwards it into a void.
TARGET_SENIORITY = ["founder", "owner", "c_suite", "vp", "head"]

DEFAULT_MODEL = "openai/gpt-4o-mini"


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

class ProviderDown(RuntimeError):
    """The data provider answered, but with a status message instead of data.
    Distinct from RuntimeError so the main loop can abort instead of counting
    the domain as a miss."""


def _post(url, payload, headers, timeout=60):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        raise RuntimeError(f"HTTP {e.code} from {url}: {body}") from None
    except Exception as e:
        raise RuntimeError(f"{type(e).__name__} calling {url}: {e}") from None


# ---------------------------------------------------------------------------
# LinkFinder
# ---------------------------------------------------------------------------

def lf_call(api_key, type_, input_data, **extra):
    return _post(
        LINKFINDER_API,
        {"type": type_, "input_data": input_data, **extra},
        {"Authorization": f"Bearer {api_key}"},
    )


def unwrap(r):
    """A single lookup returns {"result": <value>, "status": ...} and `result`
    can itself be wrapped. Recurse on `result` regardless of siblings."""
    while isinstance(r, dict) and "result" in r:
        r = r["result"]
    return r


# The Apify actor behind the employee lookup answers with HTTP 200 and
# status "success" even when it is down, putting its own status message in
# a row where a person should be. Every field is null except `name`. Two
# kinds show up and they mean opposite things:
#
#   "No Leads found. Tweak your filters"   -> a real, empty answer
#   "We are on maintenance..."             -> the provider is down
#
# The personId guard below drops both, which is correct per-row. But an
# outage drops EVERY row of EVERY domain, and the run then prints "no
# decision maker found" a hundred times and exits looking like an honest
# zero-yield sweep over a bad list. That is the failure worth shouting
# about: the list was fine, the provider was not.
OUTAGE_MARKERS = ("maintenance", "check back in", "we improve the actor",
                  "contact us if you are having")


def provider_outage(rows):
    """True when the actor answered with a status message, not an answer."""
    for row in rows:
        if not isinstance(row, dict) or row.get("personId") or row.get("person_id"):
            continue
        name = (row.get("name") or "").lower()
        if any(m in name for m in OUTAGE_MARKERS):
            return name
    return None


def find_decision_maker(api_key, domain):
    """Cheapest useful person at a domain. 1 credit regardless of list size."""
    data = unwrap(lf_call(api_key, "company_domain_to_employees", domain,
                          seniority=",".join(TARGET_SENIORITY), employee_count=5))
    rows = data if isinstance(data, list) else (data or {}).get("employees") or []
    outage = provider_outage(rows)
    if outage:
        # Not "this company has nobody". Stop the run rather than write off
        # every remaining domain as unreachable.
        raise ProviderDown(f"employee lookup is down, it answered: {outage!r}")
    for row in rows:
        if not isinstance(row, dict):
            continue
        # The Apify actor behind this returns its own UI placeholder rows
        # ("No Leads found. Tweak your filters") with every field null but
        # `name`. A real person always has an id. See docs/lead-search-bugs.md.
        if not row.get("personId") and not row.get("person_id"):
            continue
        url = row.get("linkedin_url") or row.get("linkedinUrl") or ""
        name = (row.get("name") or "").strip()
        if not name or "linkedin.com" not in url:
            continue
        first = name.split()[0]
        return {"name": name, "first_name": first, "linkedin_url": url,
                "title": row.get("job_title") or row.get("title") or ""}
    return None


def find_email(api_key, linkedin_url):
    data = unwrap(lf_call(api_key, "linkedin_profile_to_email", linkedin_url))
    if isinstance(data, str):
        return data.strip() or None
    if isinstance(data, dict):
        for k in ("email", "work_email", "personal_email"):
            v = data.get(k)
            if isinstance(v, str) and "@" in v:
                return v.strip()
    return None


# ---------------------------------------------------------------------------
# The AI visibility check - the claim the email makes, actually performed
# ---------------------------------------------------------------------------

AI_PROMPT = """You are answering a buyer's question, exactly as you normally would.

Question: "What are the best {category} tools?"

List the 8 products you would actually recommend, most recommended first.
Reply with ONLY a JSON array of product names. No prose, no markdown fence.
Example: ["Product A","Product B","Product C"]"""


def ai_visibility(llm_key, provider, model, category, company, domain):
    """Ask a model the buyer's question and read the answer.

    Returns {"named": bool, "competitors": [str, str], "listed": [...]} or None
    when the check could not be completed. None means SKIP THE PROSPECT - the
    caller must never substitute a guess, because the email presents this as
    something we did.
    """
    url = OPENROUTER_API if provider == "openrouter" else OPENAI_API
    try:
        resp = _post(url, {
            "model": model,
            "temperature": 0,
            "messages": [{"role": "user",
                          "content": AI_PROMPT.format(category=category)}],
        }, {"Authorization": f"Bearer {llm_key}"})
        text = resp["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"    ! LLM check failed: {e}", file=sys.stderr)
        return None

    listed = parse_product_list(text)
    if len(listed) < 3:
        # A malformed or empty answer is not evidence of anything.
        print(f"    ! LLM returned {len(listed)} products, not usable", file=sys.stderr)
        return None

    named = is_named(listed, company, domain)
    competitors = [p for p in listed if not same_company(p, company, domain)][:2]
    if len(competitors) < 2:
        return None
    return {"named": named, "competitors": competitors, "listed": listed}


def parse_product_list(text):
    """Models wrap JSON in fences or prose often enough to be worth handling."""
    if not text:
        return []
    m = re.search(r"\[.*?\]", text, re.S)
    if m:
        try:
            arr = json.loads(m.group(0))
            if isinstance(arr, list):
                return [str(x).strip() for x in arr if str(x).strip()]
        except json.JSONDecodeError:
            pass
    lines = []
    for line in text.splitlines():
        line = re.sub(r"^\s*(?:\d+[.)]|[-*])\s*", "", line).strip().strip('",')
        if line and len(line) < 60:
            lines.append(line)
    return lines


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def same_company(product, company, domain):
    """Loose match so 'Acme' / 'Acme.io' / 'Acme CRM' all count as the prospect."""
    brand = norm(domain.split(".")[0]) if domain else ""
    p = norm(product)
    if not p:
        return False
    for target in filter(None, [norm(company), brand]):
        if len(target) < 3:
            continue
        if p == target or p.startswith(target) or target.startswith(p):
            return True
    return False


def is_named(listed, company, domain):
    return any(same_company(p, company, domain) for p in listed)


# ---------------------------------------------------------------------------
# Instantly
# ---------------------------------------------------------------------------

def push_to_instantly(api_key, campaign_id, row):
    """One lead into a campaign.

    The campaign's own sequence holds the copy; what travels here are the
    variables it interpolates. first_name/company_name/website map onto
    Instantly's built-in {{firstName}}/{{companyName}}/{{website}}, and the
    three campaign-specific ones go in custom_variables under the exact keys
    the sequence uses: category, competitor_1, competitor_2.

    Raises on failure rather than returning False - a lead that silently did
    not land is a lead you think you contacted and never did.
    """
    return _post(INSTANTLY_API, {
        "campaign": campaign_id,
        "email": row["email"],
        "first_name": row["first_name"],
        "company_name": row["company_name"],
        "website": row["website"],
        "personalization": row["title"],
        "custom_variables": {
            "category": row["category"],
            "competitor_1": row["competitor_1"],
            "competitor_2": row["competitor_2"],
        },
        # Never re-contact someone already in the workspace.
        "skip_if_in_workspace": True,
    }, {"Authorization": f"Bearer {api_key}"})


# ---------------------------------------------------------------------------
# Compose
# ---------------------------------------------------------------------------

SUBJECT = "you're not in ChatGPT's answer"

BODY = """Hi {first_name},

I asked ChatGPT for the best {category} tools this morning. {c1} and {c2} came up. {company} didn't.

That is usually not a product problem. LLMs cite pages that answer the exact question, and most SaaS sites only have a homepage and a blog - nothing targeting the specific things buyers type.

I fixed this on my own SaaS. 205 pages aimed at exactly those queries: 371 organic visits a month to 11,474 in five months, and referrals now coming from ChatGPT, Gemini, Perplexity, Claude and Copilot.

Want me to send you the list of queries {company} is invisible for?

- Eliasse"""


def compose(prospect, check, category):
    c1, c2 = check["competitors"][0], check["competitors"][1]
    return SUBJECT, BODY.format(first_name=prospect["first_name"], category=category,
                                c1=c1, c2=c2, company=prospect["company"])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def load_seen(path):
    if not path or not os.path.exists(path):
        return set()
    with open(path) as f:
        return {line.strip().lower() for line in f if line.strip()}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", required=True,
                    help="CSV with columns: domain,company,category")
    ap.add_argument("--out", default="outbound/instantly_import.csv")
    ap.add_argument("--log", default="outbound/run_log.jsonl")
    ap.add_argument("--seen", default="outbound/contacted.txt",
                    help="Domains already contacted, one per line; skipped and appended to")
    ap.add_argument("--limit", type=int, default=25,
                    help="Hard cap on prospects processed this run (credit guard)")
    ap.add_argument("--llm-provider", choices=["openrouter", "openai"], default="openrouter")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--sleep", type=float, default=1.0)
    ap.add_argument("--instantly-campaign",
                    help="Campaign id to push leads into. Omit to only write the CSV.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Read fixtures instead of calling any API. Spends nothing.")
    args = ap.parse_args()

    lf_key = os.environ.get("LINKFINDER_API_KEY")
    llm_key = os.environ.get("OPENROUTER_API_KEY" if args.llm_provider == "openrouter"
                             else "OPENAI_API_KEY")
    inst_key = os.environ.get("INSTANTLY_API_KEY")
    if args.instantly_campaign and not args.dry_run and not inst_key:
        sys.exit("--instantly-campaign needs INSTANTLY_API_KEY in the environment.")
    if not args.dry_run and not (lf_key and llm_key):
        sys.exit("Set LINKFINDER_API_KEY and the LLM key in the environment, "
                 "or pass --dry-run. Never put them in a file in this repo.")

    fixtures = {}
    if args.dry_run:
        with open("outbound/fixtures/dry_run.json") as f:
            fixtures = json.load(f)

    with open(args.input) as f:
        rows = [r for r in csv.DictReader(f) if (r.get("domain") or "").strip()]

    seen = load_seen(args.seen)
    rows = [r for r in rows if r["domain"].strip().lower() not in seen]
    if len(rows) > args.limit:
        print(f"{len(rows)} eligible, capping at {args.limit} this run "
              f"(~{args.limit * 11} credits). Raise with --limit.")
        rows = rows[:args.limit]

    out_rows, tally = [], {"sent": 0, "no_person": 0, "no_email": 0,
                           "check_failed": 0, "already_visible": 0}

    with open(args.log, "a") as log:
        for r in rows:
            domain = r["domain"].strip().lower()
            company = (r.get("company") or domain.split(".")[0]).strip()
            category = (r.get("category") or "").strip()
            if not category:
                print(f"  - {domain}: no category column, skipped")
                continue
            print(f"  · {domain} ({category})")

            try:
                if args.dry_run:
                    fx = fixtures.get(domain, {})
                    person = fx.get("person")
                    email = fx.get("email")
                    check = fx.get("check")
                else:
                    person = find_decision_maker(lf_key, domain)
                    if person:
                        time.sleep(args.sleep)
                        email = find_email(lf_key, person["linkedin_url"])
                    else:
                        email = None
                    check = (ai_visibility(llm_key, args.llm_provider, args.model,
                                           category, company, domain)
                             if person and email else None)
            except ProviderDown as e:
                # Every remaining domain would report "no decision maker" for
                # a reason that has nothing to do with the domain. Keep what
                # we have and stop; nothing has been written to --seen yet
                # except rows that actually made it all the way through.
                print(f"\n    !! {e}", file=sys.stderr)
                print(f"    !! stopping with {len(out_rows)} built. "
                      f"Re-run later; no domains were burned.", file=sys.stderr)
                break
            except RuntimeError as e:
                print(f"    ! {e}", file=sys.stderr)
                person = email = check = None

            if not person:
                tally["no_person"] += 1; print("    - no decision maker found"); continue
            if not email:
                tally["no_email"] += 1; print("    - no email found"); continue
            if not check:
                # The email would assert something we did not establish. Skip.
                tally["check_failed"] += 1
                print("    - AI check inconclusive, skipped (never fabricated)")
                continue
            if check["named"]:
                # They are already cited. The opener would be a lie, and they
                # are a weaker prospect anyway.
                tally["already_visible"] += 1
                print(f"    - already named by the model, skipped")
                continue

            person["company"] = company
            subject, body = compose(person, check, category)
            out_rows.append({
                "email": email, "first_name": person["first_name"],
                "company_name": company, "website": domain,
                "title": person["title"], "linkedin_url": person["linkedin_url"],
                "category": category,
                "competitor_1": check["competitors"][0],
                "competitor_2": check["competitors"][1],
                "subject": subject, "body": body,
            })
            log.write(json.dumps({"domain": domain, "email": email,
                                  "listed": check["listed"]}) + "\n")
            tally["sent"] += 1
            print(f"    ✓ {email} — vs {check['competitors'][0]}, {check['competitors'][1]}")
            if not args.dry_run:
                time.sleep(args.sleep)

    if out_rows:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
            w.writeheader(); w.writerows(out_rows)
        if args.seen:
            with open(args.seen, "a") as f:
                for row in out_rows:
                    f.write(row["website"] + "\n")

    pushed = failed_push = 0
    if out_rows and args.instantly_campaign:
        if args.dry_run:
            print(f"\n[dry-run] would push {len(out_rows)} leads to campaign "
                  f"{args.instantly_campaign}")
        else:
            for row in out_rows:
                try:
                    push_to_instantly(inst_key, args.instantly_campaign, row)
                    pushed += 1
                except RuntimeError as e:
                    failed_push += 1
                    print(f"    ! push failed for {row['email']}: {e}", file=sys.stderr)
            print(f"\npushed {pushed} to campaign {args.instantly_campaign}"
                  + (f", {failed_push} FAILED - they are in the CSV, add them by hand"
                     if failed_push else ""))

    print(f"\n{tally['sent']} ready -> {args.out}")
    print(f"skipped: {tally['no_person']} no person, {tally['no_email']} no email, "
          f"{tally['check_failed']} check failed, {tally['already_visible']} already visible")
    if not args.dry_run:
        print(f"credits spent: roughly {(tally['sent'] + tally['check_failed'] + tally['already_visible']) * 11}")


if __name__ == "__main__":
    main()
