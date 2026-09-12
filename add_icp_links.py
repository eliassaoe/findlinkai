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

Two waves of donors. The first covered the highest-traffic tool pages. The
second exists because a footer link is boilerplate Google discounts: six ICP
pages were in the footer and in the sitemap but had no contextual link from any
page with real traffic, so they had no path to rank.

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
    # --- Second wave -------------------------------------------------------
    # The first wave left six ICP pages reachable only from the site-wide
    # footer, which Google discounts as boilerplate: for-revops-teams,
    # enrich-apollo-export, clay-alternative, recruiting-enrichment-api,
    # linkedIn-enrichment-google-sheets and best-b2b-lead-generation-agencies.
    # These donors are the highest-traffic *marketing* pages that were not
    # already giving, each paired with the ICP page whose topic it continues.
    # api-access is deliberately absent: it looks high-traffic in analytics but
    # it is the logged-in API settings screen, so Google never sees it.
    "company-employee-finder.html": (
        "From a company to its whole team",
        'Finding the people at one company is the first step; most teams then want the same '
        'for a list of companies. Run that through the '
        '<a href="{s}/csv-email-finder">CSV email finder</a>, or '
        '<a href="{s}/enrich-crm-contact-list">enrich a CRM contact list</a> if those '
        'accounts already sit in your CRM. Talent teams working a headcount list should '
        'start at <a href="{s}/for-recruiting-teams">recruitment data enrichment</a>.',
    ),
    "find-company-employee-count.html": (
        "Sizing a territory, not just a company",
        'Headcount is a firmographic, which makes it most useful applied across a whole '
        'account list rather than one company at a time. Revenue teams segmenting on it '
        'should read <a href="{s}/for-sales-teams">sales team data enrichment</a>; if you own '
        'the data model behind that segmentation, '
        '<a href="{s}/for-revops-teams">RevOps data enrichment</a> covers keeping the field '
        'accurate as companies grow.',
    ),
    "scrape-linkedIn-jobs.html": (
        "Job posts are a hiring signal - here is what to do with them",
        'A company posting roles is a company with budget, which is why job data feeds both '
        'recruiting and sales pipelines. Talent teams should continue at '
        '<a href="{s}/for-recruiting-teams">recruitment data enrichment</a>; to pull '
        'candidate or hiring-manager contact data straight into an ATS, the '
        '<a href="{s}/recruiting-enrichment-api">recruiting enrichment API</a> does it '
        'without an export step.',
    ),
    "linkedin-company-scraper.html": (
        "Running this for clients, or at list scale",
        'Agencies scraping company data for several clients at once need it repeatable rather '
        'than manual - <a href="{s}/best-b2b-lead-generation-agencies">lead generation for '
        'agencies</a> covers how that is usually set up. If the account list already lives in '
        'Apollo, <a href="{s}/enrich-apollo-export">enrich an Apollo export</a> fills the gaps '
        'while keeping the export&rsquo;s original columns.',
    ),
    "best-linkedin-api.html": (
        "Where the data lands matters as much as the API",
        'Most teams evaluating an API are really choosing where the enriched rows end up. If '
        'that is a spreadsheet, <a href="{s}/linkedIn-enrichment-google-sheets">LinkedIn '
        'enrichment in Google Sheets</a> runs the same data in-cell with no code. If you are '
        'replacing a table-based enrichment tool, see the '
        '<a href="{s}/clay-alternative">Clay alternative</a> comparison.',
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
