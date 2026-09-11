#!/usr/bin/env python3
"""
Adds the new ICP pages to the topic cluster hubs in clusters/.

The footer gives every page a link to the hubs, but footer links are weak and
sitewide. A link inside the body of a topically related hub page carries far
more weight, because the surrounding content tells Google what the destination
is about.

Idempotent: re-running replaces the inserted block rather than stacking copies.
"""

import os
import re
import sys

REPO = os.path.dirname(os.path.abspath(__file__))
SITE = "https://linkfinderai.com"
MARK = "data-lf-icp-section"

# cluster file -> (icon, heading, blurb, [(slug, label), ...])
SECTIONS = {
    "enrichment.html": (
        "fa-users",
        "For your team",
        "Start here if you have a list rather than a single record to look up.",
        [
            ("for-recruiting-teams", "Recruitment Data Enrichment"),
            ("for-sales-teams", "Sales Team Data Enrichment"),
            ("enrich-sales-navigator-export", "Enrich a Sales Navigator Export"),
            ("enrich-ats-candidate-export", "Enrich an ATS Candidate Export"),
            ("enrich-apollo-export", "Enrich an Apollo Export"),
            ("enrich-crm-contact-list", "Enrich a CRM Contact List"),
        ],
    ),
    "linkedin.html": (
        "fa-layer-group",
        "Bulk LinkedIn workflows",
        "Upload a list of profiles instead of opening them one at a time.",
        [
            ("bulk-linkedin-email-finder", "Bulk LinkedIn Email Finder"),
            ("bulk-linkedin-phone-number-finder", "Bulk LinkedIn Phone Number Finder"),
            ("linkedin-xray-search-generator", "LinkedIn X-Ray Search Generator"),
            ("boolean-search-string-generator", "Boolean Search String Generator"),
            ("enrich-sales-navigator-export", "Enrich a Sales Navigator Export"),
        ],
    ),
    "email.html": (
        "fa-envelope-open-text",
        "Finding email for a whole list",
        "Bulk and free tools for teams working from a file.",
        [
            ("bulk-linkedin-email-finder", "Bulk LinkedIn Email Finder"),
            ("csv-email-finder", "CSV Email Finder"),
            ("email-permutator", "Free Email Permutator"),
            ("enrich-sales-navigator-export", "Enrich a Sales Navigator Export"),
        ],
    ),
    "lead-gen.html": (
        "fa-bullseye",
        "For sales teams",
        "Enrich the prospect list before the sequence goes out.",
        [
            ("for-sales-teams", "Sales Team Data Enrichment"),
            ("enrich-sales-navigator-export", "Enrich a Sales Navigator Export"),
            ("enrich-apollo-export", "Enrich an Apollo Export"),
            ("enrich-crm-contact-list", "Enrich a CRM Contact List"),
            ("csv-email-finder", "CSV Email Finder"),
        ],
    ),
    "company.html": (
        "fa-building",
        "From companies to contactable people",
        "Once you have the accounts, these turn them into people you can reach.",
        [
            ("csv-email-finder", "CSV Email Finder"),
            ("enrich-crm-contact-list", "Enrich a CRM Contact List"),
            ("for-sales-teams", "Sales Team Data Enrichment"),
        ],
    ),
    "workflows.html": (
        "fa-people-group",
        "Team workflows",
        "The same enrichment, framed around the export you already have.",
        [
            ("for-recruiting-teams", "Recruitment Data Enrichment"),
            ("for-sales-teams", "Sales Team Data Enrichment"),
            ("enrich-ats-candidate-export", "Enrich an ATS Candidate Export"),
            ("enrich-crm-contact-list", "Enrich a CRM Contact List"),
        ],
    ),
}

# alternatives.html gets cards appended to its existing grid instead of a new section.
ALT_CARDS = [
    ("salesql-alternative", "SalesQL Alternative"),
    ("evaboot-alternative", "Evaboot Alternative"),
]


def card(slug, label):
    return (
        '        <a class="link-card" href="%s/%s">%s <i class="fas fa-arrow-right"></i></a>'
        % (SITE, slug, label)
    )


def section_html(icon, heading, blurb, links):
    cards = "\n".join(card(s, l) for s, l in links)
    return (
        '\n    <section class="section" %s>\n'
        '      <div class="section-header">\n'
        '        <h2><i class="fas %s ico"></i> %s</h2>\n'
        "        <p>%s</p>\n"
        "      </div>\n"
        '      <div class="link-grid">\n%s\n      </div>\n'
        "    </section>\n" % (MARK, icon, heading, blurb, cards)
    )


def strip_existing(html):
    return re.sub(
        r'\n?\s*<section class="section" ' + MARK + r'>.*?</section>\n?',
        "\n",
        html,
        flags=re.S,
    )


def apply_section(fname, icon, heading, blurb, links):
    path = os.path.join(REPO, "clusters", fname)
    if not os.path.exists(path):
        return "missing"
    html = strip_existing(open(path, encoding="utf-8").read())

    # Insert before the final section on the page, which is the closing CTA.
    starts = [m.start() for m in re.finditer(r'<section class="section"', html)]
    if not starts:
        return "no-section"
    at = starts[-1]
    html = html[:at] + section_html(icon, heading, blurb, links).lstrip("\n") + "    " + html[at:]

    open(path, "w", encoding="utf-8").write(html)
    return "added %d links" % len(links)


def apply_alternatives():
    path = os.path.join(REPO, "clusters", "alternatives.html")
    if not os.path.exists(path):
        return "missing"
    html = open(path, encoding="utf-8").read()

    added = []
    for slug, label in ALT_CARDS:
        if "/%s" % slug in html:
            continue
        added.append((slug, label))
    if not added:
        return "already present"

    gm = re.search(r'<div class="link-grid">', html)
    if not gm:
        return "no-grid"
    end = html.find("</div>", gm.end())
    if end == -1:
        return "no-grid-close"

    block = "\n" + "\n".join(card(s, l) for s, l in added) + "\n      "
    html = html[:end] + block + html[end:]
    open(path, "w", encoding="utf-8").write(html)
    return "added %d cards" % len(added)


def main():
    for fname, (icon, heading, blurb, links) in SECTIONS.items():
        print("%-22s %s" % (fname, apply_section(fname, icon, heading, blurb, links)))
    print("%-22s %s" % ("alternatives.html", apply_alternatives()))


if __name__ == "__main__":
    main()
