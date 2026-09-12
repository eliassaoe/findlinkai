#!/usr/bin/env python3
"""
LinkFinder AI - retitle the core tool pages away from free-lookup intent.

Over 60 days, users who touched bulk, API or a CSV bought at ~17%; users who
only ever ran single lookups bought at 2.2%. The tool pages were selling to the
second group from the search results page: four of the highest-traffic titles
advertised "Free" and two added "No Login Required", which is a promise that
selects precisely for someone who will never pay.

The head keyword is left intact in every title - "LinkedIn Email Finder" still
opens the email finder title - because those phrases are what rank and they are
not the problem. Only the qualifier after the dash changes, from a free/instant
promise to a bulk, API or Google Sheets one. That keeps the ranking and
re-qualifies the click.

Deliberately NOT touched, because their "free" earns its place by attracting the
ICP rather than the opposite: crm-audit (a free CRM health check is a RevOps
lead magnet), boolean-search-string-generator and linkedin-xray-search-generator
(recruiter tools), email-permutator, best-free-lead-generation-tools (the
listicle ranks *for* the word), and the signup/credits funnel pages.

Safe to re-run: each page is matched on its current exact title, so a page that
has already been converted is reported as "already done" rather than mangled.
"""

import io
import os
import re

OUT = os.path.dirname(os.path.abspath(__file__))

# slug -> (old title fragment to match, new title, new meta description)
# New descriptions avoid "&" so there is no entity-escaping ambiguity.
PAGES = {
    "linkedin-email-finder.html": (
        "LinkedIn Email Finder – 10 Free Verified Emails, No Login Required",
        "LinkedIn Email Finder - Verified Work Emails in Bulk, CSV or API",
        "Find verified work emails from LinkedIn profiles at 95% accuracy. Upload a CSV "
        "of profile URLs or call the API. Built for recruiting, sales and RevOps teams "
        "running lists, not one-off lookups.",
    ),
    "linkedin-url-finder.html": (
        "LinkedIn URL Finder — Get Any Profile URL Instantly (Free)",
        "LinkedIn URL Finder - Profile URLs in Bulk from a CSV or API",
        "Turn names and companies into LinkedIn profile URLs for a whole list. Upload a "
        "CSV or call the API. Used by recruiting and sales teams enriching thousands of "
        "rows at a time.",
    ),
    "company-employee-finder.html": (
        "LinkedIn Employee Finder – Find Company Employees Free",
        "LinkedIn Employee Finder - Export a Company's Whole Team to CSV",
        "Get every employee at a company with names, job titles and LinkedIn profiles, "
        "exported to CSV. Run it across an account list by bulk upload or API. Built for "
        "recruiting and sales teams.",
    ),
    "find-company-employee-count.html": (
        "Company Employee Count Finder — Real-Time Headcount Data (Free)",
        "Company Employee Count Finder - Headcount Across an Account List",
        "Accurate employee counts for a whole list of companies, not one at a time. More "
        "reliable than LinkedIn estimates. Upload a CSV or call the API for territory "
        "sizing and account scoring.",
    ),
    "linkedin-profile-scraper.html": (
        "LinkedIn Profile Extractor – No Login Required | Free",
        "LinkedIn Profile Extractor - Bulk Profile Data via CSV or API",
        "Extract structured LinkedIn profile data at list scale. Upload a CSV of profile "
        "URLs or call the API, which ships with an OpenAPI spec. Built for teams with a "
        "recurring enrichment need.",
    ),
    "linkedin-company-employees-finder.html": (
        "LinkedIn Company Employees Finder — Export Any Company's Team (Free)",
        "LinkedIn Company Employees Finder - Export Any Company's Team to CSV",
        "Enter a LinkedIn company page URL and export the full employee list with job "
        "titles and contact data. Run it across many companies at once by CSV upload or "
        "API.",
    ),
    "linkedin-company-scraper.html": (
        "Company Profile Lookup — Extract Company Data at Scale (Free Tool)",
        "Company Profile Lookup - Extract Company Data at Scale via API",
        "B2B company data enrichment for sales, recruiting and RevOps teams. Run a whole "
        "account list through a CSV upload, the API, or directly inside Google Sheets.",
    ),
    "company-url-finder.html": (
        "Company URL Finder – Find Any Website by Name (95%+ Accuracy)",
        "Company URL Finder - Find Any Website by Name, in Bulk (95%+ Accurate)",
        "Find company websites from company names at 95%+ accuracy. Batch process a CSV "
        "of thousands, or call the API. Built for RevOps and sales teams cleaning account "
        "lists.",
    ),
    # The highest-traffic page on the site. Its title carried no "free", so this
    # only appends the bulk qualifier and keeps every ranking phrase in place.
    # If organic position slips in Search Console, this is the first line to revert.
    "linkedin-phone-number-finder.html": (
        "LinkedIn Phone Finder - Find Professional Phone Numbers from LinkedIn Profiles",
        "LinkedIn Phone Finder - Phone Numbers from LinkedIn Profiles, in Bulk",
        "Find direct dial phone numbers from LinkedIn profile URLs. Upload a CSV to run "
        "the whole list, or call the API. Built for recruiting and sales teams working a "
        "pipeline, not single lookups.",
    ),
}

# Pages where the only change needed is dropping a "(Free)" flag from the title.
DROP_FREE_FLAG = {
    "linkedIn-post-scraper.html": (
        "Post Data Lookup — Export Any Post's Data, Likes & Comments (Free)",
        "Post Data Lookup - Export Any Post's Data, Likes and Comments",
    ),
    "linkedin-post-date-extractor.html": (
        "LinkedIn Post Date Extractor — See Exact Publish Date of Any Post (Free)",
        "LinkedIn Post Date Extractor - See Exact Publish Date of Any Post",
    ),
    "best-instagram-scrapers.html": (
        "Best Instagram Scrapers in 2026 — Extract Profiles, Posts & Followers (Free)",
        "Best Instagram Scrapers in 2026 - Extract Profiles, Posts and Followers",
    ),
}

DESC_RE = re.compile(
    r'(<meta[^>]+name=["\']description["\'][^>]*content=["\'])(.*?)(["\'])',
    re.S | re.I,
)


def set_title(html, old, new):
    """Replace the <title> only when it still holds the expected old value."""
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
    for fname, (old_t, new_t, new_d) in sorted(PAGES.items()):
        path = os.path.join(OUT, fname)
        if not os.path.exists(path):
            print("%-42s missing" % fname)
            continue
        html = io.open(path, encoding="utf-8").read()
        html, status = set_title(html, old_t, new_t)
        if status == "ok":
            html, had_desc = set_description(html, new_d)
            status = "retitled" + ("" if had_desc else " (no description tag)")
            io.open(path, "w", encoding="utf-8").write(html)
        print("%-42s %s" % (fname, status))

    for fname, (old_t, new_t) in sorted(DROP_FREE_FLAG.items()):
        path = os.path.join(OUT, fname)
        if not os.path.exists(path):
            print("%-42s missing" % fname)
            continue
        html = io.open(path, encoding="utf-8").read()
        html, status = set_title(html, old_t, new_t)
        if status == "ok":
            io.open(path, "w", encoding="utf-8").write(html)
            status = "free flag dropped"
        print("%-42s %s" % (fname, status))


if __name__ == "__main__":
    main()
