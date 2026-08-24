#!/usr/bin/env python3
"""
The whole outbound motion in one command.

    G2 categories -> domains in the review band
        -> LinkFinder: a decision maker and a verified email
        -> Instantly: leads pushed with the merge fields the copy needs
        -> a resumable state file, so nothing is paid for twice

    python3 outbound/run_pipeline.py --campaign df17f3eb-... --target 50

CHECK CAPACITY BEFORE SPENDING CREDITS
--------------------------------------
The obvious order is source, enrich, upload. It is wrong, and it cost us a
real afternoon: the Instantly workspace was over its lead cap, so every
upload would have 403'd -- but only *after* LinkFinder had already been paid
for the enrichment. Credits spent, nothing to show.

So this runs the cheap failing checks first. It asks Instantly how much room
is left, and refuses to enrich more leads than it can actually upload.
Sourcing is free, enrichment is not, sending is what we are here for -- so
the order is capacity, source, enrich, push.

THE PROVIDER LIES ABOUT BEING UP
--------------------------------
LinkFinder's employee lookup answers HTTP 200 / "success" with a status
message where a person should be:

    {"personId": null, "name": "We are on maintenance. Check back in 48hrs"}

Measured across a session it comes back for roughly half of all calls,
interleaved with good answers seconds apart -- so one sentinel means retry,
not outage. Three domains in a row exhausting their retries does mean
outage, and then the run stops instead of quietly writing off every
remaining company as one nobody works at.

STATE
-----
--state (default outbound/pipeline_state.json) records every domain already
resolved, pushed, or given up on, with the reason. Re-running skips them.
Kill it mid-run and start again; it picks up where it stopped.

SECRETS -- from the environment, never from a file in this repo
---------------------------------------------------------------
    G2_API_TOKEN
    LINKFINDER_API_KEY
    INSTANTLY_API_KEY
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

G2_API = "https://data.g2.com/api/v2"
LINKFINDER_API = "https://api.linkfinderai.com"
INSTANTLY_LEADS = "https://api.instantly.ai/api/v2/leads"
INSTANTLY_PLAN = "https://api.instantly.ai/api/v2/workspaces/current/plan"

TARGET_SENIORITY = ["founder", "owner", "c_suite", "vp", "head"]

OUTAGE_MARKERS = ("maintenance", "check back in", "we improve the actor",
                  "contact us if you are having")
OUTAGE_RETRIES = 3
OUTAGE_BACKOFF = 4.0
DOWN_STREAK_ABORT = 3

# Competitors, and companies selling the outcome we sell. Both turn up in
# exactly the GTM and marketing categories this sweep targets.
EXCLUDE_DOMAIN = {
    "linkfinderai.com",
    "clay.com", "warmly.ai", "6sense.com", "apollo.io", "zoominfo.com",
    "lusha.com", "cognism.com", "hunter.io", "snov.io", "rocketreach.co",
    "seamless.ai", "uplead.com", "findymail.com", "dropcontact.com",
    "kaspr.io", "surfe.com", "prospeo.io", "anymailfinder.com",
    "tryprofound.com", "peec.ai", "otterly.ai", "athenahq.ai",
    "scrunchai.com", "goodie.ai", "brandlight.ai",
}

EXCLUDE_CATEGORY = ("consulting", "services", "agencies", "providers",
                    "outsourcing", "staffing", "recruiting firms", "resellers",
                    "hardware", "hospital", "government", "k-12",
                    "higher education")


class ProviderDown(RuntimeError):
    """Answered, but with a status message instead of data."""


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def _req(url, token_header, payload=None, timeout=60):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json", **token_header},
        method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} from {url}: {e.read().decode()[:200]}") from None
    except Exception as e:
        raise RuntimeError(f"{type(e).__name__} calling {url}: {e}") from None


# ---------------------------------------------------------------------------
# 1. capacity  — the cheap check that has to come first
# ---------------------------------------------------------------------------

def instantly_room(key):
    """How many more leads this workspace will accept. Negative means over."""
    body = _req(INSTANTLY_PLAN, {"Authorization": f"Bearer {key}"})
    sub = (body.get("subscriptions") or {}).get("outreach") or body
    limit = sub.get("total_lead_limit")
    used = sub.get("current_lead_count")
    if limit is None or used is None:
        return None  # unknown shape; caller decides whether to risk it
    return limit - used


# ---------------------------------------------------------------------------
# 2. source  — free, so it runs before anything metered
# ---------------------------------------------------------------------------

def g2_categories(token, sleep):
    cursor = None
    while True:
        p = {"fields[categories]": "name,slug", "page[size]": 100}
        if cursor:
            p["page[after]"] = cursor
        page = _req(f"{G2_API}/categories?{urllib.parse.urlencode(p, doseq=True)}",
                    {"Authorization": f"Bearer {token}",
                     "Content-Type": "application/vnd.api+json"})
        for c in page.get("data", []):
            yield c["attributes"]["name"], c["attributes"]["slug"]
        nxt = (page.get("links") or {}).get("next")
        if not nxt:
            return
        cursor = urllib.parse.parse_qs(urllib.parse.urlparse(nxt).query)["page[after]"][0]
        time.sleep(sleep)


def g2_products(token, slug):
    page = _req(f"{G2_API}/categories/{slug}?include=products",
                {"Authorization": f"Bearer {token}",
                 "Content-Type": "application/vnd.api+json"})
    out = []
    for inc in page.get("included", []):
        if inc.get("type") != "products":
            continue
        a = inc.get("attributes") or {}
        if a.get("domain"):
            out.append({"domain": a["domain"].strip().lower(),
                        "company": a.get("name") or "",
                        "review_count": a.get("review_count") or 0})
    return out


def source(token, lo, hi, want, seen, sleep, log):
    """Category sweep. Narrow categories carry the yield: a broad one's top
    products are its giants, a narrow one's top products are the whole
    category, so a category whose smallest visible product is already above
    the band has no reachable tail and is skipped."""
    found, scanned, skipped = [], 0, 0
    for name, slug in g2_categories(token, sleep):
        if len(found) >= want:
            break
        if any(bad in name.lower() for bad in EXCLUDE_CATEGORY):
            continue
        scanned += 1
        try:
            products = g2_products(token, slug)
        except RuntimeError as e:
            log(f"  ! {slug}: {e}")
            continue
        finally:
            time.sleep(sleep)
        if not products:
            continue
        if min(p["review_count"] for p in products) > hi:
            skipped += 1
            continue
        for p in products:
            d = p["domain"]
            if d in seen or d in EXCLUDE_DOMAIN or any(f["domain"] == d for f in found):
                continue
            if lo <= p["review_count"] <= hi:
                found.append({**p, "category": name})
                if len(found) >= want:
                    break
    log(f"  scanned {scanned} categories, skipped {skipped} with no reachable tail")
    return found


# ---------------------------------------------------------------------------
# 3. enrich  — metered, so it only ever runs on what we can upload
# ---------------------------------------------------------------------------

def lf(key, type_, input_data, **extra):
    return _req(f"{LINKFINDER_API}/api/v1/enrich",
                {"Authorization": f"Bearer {key}"},
                {"type": type_, "input": input_data, **extra})


def unwrap(r):
    while isinstance(r, dict) and "result" in r:
        r = r["result"]
    return r


def outage_row(rows):
    for row in rows:
        if not isinstance(row, dict) or row.get("personId") or row.get("person_id"):
            continue
        n = (row.get("name") or "").lower()
        if any(m in n for m in OUTAGE_MARKERS):
            return n
    return None


def decision_maker(key, domain, sleep=time.sleep, log=print):
    for attempt in range(OUTAGE_RETRIES):
        rows = unwrap(lf(key, "company_domain_to_employees", domain,
                         seniority=",".join(TARGET_SENIORITY), employee_count=5))
        rows = rows if isinstance(rows, list) else (rows or {}).get("employees") or []
        bad = outage_row(rows)
        if not bad:
            break
        if attempt < OUTAGE_RETRIES - 1:
            log(f"    ~ provider flaked, retry {attempt + 1}/{OUTAGE_RETRIES - 1}")
            sleep(OUTAGE_BACKOFF * (attempt + 1))
    else:
        raise ProviderDown(f"employee lookup answered {OUTAGE_RETRIES}x with {bad!r}")

    for row in rows:
        if not isinstance(row, dict):
            continue
        if not (row.get("personId") or row.get("person_id")):
            continue      # the actor's own placeholder rows
        email = (row.get("email") or "").strip()
        name = (row.get("name") or "").strip()
        if not email or "@" not in email or not name:
            continue
        parts = name.split()
        return {"email": email, "first_name": parts[0],
                "last_name": " ".join(parts[1:]),
                "title": row.get("jobTitle") or row.get("job_title") or ""}
    return None


# ---------------------------------------------------------------------------
# 4. push
# ---------------------------------------------------------------------------

def push(key, campaign, lead):
    """Every merge field the copy uses travels with the lead. A lead missing
    category or reviewCount renders a broken first line, so it never ships."""
    return _req(INSTANTLY_LEADS, {"Authorization": f"Bearer {key}"}, {
        "campaign": campaign,
        "email": lead["email"],
        "first_name": lead["first_name"],
        "last_name": lead["last_name"],
        "company_name": lead["company"],
        "website": lead["domain"],
        "skip_if_in_workspace": True,
        "custom_variables": {"category": lead["category"],
                             "reviewCount": str(lead["review_count"]),
                             "title": lead.get("title", "")},
    })


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--campaign", required=True, help="Instantly campaign id")
    ap.add_argument("--target", type=int, default=25, help="leads to land this run")
    ap.add_argument("--min-reviews", type=int, default=10)
    ap.add_argument("--max-reviews", type=int, default=250)
    ap.add_argument("--state", default="outbound/pipeline_state.json")
    ap.add_argument("--sleep", type=float, default=0.5)
    ap.add_argument("--ignore-capacity", action="store_true",
                    help="Enrich even when Instantly reports no room. You will "
                         "pay for leads you cannot upload.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Source only. Spends nothing, uploads nothing.")
    args = ap.parse_args()

    def log(m): print(m, flush=True)

    g2k = os.environ.get("G2_API_TOKEN")
    lfk = os.environ.get("LINKFINDER_API_KEY")
    ink = os.environ.get("INSTANTLY_API_KEY")
    if not g2k:
        sys.exit("Set G2_API_TOKEN. Never put it in a file in this repo.")
    if not args.dry_run and not (lfk and ink):
        sys.exit("Set LINKFINDER_API_KEY and INSTANTLY_API_KEY, or pass --dry-run.")

    state = {"done": {}}
    if os.path.exists(args.state):
        state = json.load(open(args.state))
    done = state.setdefault("done", {})

    def save():
        os.makedirs(os.path.dirname(args.state) or ".", exist_ok=True)
        json.dump(state, open(args.state, "w"), indent=1)

    want = args.target
    if not args.dry_run:
        room = instantly_room(ink)
        if room is None:
            log("! could not read the lead limit; continuing on your say-so")
        elif room <= 0:
            msg = (f"Instantly has no room: {-room} leads over the cap. "
                   f"Enriching now would spend credits on leads that cannot "
                   f"be uploaded.")
            if not args.ignore_capacity:
                sys.exit(msg + " Free space first, or pass --ignore-capacity.")
            log("! " + msg + " Continuing because --ignore-capacity was passed.")
        elif room < want:
            log(f"! only room for {room} more leads, lowering the target from {want}")
            want = room

    log(f"\nsourcing up to {want} domains from G2 "
        f"(reviews {args.min_reviews}-{args.max_reviews})")
    candidates = source(g2k, args.min_reviews, args.max_reviews, want,
                        set(done), args.sleep, log)
    log(f"  {len(candidates)} candidates\n")

    if args.dry_run:
        for c in candidates:
            log(f"  {c['domain']:28} {c['review_count']:>5}  {c['category']}")
        log(f"\n[dry-run] nothing enriched, nothing uploaded.")
        return

    pushed = streak = 0
    tally = {"no_person": 0, "push_failed": 0, "down": 0}
    for c in candidates:
        d = c["domain"]
        log(f"  · {d} ({c['category']}, {c['review_count']} reviews)")
        try:
            person = decision_maker(lfk, d, log=log)
        except ProviderDown as e:
            streak += 1
            tally["down"] += 1
            log(f"    ! {e}")
            if streak >= DOWN_STREAK_ABORT:
                log(f"\n!! {streak} domains in a row. Stopping with {pushed} "
                    f"pushed; nothing was burned, re-run when it recovers.")
                break
            continue
        streak = 0

        if not person:
            done[d] = "no_person"
            tally["no_person"] += 1
            log("    - no reachable decision maker")
            save()
            continue

        try:
            push(ink, args.campaign, {**c, **person})
        except RuntimeError as e:
            tally["push_failed"] += 1
            log(f"    ! push failed: {e}")
            continue          # not marked done, so a re-run retries it

        done[d] = person["email"]
        pushed += 1
        save()
        log(f"    ✓ {person['email']}  ({person['title'] or 'no title'})")
        time.sleep(args.sleep)

    save()
    log(f"\n{pushed} pushed to campaign {args.campaign}")
    log(f"skipped: {tally['no_person']} no person, "
        f"{tally['push_failed']} push failed, {tally['down']} provider down")
    log(f"state: {args.state}")


if __name__ == "__main__":
    main()
