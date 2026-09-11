#!/usr/bin/env python3
"""
LinkFinder AI - internal link routing into the new ICP pages.

The tool pages already rank. New pages do not rank on their own for months;
they rank sooner when a page Google already trusts links to them using the
target keyword as the anchor text. This inserts one contextual block per donor
page, immediately before the footer.

Deliberately NOT wired: the Instagram pages. Linking consumer lookup traffic
into recruiting content tells Google the two topics belong together, which is
the exact association we are trying to break.

Idempotent - re-running replaces the block rather than stacking copies.
"""

import os
import re

SITE = "https://linkfinderai.com"
OUT = os.path.dirname(os.path.abspath(__file__))

START = "<!-- LF-ICP-LINKS:START -->"
END = "<!-- LF-ICP-LINKS:END -->"

BLOCK_CSS = """
<style>
  .lf-icp-links { background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 2.25rem 0; }
  .lf-icp-links .lf-inner { max-width: 780px; margin: 0 auto; padding: 0 1.5rem;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .lf-icp-links h2 { font-size: 1.25rem; font-weight: 700; color: #111827; margin: 0 0 0.75rem; letter-spacing: -0.01em; }
  .lf-icp-links p { color: #374151; line-height: 1.65; margin: 0 0 0.85rem; font-size: 0.9688rem; }
  .lf-icp-links p:last-child { margin-bottom: 0; }
  .lf-icp-links a { color: #2563eb; }
</style>
"""

# donor slug -> (heading, body paragraph with keyword-anchored links)
DONORS = {
    "index.html": (
        "Working from a list rather than a single lookup?",
        'Most teams arrive here with a file, not one name. Upload it to the '
        '<a href="{s}/csv-email-finder">CSV email finder</a> and get verified '
        'addresses back for every row. Talent teams should start at '
        '<a href="{s}/for-recruiting-teams">recruitment data enrichment</a>; '
        'revenue teams at <a href="{s}/for-sales-teams">sales team data enrichment</a>.',
    ),
    "linkedin-email-finder.html": (
        "Do this for your whole list",
        'Looking up one profile at a time works until the list gets long. The '
        '<a href="{s}/bulk-linkedin-email-finder">bulk LinkedIn email finder</a> '
        'takes a CSV of profile URLs and returns verified addresses for all of them in one '
        'run. If your list came out of Sales Navigator, go straight to '
        '<a href="{s}/enrich-sales-navigator-export">enrich a Sales Navigator export</a>, '
        'which keeps the export’s original columns intact.',
    ),
    "linkedin-phone-number-finder.html": (
        "Need numbers for a whole list?",
        'One profile at a time is the slow way through a shortlist. The '
        '<a href="{s}/bulk-linkedin-phone-number-finder">bulk LinkedIn phone number finder</a> '
        'takes a CSV of profile URLs and returns direct dials for the whole file. '
        'Comparing tools first? See the '
        '<a href="{s}/lusha-alternative">Lusha alternative</a> comparison.',
    ),
    "linkedin-search-by-email.html": (
        "Enriching a whole contact list",
        'Reverse lookups are most useful in bulk, against a database rather than one '
        'address. To refresh a stale segment, use '
        '<a href="{s}/enrich-crm-contact-list">enrich a CRM contact list</a> — it also '
        'flags which contacts have changed employer since the record was created. '
        'Revenue teams: <a href="{s}/for-sales-teams">sales team data enrichment</a>.',
    ),
    "linkedin-url-finder.html": (
        "From profile URLs to contactable people",
        'A list of profile URLs is the best possible input for enrichment, because a URL '
        'identifies one specific person. Feed yours to the '
        '<a href="{s}/csv-email-finder">CSV email finder</a> for verified addresses, or to '
        'the <a href="{s}/bulk-linkedin-phone-number-finder">bulk LinkedIn phone number finder</a> '
        'if you need to call. Recruiters: '
        '<a href="{s}/for-recruiting-teams">recruitment data enrichment</a>.',
    ),
    "linkedin-profile-scraper.html": (
        "Building this into your own product?",
        'If you are writing code rather than uploading files, the '
        '<a href="{s}/api-documentation">API documentation</a> covers the same enrichment '
        'behind a single endpoint, with an OpenAPI spec. Migrating off a service that shut '
        'down? See <a href="{s}/migrate-from-proxycurl">the Proxycurl migration guide</a>.',
    ),
    "company-url-finder.html": (
        "Enriching a list of companies",
        'A domain is the starting point for finding the people at that company. To run a '
        'whole list, use the <a href="{s}/csv-email-finder">CSV email finder</a>, or '
        '<a href="{s}/enrich-crm-contact-list">enrich a CRM contact list</a> if the '
        'companies already live in your CRM.',
    ),
}


def block_for(heading, body):
    return (
        START
        + BLOCK_CSS
        + '<section class="lf-icp-links"><div class="lf-inner">'
        + "<h2>%s</h2><p>%s</p>" % (heading, body.format(s=SITE))
        + "</div></section>"
        + END
    )


def apply_to(fname, heading, body):
    path = os.path.join(OUT, fname)
    if not os.path.exists(path):
        return "missing"
    with open(path, "r", encoding="utf-8") as fh:
        html = fh.read()

    new_block = block_for(heading, body)

    # Idempotent: replace an existing block instead of appending another.
    if START in html:
        html = re.sub(
            re.escape(START) + r".*?" + re.escape(END),
            lambda _m: new_block,
            html,
            flags=re.S,
        )
        status = "updated"
    else:
        idx = html.find("<footer")
        if idx == -1:
            return "no-footer"
        html = html[:idx] + new_block + "\n" + html[idx:]
        status = "inserted"

    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)
    return status


def main():
    for fname, (heading, body) in DONORS.items():
        print("%-38s %s" % (fname, apply_to(fname, heading, body)))


if __name__ == "__main__":
    main()
