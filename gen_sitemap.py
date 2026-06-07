#!/usr/bin/env python3
"""gen_sitemap.py - build sitemap.xml + robots.txt for a plain-HTML site.

DRY-RUN by default (prints what it would write). Pass --write to create the files.
Writes sitemap.xml and robots.txt in the current folder. Review with git diff.
"""
import argparse, os, sys
from datetime import date
from xml.sax.saxutils import escape

# ---------------- CONFIG ----------------
SITE_URL = "https://linkfinderai.com"   # no trailing slash
ROOT = "."
IGNORE_DIRS = {"node_modules", ".git", "dist", "build", "vendor"}

# Pages to keep OUT of the sitemap and DISALLOW in robots.txt.
# Matched against each page's clean path (no .html). Prefix match.
EXCLUDE = {
    "log-in", "log-in-beta", "sign-up", "sign-up-beta",
    "account", "account-beta", "reset-password", "update-password",
    "confirmation-login", "confirmation-signup", "confirmation-signup-beta",
    "upgrade-confirmation", "redeem-code", "beta-index",
    "end-of-bookmarks-bar", "say-goodbye",
    "app", "app-beta", "app-beta-2", "app_beta",
    "app-prospects", "app-linkedin-leads", "app-workflows",
}
# ----------------------------------------


def iter_html(root):
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in IGNORE_DIRS]
        for f in fn:
            if f.lower().endswith((".html", ".htm")):
                yield os.path.join(dp, f)


def clean_path(rel):
    """File path -> clean URL path (no .html, index.html -> '')."""
    p = rel.replace(os.sep, "/").lstrip("./")
    if p.endswith("index.html"):
        p = p[: -len("index.html")]
    elif p.endswith(".html"):
        p = p[:-5]
    elif p.endswith(".htm"):
        p = p[:-4]
    return p.rstrip("/")


def is_safe(path_part):
    """Skip filenames with stray/invisible characters (bad URLs)."""
    return all(ord(c) < 128 and c not in '\u200b\u200c\u200d' for c in path_part)


def is_excluded(clean):
    base = clean.split("/")[-1] or clean
    return any(base == e or base.startswith(e + "-") for e in EXCLUDE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="actually create the files")
    args = ap.parse_args()

    included, excluded, skipped = [], [], []
    for path in iter_html(ROOT):
        rel = os.path.relpath(path, ROOT)
        clean = clean_path(rel)
        if not is_safe(rel):
            skipped.append(rel)
            continue
        if clean == "":              # homepage
            url = SITE_URL
        else:
            url = f"{SITE_URL}/{clean}"
        if is_excluded(clean):
            excluded.append(clean)
            continue
        lastmod = date.fromtimestamp(os.path.getmtime(path)).isoformat()
        included.append((url, lastmod))

    included.sort()

    # Build sitemap.xml
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url, lastmod in included:
        lines.append("  <url>")
        lines.append(f"    <loc>{escape(url)}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    sitemap = "\n".join(lines) + "\n"

    # Build robots.txt (allow everything incl. AI crawlers; block auth/app pages)
    rb = ["User-agent: *", "Allow: /"]
    for e in sorted(EXCLUDE):
        rb.append(f"Disallow: /{e}")
    rb.append("")
    rb.append(f"Sitemap: {SITE_URL}/sitemap.xml")
    robots = "\n".join(rb) + "\n"

    print(f"Pages in sitemap : {len(included)}")
    print(f"Excluded (auth/app): {len(excluded)}")
    if skipped:
        print(f"SKIPPED (bad filename, rename these): {skipped}")
    print("-" * 50)

    if args.write:
        with open("sitemap.xml", "w", encoding="utf-8") as f:
            f.write(sitemap)
        with open("robots.txt", "w", encoding="utf-8") as f:
            f.write(robots)
        print("WROTE sitemap.xml and robots.txt")
        print("Next: git add -A && git commit && git push, then submit the sitemap in Search Console.")
    else:
        print("DRY RUN. Preview of robots.txt:\n")
        print(robots)
        print("Re-run with --write to create both files.")


if __name__ == "__main__":
    main()
