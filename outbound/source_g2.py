#!/usr/bin/env python3
"""
Sources prospect domains from the G2 category taxonomy.

    G2 categories (2,287 of them)
        -> top products in each
        -> filter by review_count band
        -> domains.csv  (domain,company,category)

which is exactly what build_campaign.py takes as --input.

WHY G2 AND NOT SEARCH
---------------------
Search only surfaces companies that already rank, which is the precise
opposite of the prospect we want. G2 is a directory: a company is listed
because it paid attention to a directory, not because it ranks. That gives
us the one thing search cannot -- companies that care about being found and
are not yet being found.

THE REVIEW-COUNT BAND IS THE QUALIFIER
--------------------------------------
review_count is a decent proxy for how established a product is.

    < MIN   the listing is a stub; often a dead product or a solo side
            project with no budget for a $1500 engagement
    band    listed, real, funded enough to have reviews, small enough that
            nobody has built them a content engine yet   <- the target
    > MAX   category leader. They have an SEO team. The pitch insults them.

Defaults are 10..250. Tune with --min-reviews / --max-reviews.

THE CATEGORY SHAPE MATTERS MORE THAN THE FILTER
-----------------------------------------------
G2 only exposes the TOP FEW products per category to a buyer account, and
those are ranked -- so broad categories ("CRM") return Salesforce and
HubSpot every time and are a waste of a call. Long-tail categories return
their own small leaders, and that is where the band actually hits. Use
--skip-broad (on by default) to drop categories whose top product is
already above the band, since that marks a category we cannot reach into.

COST
----
Free. G2's API is not metered per call the way LinkFinder is, but it is
rate limited, so --sleep defaults to a polite 0.5s. A full sweep of 2,287
categories takes roughly 25 minutes.

SECRETS
-------
    G2_API_TOKEN    from the environment, never from a file in this repo
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

G2_API = "https://data.g2.com/api/v2"

# Categories whose products are not B2B SaaS we can sell an SEO retainer to.
# Matched as lowercase substrings against the category name.
EXCLUDE_CATEGORY = (
    "consulting", "services", "agencies", "providers", "outsourcing",
    "staffing", "recruiting firms", "resellers", "hardware", "hospital",
    "government", "k-12", "higher education",
)

# Our own SERPs. Selling the system to someone competing for our keywords
# funds a competitor with our own playbook.
# Our own SERPs. Selling the system to someone competing for our keywords
# funds a competitor with our own playbook -- and /linkedin-email-finder is
# the second biggest organic page we have. The G2 taxonomy files these
# companies under GTM and sales categories that otherwise look ideal, so
# they turn up in exactly the sweep we want to run. Clay (225 reviews) and
# Warmly (6) both came back in band on the first pass.
EXCLUDE_DOMAIN = (
    "linkfinderai.com",
    "clay.com", "warmly.ai", "6sense.com", "apollo.io", "zoominfo.com",
    "lusha.com", "cognism.com", "hunter.io", "snov.io", "rocketreach.co",
    "seamless.ai", "uplead.com", "findymail.com", "dropcontact.com",
    "kaspr.io", "surfe.com", "prospeo.io", "anymailfinder.com",
    # And the other side of it: AEO/SEO-visibility platforms sell the same
    # outcome this service does. Profound turned up at 1128 reviews under
    # AI Marketing Agents. Above the band, but a smaller one would not be,
    # and pitching "we get you visible in AI" to a company that sells
    # exactly that is the worst email on the list.
    "tryprofound.com", "peec.ai", "otterly.ai", "athenahq.ai",
    "scrunchai.com", "goodie.ai", "brandlight.ai",
)


def _get(path, params, token, timeout=30):
    url = f"{G2_API}/{path}?{urllib.parse.urlencode(params, doseq=True)}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/vnd.api+json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        raise RuntimeError(f"HTTP {e.code} from {path}: {body}") from None
    except Exception as e:
        raise RuntimeError(f"{type(e).__name__} calling {path}: {e}") from None


def iter_categories(token, sleep):
    """Every category in the taxonomy, cheapest possible fields."""
    cursor = None
    while True:
        params = {"fields[categories]": "name,slug", "page[size]": 100}
        if cursor:
            params["page[after]"] = cursor
        page = _get("categories", params, token)
        for c in page.get("data", []):
            yield c["attributes"]["name"], c["attributes"]["slug"]
        nxt = (page.get("links") or {}).get("next")
        if not nxt:
            return
        cursor = urllib.parse.parse_qs(urllib.parse.urlparse(nxt).query)["page[after]"][0]
        time.sleep(sleep)


def category_products(token, slug):
    """
    Products in one category, with the fields we filter on.

    A buyer-scoped account gets 0 rows from /products, so the category
    include is the only path that returns product attributes. It returns the
    category's top-ranked products only -- that limit is the reason the
    long tail matters.
    """
    page = _get(f"categories/{slug}", {"include": "products"}, token)
    out = []
    for inc in page.get("included", []):
        if inc.get("type") != "products":
            continue
        a = inc.get("attributes") or {}
        if not a.get("domain"):
            continue
        out.append({
            "domain": a["domain"].strip().lower(),
            "company": a.get("name") or "",
            "review_count": a.get("review_count") or 0,
            "star_rating": a.get("star_rating") or 0,
        })
    return out


def category_excluded(name):
    low = name.lower()
    return any(bad in low for bad in EXCLUDE_CATEGORY)


def in_band(product, lo, hi):
    return lo <= product["review_count"] <= hi


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="outbound/domains.csv")
    ap.add_argument("--min-reviews", type=int, default=10)
    ap.add_argument("--max-reviews", type=int, default=250)
    ap.add_argument("--max-categories", type=int, default=0,
                    help="Stop after N categories. 0 means the whole taxonomy.")
    ap.add_argument("--max-domains", type=int, default=500)
    ap.add_argument("--sleep", type=float, default=0.5)
    ap.add_argument("--keep-broad", action="store_true",
                    help="Keep categories whose top product is above the band. "
                         "Off by default: those categories are dominated by "
                         "companies that already have an SEO team.")
    ap.add_argument("--seen", default="outbound/contacted.txt",
                    help="Domains already contacted, one per line; excluded here too")
    args = ap.parse_args()

    token = os.environ.get("G2_API_TOKEN")
    if not token:
        sys.exit("Set G2_API_TOKEN in the environment. Never put it in a file in this repo.")

    seen = set()
    if os.path.exists(args.seen):
        with open(args.seen) as f:
            seen = {l.strip().lower() for l in f if l.strip()}

    found, skipped_broad, scanned = {}, 0, 0
    for name, slug in iter_categories(token, args.sleep):
        if args.max_categories and scanned >= args.max_categories:
            break
        if category_excluded(name):
            continue
        scanned += 1
        try:
            products = category_products(token, slug)
        except RuntimeError as e:
            print(f"  ! {slug}: {e}", file=sys.stderr)
            continue
        finally:
            time.sleep(args.sleep)
        if not products:
            continue

        # If even the smallest product G2 will show us is above the band, this
        # category's tail is out of reach -- every row we could get is a
        # company with a content team. Skip rather than pitch them.
        if not args.keep_broad and min(p["review_count"] for p in products) > args.max_reviews:
            skipped_broad += 1
            continue

        for p in products:
            d = p["domain"]
            if d in seen or d in found or d in EXCLUDE_DOMAIN:
                continue
            if not in_band(p, args.min_reviews, args.max_reviews):
                continue
            found[d] = {"domain": d, "company": p["company"], "category": name,
                        "review_count": p["review_count"],
                        "star_rating": p["star_rating"]}
            if len(found) >= args.max_domains:
                break
        if len(found) >= args.max_domains:
            print(f"Hit --max-domains {args.max_domains}, stopping the sweep.")
            break

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", newline="") as f:
        # domain,company,category is build_campaign.py's contract. The two
        # extra columns ride along for eyeballing and are ignored downstream.
        w = csv.DictWriter(f, fieldnames=["domain", "company", "category",
                                          "review_count", "star_rating"])
        w.writeheader()
        for row in sorted(found.values(), key=lambda r: r["review_count"]):
            w.writerow(row)

    print(f"scanned {scanned} categories, skipped {skipped_broad} as too broad")
    print(f"wrote {len(found)} domains to {args.out} "
          f"(reviews {args.min_reviews}-{args.max_reviews})")
    print(f"next: python3 outbound/build_campaign.py --input {args.out} --limit 25")


if __name__ == "__main__":
    main()
