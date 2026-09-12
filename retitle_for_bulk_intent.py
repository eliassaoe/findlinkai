#!/usr/bin/env python3
"""
LinkFinder AI - title and description framing, weighted by each page's real
bulk-intent share.

Users who touched bulk, API or a CSV bought at ~17% over 60 days; users who only
ran single lookups bought at 2.2%. The first pass of this script removed the
"Free" and "No Login Required" promises that were recruiting the second group
straight from the search results page.

This pass fixes two things the first one got wrong.

1. Length. Google truncates titles around 60 characters. Every title the first
   pass wrote ran 61-70, so the "in Bulk" / "CSV or API" qualifier - the entire
   point of the rewrite - was being cut off before it rendered. All titles here
   are under 60.

2. Weighting. A head term like "linkedin phone number finder" is a MIXED pool:
   some searchers have one name, some have a list. But the mix is not the same
   from page to page. Share of each page's visitors who went on to touch bulk,
   API or CSV, over 60 days:

       /linkedin-search-by-email       4.30%   (93 people)
       /linkedin-url-finder            3.73%   (375)
       /linkedin-email-finder          2.05%   (830)
       /company-url-finder             0.63%   (158)
       /linkedin-phone-number-finder   0.22%   (2,309)

   So the framing is pushed hardest where the pool is richest, and eased off on
   the phone finder - which is the largest audience on the site and almost
   purely single-lookup. Framing that page aggressively would spend CTR on the
   biggest traffic source chasing five people a quarter. It keeps its head
   phrase and gains "Direct Dials", which is buyer vocabulary rather than a
   scale claim, at no CTR cost.

   Caveat on those percentages: they measure REALIZED bulk intent - someone had
   to sign up and actually use bulk to be counted. Anyone with a list who
   bounced off a page promising a free single lookup is invisible in them, so
   they are a lower bound, and framing is exactly the lever meant to convert
   latent intent into realized.

Descriptions are rewritten to fit the ~155 character snippet (several ran to
192) and carry "Plans from $49/mo". Price belongs here rather than in the title:
at 80-90 characters a title with a price appended is truncated before the price
ever renders, and it would push the bulk qualifier out of view on the way.

Safe to re-run: each page is matched on its current exact title, so a page
already converted reports "already done" rather than being mangled.
"""

import io
import os
import re

OUT = os.path.dirname(os.path.abspath(__file__))

# slug -> (title to match, new title, new meta description)
# Ordered by bulk-intent share, richest pool first.
PAGES = {
    # --- Aggressive framing: richest bulk-intent pools -------------------
    "linkedin-search-by-email.html": (
        "Email to LinkedIn Profile Finder - Find LinkedIn Profiles from Email Addresses",
        "Email to LinkedIn Finder - Bulk Reverse Lookup, CSV or API",
        "Find LinkedIn profiles from email addresses, one or a whole CSV. Built for "
        "recruiting and sales teams. Plans from $49/mo.",
    ),
    "linkedin-url-finder.html": (
        "LinkedIn URL Finder - Profile URLs in Bulk from a CSV or API",
        "LinkedIn URL Finder - Bulk Profile URLs, CSV or API",
        "Turn names and companies into LinkedIn profile URLs for a whole list. Upload a "
        "CSV or call the API. Plans from $49/mo.",
    ),
    "linkedin-email-finder.html": (
        "LinkedIn Email Finder - Verified Work Emails in Bulk, CSV or API",
        "LinkedIn Email Finder - Bulk Verified Emails, CSV or API",
        "Verified work emails from LinkedIn profiles at 95% accuracy. Upload a CSV or "
        "call the API. Built for teams running lists. Plans from $49/mo.",
    ),
    # --- Moderate framing ------------------------------------------------
    "company-employee-finder.html": (
        "LinkedIn Employee Finder - Export a Company's Whole Team to CSV",
        "LinkedIn Employee Finder - Export a Company's Team to CSV",
        "Export every employee at a company with job titles and LinkedIn profiles to "
        "CSV. Run it across an account list. Plans from $49/mo.",
    ),
    "linkedin-company-employees-finder.html": (
        "LinkedIn Company Employees Finder - Export Any Company's Team to CSV",
        "LinkedIn Company Employees Finder - Export a Team to CSV",
        "Enter a LinkedIn company page URL and export the full employee list with job "
        "titles and contacts. Plans from $49/mo.",
    ),
    "linkedin-profile-scraper.html": (
        "LinkedIn Profile Extractor - Bulk Profile Data via CSV or API",
        "LinkedIn Profile Extractor - Bulk Data via CSV or API",
        "Extract structured LinkedIn profile data at list scale. Upload a CSV of profile "
        "URLs or call the API. Plans from $49/mo.",
    ),
    "linkedin-company-scraper.html": (
        "Company Profile Lookup - Extract Company Data at Scale via API",
        "Company Profile Lookup - Company Data at Scale via API",
        "B2B company data enrichment for sales, recruiting and RevOps teams. CSV upload, "
        "API, or Google Sheets. Plans from $49/mo.",
    ),
    "find-company-employee-count.html": (
        "Company Employee Count Finder - Headcount Across an Account List",
        "Company Employee Count Finder - Headcount for a List",
        "Accurate employee counts across a whole list of companies. More reliable than "
        "LinkedIn estimates. Plans from $49/mo.",
    ),
    "company-url-finder.html": (
        "Company URL Finder - Find Any Website by Name, in Bulk (95%+ Accurate)",
        "Company URL Finder - Find Websites in Bulk by Name",
        "Find company websites from company names at 95%+ accuracy. Batch a CSV of "
        "thousands, or call the API. Plans from $49/mo.",
    ),
    # --- Conservative: largest audience, almost no bulk intent (0.22%) ----
    # Keeps the head phrase and trades the scale claim for "Direct Dials",
    # which reads as buyer vocabulary without costing CTR on 2,309 visitors.
    "linkedin-phone-number-finder.html": (
        "LinkedIn Phone Finder - Phone Numbers from LinkedIn Profiles, in Bulk",
        "LinkedIn Phone Finder - Direct Dials from LinkedIn Profiles",
        "Direct dial phone numbers from LinkedIn profile URLs. Run one, or a whole CSV. "
        "Built for recruiting and sales teams. Plans from $49/mo.",
    ),
}

DESC_RE = re.compile(
    r'(<meta[^>]+name=["\']description["\'][^>]*content=["\'])(.*?)(["\'])',
    re.S | re.I,
)


def set_title(html, old, new):
    m = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
    if not m:
        return html, "no-title"
    current = re.sub(r"\s+", " ", m.group(1)).strip()
    if current == new:
        return html, "already done"
    if current != old:
        return html, "title changed since - skipped"
    return html[: m.start(1)] + new + html[m.end(1):], "ok"


def set_description(html, new):
    m = DESC_RE.search(html)
    if not m:
        return html, False
    return html[: m.start(2)] + new + html[m.end(2):], True


def main():
    for fname, (old_t, new_t, new_d) in PAGES.items():
        path = os.path.join(OUT, fname)
        if not os.path.exists(path):
            print("%-42s missing" % fname)
            continue
        html = io.open(path, encoding="utf-8").read()
        html, status = set_title(html, old_t, new_t)
        if status == "ok":
            html, had_desc = set_description(html, new_d)
            io.open(path, "w", encoding="utf-8").write(html)
            status = "retitled  [%d chars]" % len(new_t)
            if not had_desc:
                status += "  (no description tag)"
        print("%-42s %s" % (fname, status))


if __name__ == "__main__":
    main()
