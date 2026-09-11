#!/usr/bin/env python3
"""
Rebalances the Platform column of the canonical footer toward list and API buyers.

Two changes, both driven by 180 days of data:

  Removed - Instagram Profile Finder. It is the single largest page on the site
  (6,196 visitors in 180 days, more than the homepage) and has produced zero
  list uploads and zero payments in that window. It was receiving a link from
  all 202 pages, so the sitewide footer was pushing internal authority into a
  page that returns nothing. The page itself stays live and indexed - this only
  stops feeding it.

  Added - Enrichment API and API Documentation. /api-access converts visitors to
  payment at 0.90%, six times the homepage rate of 0.15% and the best of any
  page with real traffic. API access was buried in the Support & Legal column.

Run this, then sync_footer_to_all_pages.py to propagate.

Idempotent.
"""

import os
import re
import sys

REPO = os.path.dirname(os.path.abspath(__file__))
SITE = "https://linkfinderai.com"

DROP_SUBSTRINGS = ["/instagram-profile-url-finder"]

ADD_BEFORE_PRICING = [
    ("/data-enrichment-api", "Enrichment API"),
    ("/api-access", "API Access"),
]


def main():
    path = os.path.join(REPO, "index.html")
    html = open(path, encoding="utf-8").read()

    fm = re.search(r'<footer class="footer">.*?</footer>', html, re.S)
    if not fm:
        sys.exit("ERROR: no canonical footer found in index.html")
    footer = fm.group(0)

    # Isolate the Platform column so edits cannot touch the other columns.
    pm = re.search(
        r'(<h4 class="footer-heading">Platform</h4>\s*<ul class="footer-links">)(.*?)(</ul>)',
        footer,
        re.S,
    )
    if not pm:
        sys.exit("ERROR: could not locate the Platform column")

    head, items, tail = pm.group(1), pm.group(2), pm.group(3)

    lis = re.findall(r"<li>.*?</li>", items, re.S)
    before = len(lis)

    # Drop the dead-end pages.
    lis = [li for li in lis if not any(s in li for s in DROP_SUBSTRINGS)]
    dropped = before - len(lis)

    # Add the API links immediately before Pricing, if not already present.
    added = 0
    for path_, label in ADD_BEFORE_PRICING:
        if any('"%s%s"' % (SITE, path_) in li for li in lis):
            continue
        new_li = '<li><a href="%s%s">%s</a></li>' % (SITE, path_, label)
        idx = next(
            (i for i, li in enumerate(lis) if "/pricing" in li), len(lis)
        )
        lis.insert(idx, new_li)
        added += 1

    new_items = "\n              " + "\n              ".join(lis) + "\n            "
    new_footer = footer[: pm.start(2)] + new_items + footer[pm.end(2):]
    html = html[: fm.start()] + new_footer + html[fm.end():]
    open(path, "w", encoding="utf-8").write(html)

    print("Platform column: %d links -> %d (dropped %d, added %d)"
          % (before, len(lis), dropped, added))
    print("Next: python3 sync_footer_to_all_pages.py")


if __name__ == "__main__":
    main()
