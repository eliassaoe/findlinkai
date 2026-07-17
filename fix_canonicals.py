#!/usr/bin/env python3
"""
fix_canonicals.py

Scans a directory of HTML files for a specific bug: the <link rel="canonical">
tag pointing at a different URL than the page's own BreadcrumbList JSON-LD
schema declares as its "item" URL. This happens after page renames/migrations
when the canonical tag isn't updated to match.

Usage:
    python3 fix_canonicals.py /path/to/site              # scan only, print report
    python3 fix_canonicals.py /path/to/site --fix         # scan AND fix in place
    python3 fix_canonicals.py /path/to/site --fix --dry-run  # show what would change, don't write

No external dependencies — stdlib only, works in any Codespace / CI runner.

What it does NOT do:
- It does not know which URL is "correct" with certainty. It trusts the
  BreadcrumbList schema's declared URL as the source of truth, since that's
  what we've found to be reliable across every page checked so far. Always
  spot-check a few fixes before trusting a full run blindly.
- It does not touch anything if there's no BreadcrumbList schema on the page,
  or if canonical and breadcrumb already agree.
"""

import argparse
import json
import re
import sys
from pathlib import Path

CANONICAL_RE = re.compile(
    r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']\s*/?>',
    re.IGNORECASE
)

JSONLD_RE = re.compile(
    r'<script\s+type=["\']application/ld\+json["\']\s*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL
)


def find_canonical(html):
    m = CANONICAL_RE.search(html)
    return m.group(1) if m else None


def find_breadcrumb_url(html):
    """Return the URL of the last (deepest) item in the first BreadcrumbList
    JSON-LD block found on the page."""
    for match in JSONLD_RE.finditer(html):
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if data.get("@type") == "BreadcrumbList":
            items = data.get("itemListElement", [])
            if not items:
                continue
            # deepest breadcrumb = highest "position"
            deepest = max(items, key=lambda i: i.get("position", 0))
            return deepest.get("item")
    return None


def normalize(url):
    if not url:
        return url
    return url.rstrip("/").lower()


def scan_file(path, root):
    html = path.read_text(encoding="utf-8", errors="ignore")
    canonical = find_canonical(html)
    breadcrumb = find_breadcrumb_url(html)

    status = "SKIP"
    if canonical and breadcrumb:
        status = "MATCH" if normalize(canonical) == normalize(breadcrumb) else "MISMATCH"
    elif canonical and not breadcrumb:
        status = "NO_BREADCRUMB"
    elif not canonical:
        status = "NO_CANONICAL"

    return {
        "path": path,
        "root": root,
        "canonical": canonical,
        "breadcrumb": breadcrumb,
        "status": status,
        "html": html,
    }


def fix_file(result, dry_run=False):
    """Rewrite the canonical href to match the breadcrumb URL. Returns True if changed."""
    html = result["html"]
    old_tag_match = CANONICAL_RE.search(html)
    if not old_tag_match:
        return False

    old_href = old_tag_match.group(1)
    new_href = result["breadcrumb"]
    new_html = html[:old_tag_match.start(1)] + new_href + html[old_tag_match.end(1):]

    if not dry_run:
        backup_path = result["path"].with_suffix(result["path"].suffix + ".bak")
        backup_path.write_text(html, encoding="utf-8")
        result["path"].write_text(new_html, encoding="utf-8")

    return True


def guess_url_from_path(path, root, base_url):
    """Fallback URL guess when there's no breadcrumb to trust: strip the
    extension, treat index.html as the directory root, join with base_url."""
    rel = path.relative_to(root)
    parts = list(rel.parts)
    if parts[-1].lower() == "index.html":
        parts = parts[:-1]
    else:
        parts[-1] = re.sub(r"\.html?$", "", parts[-1], flags=re.IGNORECASE)
    url_path = "/".join(p for p in parts if p)
    return base_url.rstrip("/") + "/" + url_path if url_path else base_url.rstrip("/") + "/"


def add_missing_canonical(result, base_url, dry_run=False):
    """Insert a <link rel="canonical"> tag into <head> for a page that has
    none. Prefers the breadcrumb URL; falls back to a filename-based guess
    (flagged as GUESSED so it gets manual review, not blind trust)."""
    html = result["html"]
    source = "breadcrumb"
    url = result["breadcrumb"]
    if not url:
        url = guess_url_from_path(result["path"], result["root"], base_url)
        source = "GUESSED"

    tag = f'  <link rel="canonical" href="{url}"/>\n'
    head_close = re.search(r"</head\s*>", html, re.IGNORECASE)
    if not head_close:
        return None  # no </head> found, don't guess where to insert

    new_html = html[:head_close.start()] + tag + html[head_close.start():]

    if not dry_run:
        backup_path = result["path"].with_suffix(result["path"].suffix + ".bak")
        backup_path.write_text(html, encoding="utf-8")
        result["path"].write_text(new_html, encoding="utf-8")

    return {"url": url, "source": source}


