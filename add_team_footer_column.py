#!/usr/bin/env python3
"""
Adds a "For your team" column to the canonical footer in index.html.

The new ICP pages had no inbound links from the ~200 existing pages, so they
were starting from zero authority. The footer is the one block that appears on
every page, which makes it the strongest internal link surface on the site.

Run this, then sync_footer_to_all_pages.py to propagate it everywhere.

Anchor text is the target page's own keyword, not "learn more" - the anchor is
what tells Google what the destination page is about.

Idempotent: re-running replaces the column rather than adding a second one.
"""

import os
import re
import sys

REPO = os.path.dirname(os.path.abspath(__file__))
SITE = "https://linkfinderai.com"

HEADING = "For your team"

LINKS = [
    ("/for-recruiting-teams", "Recruitment Data Enrichment"),
    ("/for-sales-teams", "Sales Team Data Enrichment"),
    ("/for-revops-teams", "RevOps &amp; Data Teams"),
    ("/for-finance-teams", "Finance Teams"),
    ("/crm-enrichment-pipeline", "CRM Enrichment Pipeline"),
    ("/enrich-sales-navigator-export", "Enrich a Sales Navigator Export"),
    ("/enrich-ats-candidate-export", "Enrich an ATS Export"),
    ("/bulk-linkedin-email-finder", "Bulk LinkedIn Email Finder"),
    ("/bulk-linkedin-phone-number-finder", "Bulk LinkedIn Phone Finder"),
    ("/email-permutator", "Free Email Permutator"),
]


def column_html():
    items = "\n".join(
        '              <li><a href="%s%s">%s</a></li>' % (SITE, path, text)
        for path, text in LINKS
    )
    return (
        '          <div class="footer-section" data-lf-team-column="1">\n'
        '            <h4 class="footer-heading">%s</h4>\n'
        '            <ul class="footer-links">\n%s\n'
        "            </ul>\n"
        "          </div>\n" % (HEADING, items)
    )


def main():
    path = os.path.join(REPO, "index.html")
    html = open(path, encoding="utf-8").read()

    fm = re.search(r'<footer class="footer">.*?</footer>', html, re.S)
    if not fm:
        sys.exit("ERROR: no canonical footer found in index.html")
    footer = fm.group(0)

    # Idempotent: drop any column this script added before.
    footer_new = re.sub(
        r'\s*<div class="footer-section" data-lf-team-column="1">.*?</div>\s*(?=<div class="footer-section"|</div>)',
        "\n",
        footer,
        flags=re.S,
    )

    # Insert immediately before the Compare column, so the order reads
    # Platform / For your team / Compare / Support.
    anchor = footer_new.find('<div class="footer-section">\n            <h4 class="footer-heading">Compare')
    if anchor == -1:
        # Fall back to a looser match if whitespace differs.
        am = re.search(r'<div class="footer-section">\s*<h4 class="footer-heading">Compare', footer_new)
        if not am:
            sys.exit("ERROR: could not locate the Compare column to insert before")
        anchor = am.start()

    footer_new = footer_new[:anchor] + column_html() + "          " + footer_new[anchor:]

    html = html[: fm.start()] + footer_new + html[fm.end():]
    open(path, "w", encoding="utf-8").write(html)

    print("Added '%s' column with %d links to index.html footer." % (HEADING, len(LINKS)))
    print("Next: python3 sync_footer_to_all_pages.py")


if __name__ == "__main__":
    main()
