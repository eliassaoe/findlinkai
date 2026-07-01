#!/usr/bin/env python3
"""
sync_footer_to_all_pages.py

Takes the <footer class="footer">...</footer> block from index.html
(the canonical footer) and overwrites the footer block on every other
HTML page in the repo with it — so every page ends up with the exact
same footer as the homepage.

Run this AFTER update_compare_footer.py, so index.html's Compare list
is already fully up to date before it gets propagated everywhere else.

Usage (from the repo root):
    python3 sync_footer_to_all_pages.py --dry-run   # preview, no writes
    python3 sync_footer_to_all_pages.py              # apply changes
"""

import glob
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
CANONICAL_SOURCE = os.path.join(REPO_ROOT, "index.html")

FOOTER_RE = re.compile(r'<footer class="footer">.*?</footer>', re.DOTALL)


def get_canonical_footer():
    with open(CANONICAL_SOURCE, "r", encoding="utf-8") as f:
        content = f.read()
    match = FOOTER_RE.search(content)
    if not match:
        print("ERROR: could not find <footer class=\"footer\">...</footer> in index.html")
        sys.exit(1)
    return match.group(0)


def update_file(path, canonical_footer, dry_run=False):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    match = FOOTER_RE.search(content)
    if not match:
        return "no-footer-tag"

    if match.group(0) == canonical_footer:
        return "already-matches"

    new_content = content[: match.start()] + canonical_footer + content[match.end():]

    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
    return "updated"


def main():
    dry_run = "--dry-run" in sys.argv

    canonical_footer = get_canonical_footer()
    print(f"Loaded canonical footer from index.html ({len(canonical_footer)} chars).\n")

    html_files = sorted(
        set(
            glob.glob(os.path.join(REPO_ROOT, "*.html"))
            + glob.glob(os.path.join(REPO_ROOT, "**", "*.html"), recursive=True)
        )
    )

    changed, already_ok, no_footer = [], [], []

    for path in html_files:
        if os.path.abspath(path) == os.path.abspath(CANONICAL_SOURCE):
            continue
        rel = os.path.relpath(path, REPO_ROOT)
        result = update_file(path, canonical_footer, dry_run=dry_run)
        if result == "updated":
            changed.append(rel)
        elif result == "already-matches":
            already_ok.append(rel)
        else:
            no_footer.append(rel)

    verb = "Would update" if dry_run else "Updated"
    print(f"{verb} {len(changed)} file(s):")
    for f in changed:
        print(f"  \u2713 {f}")

    print(f"\nAlready matched (no change needed): {len(already_ok)} file(s)")

    print(f"\nSkipped {len(no_footer)} file(s) with no <footer class=\"footer\"> tag found:")
    for f in no_footer:
        print(f"  - {f}")

    if dry_run:
        print("\nThis was a dry run — no files were modified. Re-run without --dry-run to apply.")


if __name__ == "__main__":
    main()