def main():



    ap = argparse.ArgumentParser(description="Find/fix canonical vs breadcrumb URL mismatches.")
    ap.add_argument("root", help="Directory to scan recursively for .html files")
    ap.add_argument("--fix", action="store_true", help="Rewrite canonical tags to match breadcrumb URL")
    ap.add_argument("--add-missing", action="store_true", help="Insert a canonical tag on pages that have none")
    ap.add_argument("--base-url", default="https://linkfinderai.com", help="Base URL for filename-guessed canonicals")
    ap.add_argument("--dry-run", action="store_true", help="With --fix/--add-missing, show changes without writing files")
    ap.add_argument("--ext", default=".html", help="File extension to scan (default: .html)")
    args = ap.parse_args()

    root = Path(args.root)
    if not root.exists():
        print(f"Path not found: {root}", file=sys.stderr)
        sys.exit(1)

    files = sorted(root.rglob(f"*{args.ext}"))
    if not files:
        print(f"No {args.ext} files found under {root}")
        sys.exit(0)

    results = [scan_file(f, root) for f in files]

    mismatches = [r for r in results if r["status"] == "MISMATCH"]
    matches = [r for r in results if r["status"] == "MATCH"]
    no_breadcrumb = [r for r in results if r["status"] == "NO_BREADCRUMB"]
    no_canonical = [r for r in results if r["status"] == "NO_CANONICAL"]

    print(f"Scanned {len(files)} file(s) under {root}\n")

    if mismatches:
        print(f"❌ MISMATCH — canonical ≠ breadcrumb URL ({len(mismatches)}):")
        for r in mismatches:
            print(f"   {r['path'].relative_to(root)}")
            print(f"     canonical:  {r['canonical']}")
            print(f"     breadcrumb: {r['breadcrumb']}")
        print()

    if matches:
        print(f"✅ MATCH — already consistent ({len(matches)}):")
        for r in matches:
            print(f"   {r['path'].relative_to(root)}")
        print()

    if no_breadcrumb:
        print(f"⚠️  NO BREADCRUMB SCHEMA — could not verify ({len(no_breadcrumb)}):")
        for r in no_breadcrumb:
            print(f"   {r['path'].relative_to(root)}  (canonical: {r['canonical']})")
        print()

    if no_canonical:
        print(f"⚠️  NO CANONICAL TAG FOUND ({len(no_canonical)}):")
        for r in no_canonical:
            print(f"   {r['path'].relative_to(root)}")
        print()

    if args.fix:
        if not mismatches:
            print("Nothing to fix — no mismatches found.")
            return
        mode = "DRY RUN — no files written" if args.dry_run else "WRITING FIXES"
        print(f"--- {mode} ---")
        for r in mismatches:
            fix_file(r, dry_run=args.dry_run)
            arrow = "would change" if args.dry_run else "changed"
            print(f"   {arrow}: {r['path'].relative_to(root)}  ->  {r['breadcrumb']}")
        if not args.dry_run:
            print(f"\nDone. {len(mismatches)} file(s) fixed. Original versions saved as .html.bak next to each file.")
    else:
        if mismatches:
            print(f"Run again with --fix to correct the {len(mismatches)} mismatch(es) automatically.")
            print(f"Add --dry-run first if you want to preview changes without writing anything.")

    if args.add_missing:
        if not no_canonical:
            print("Nothing to add — no pages missing a canonical tag.")
            return
        mode = "DRY RUN — no files written" if args.dry_run else "WRITING NEW CANONICAL TAGS"
        print(f"\n--- {mode} ---")
        guessed = []
        for r in no_canonical:
            outcome = add_missing_canonical(r, args.base_url, dry_run=args.dry_run)
            if outcome is None:
                print(f"   SKIPPED (no </head> found): {r['path'].relative_to(root)}")
                continue
            tag = "breadcrumb" if outcome["source"] == "breadcrumb" else "GUESSED — review this one"
            print(f"   added [{tag}]: {r['path'].relative_to(root)}  ->  {outcome['url']}")
            if outcome["source"] == "GUESSED":
                guessed.append(r["path"].relative_to(root))
        if not args.dry_run:
            print(f"\nDone. {len(no_canonical)} file(s) updated. Originals saved as .html.bak.")
        if guessed:
            print(f"\n⚠️  {len(guessed)} file(s) had no breadcrumb either, so the URL was GUESSED from the filename.")
            print("   Manually verify these before trusting them:")
            for g in guessed:
                print(f"     {g}")
    elif not args.fix:
        if no_canonical:
            print(f"{len(no_canonical)} page(s) have no canonical tag at all. Run with --add-missing to insert one.")


if __name__ == "__main__":
    main()