#!/usr/bin/env python3
"""
update_compare_footer.py

Scans the repo root for every *-alternative.html page, builds a complete
"Compare" footer link list from what it finds, and writes that list into
the existing <h4 class="footer-heading">Compare</h4> / <ul class="footer-links">
block on every HTML page in the repo (root + subfolders like clusters/).

Pages that don't have a "Compare" footer block (e.g. the alternative
comparison pages themselves, which use a Product/Company/Support footer)
are left untouched.

Usage (from the repo root):
    python3 update_compare_footer.py --dry-run   # preview, no writes
    python3 update_compare_footer.py             # apply changes

Re-run this any time you add a new *-alternative.html page — it will
automatically pick it up and add it to every footer.
"""

import glob
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))

DISPLAY_NAME_OVERRIDES = {
    "apify-alternative": "Apify Alternative",
    "apollo-api-alternative": "Apollo Alternative",
    "captain-data-alternative": "Captain Data Alternative",
    "clay-alternative": "Clay Alternative",
    "clearbit-alternative": "Clearbit Alternative",
    "companyurlfinder-alternative": "CompanyURLFinder Alternative",
    "contact-out-alternative": "ContactOut Alternative",
    "coresignal-alternative": "Coresignal Alternative",
    "derrick-app-alternative": "Derrick App Alternative",
    "enrichlayer-alternative": "Enrichlayer Alternative",
    "hunter-io-alternative": "Hunter.io Alternative",
    "kaspr-alternative": "Kaspr Alternative",
    "lusha-alternative": "Lusha Alternative",
    "ninjapear-alternative": "NinjaPear Alternative",
    "people-data-labs-alternative": "People Data Labs Alternative",
    "phantombuster-alternative": "PhantomBuster Alternative",
    "proxycurl-alternative": "Proxycurl Alternative",
    "rocketreach-alternative": "RocketReach Alternative",
    "scrapin-alternative": "Scrapin Alternative",
    "scrapingdog-alternative": "Scrapingdog Alternative",
    "skrapp-alternative": "Skrapp Alternative",
    "snov-io-alternative": "Snov.io Alternative",
    "surfe-alternative": "Surfe Alternative",
    "waalaxy-alternative": "Waalaxy Alternative",
    "wiza-alternative": "Wiza Alternative",
    "zoominfo-alternative": "ZoomInfo Alternative",
}


def display_name(slug: str) -> str:
    if slug in DISPLAY_NAME_OVERRIDES:
        return DISPLAY_NAME_OVERRIDES[slug]
    return " ".join(w.capitalize() for w in slug.split("-"))


def discover_alternative_pages():
    pages = []
    for path in sorted(glob.glob(os.path.join(REPO_ROOT, "*-alternative.html"))):
        filename = os.path.basename(path)
        slug = filename[: -len(".html")]
        pages.append((filename, display_name(slug)))
    return pages


def build_compare_items(pages):
    lines = [
        f'              <li><a href="https://linkfinderai.com/{filename}">{name}</a></li>'
        for filename, name in pages
    ]
    lines.append(
        '              <li><a href="https://linkfinderai.com/clusters/alternatives.html">View All Alternatives &rarr;</a></li>'
    )
    return "\n".join(lines)


COMPARE_BLOCK_RE = re.compile(
    r'(<h4 class="footer-heading">Compare</h4>\s*<ul class="footer-links">)'
    r'(.*?)'
    r'(</ul>)',
    re.DOTALL,
)


def update_file(path, new_items, dry_run=False):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    match = COMPARE_BLOCK_RE.search(content)
    if not match:
        return False

    new_content = (
        content[: match.start()]
        + match.group(1)
        + "\n"
        + new_items
        + "\n            "
        + match.group(3)
        + content[match.end():]
    )

    if new_content == content:
        return False

    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
    return True


def main():
    dry_run = "--dry-run" in sys.argv

    pages = discover_alternative_pages()
    if not pages:
        print("No *-alternative.html files found at repo root. Nothing to do.")
        return

    print(f"Found {len(pages)} alternative pages:")
    for filename, name in pages:
        print(f"  - {filename:40s} -> {name}")

    new_items = build_compare_items(pages)

    html_files = sorted(
        glob.glob(os.path.join(REPO_ROOT, "*.html"))
        + glob.glob(os.path.join(REPO_ROOT, "**", "*.html"), recursive=True)
    )
    html_files = sorted(set(html_files))

    changed, skipped = [], []
    for path in html_files:
        if update_file(path, new_items, dry_run=dry_run):
            changed.append(os.path.relpath(path, REPO_ROOT))
        else:
            skipped.append(os.path.relpath(path, REPO_ROOT))

    verb = "Would update" if dry_run else "Updated"
    print(f"\n{verb} {len(changed)} file(s):")
    for f in changed:
        print(f"  \u2713 {f}")

    print(f"\nSkipped {len(skipped)} file(s) with no 'Compare' footer block.")
    if dry_run:
        print("\nThis was a dry run — no files were modified. Re-run without --dry-run to apply.")


if __name__ == "__main__":
    main()
