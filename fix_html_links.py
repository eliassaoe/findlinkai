#!/usr/bin/env python3
"""
LinkFinder AI - point every internal link at the canonical URL.

Every page declares a canonical without ".html" (fix_canonicals.py), and the
sitemap lists clean URLs (gen_sitemap.py). But 2,330 internal hrefs, 196
JSON-LD "url" values and 23 relative links pointed at the ".html" form. Google
was crawling both forms of most pages - both show up in PostHog for the same
page, e.g. /best-linkedin-api and /best-linkedin-api.html - and internal link
equity flowed to the non-canonical one. Canonical tags are a hint, not a
redirect; the crawler still spends budget on the duplicate.

Rewrites, in every page under the site root, clusters/ and resources/:

  https://linkfinderai.com/<path>.html[#frag]  ->  https://linkfinderai.com/<path>[#frag]
  https://linkfinderai.com/index.html          ->  https://linkfinderai.com/
  href="<path>.html"  (relative)               ->  href="https://linkfinderai.com/<path>"

Only targets that exist as files are rewritten. Five targets 404 today and are
retargeted through ALIASES (wrong case, a hyphen mismatch, a page that never
existed, and a filename that begins with a zero-width space - renamed by this
script). Anything else unresolvable is reported and left alone.

DRY RUN by default. Pass --write to save. Idempotent.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = "https://linkfinderai.com"
WRITE = "--write" in sys.argv
DIRS = ["", "clusters", "resources"]

ALIASES = {
    "linkedIn-profile-scraper-api": "linkedin-profile-scraper-api",
    "contactout-alternative": "contact-out-alternative",
    "Apollo-alternative": "apollo-api-alternative",
    "apollo-alternative": "apollo-api-alternative",
}

# The comment scraper file begins with U+200B; nothing can link to it as written.
ZWSP = "​"
bad = os.path.join(ROOT, ZWSP + "linkedin-comment-scraper.html")
good = os.path.join(ROOT, "linkedin-comment-scraper.html")
if os.path.exists(bad) and not os.path.exists(good):
    print("rename: <zero-width space>linkedin-comment-scraper.html -> linkedin-comment-scraper.html")
    if WRITE:
        os.rename(bad, good)

def page_exists(path):
    return os.path.isfile(os.path.join(ROOT, path + ".html"))

def resolve(path):
    """Clean path for a link target, or None if nothing exists there."""
    if path == "index":
        return ""
    path = ALIASES.get(path, path)
    if page_exists(path):
        return path
    lower = {p.lower(): p for p in all_pages}
    if path.lower() in lower:
        return lower[path.lower()]
    return None

all_pages = []
for d in DIRS:
    for f in os.listdir(os.path.join(ROOT, d) if d else ROOT):
        if f.endswith(".html"):
            all_pages.append((d + "/" if d else "") + f[:-5])

ABS = re.compile(r"https://linkfinderai\.com/([A-Za-z0-9_./-]+)\.html(#[A-Za-z0-9_-]*)?")
REL = re.compile(r'href="(?!https?:|//|/)([A-Za-z0-9_./-]+)\.html(#[A-Za-z0-9_-]*)?"')

total = 0; files = 0; unresolved = {}
for d in DIRS:
    folder = os.path.join(ROOT, d) if d else ROOT
    for f in sorted(os.listdir(folder)):
        if not f.endswith(".html"):
            continue
        p = os.path.join(folder, f)
        s = io.open(p, encoding="utf-8").read()
        n = 0
        def abs_sub(m):
            global n
            target = resolve(m.group(1))
            if target is None:
                unresolved.setdefault(m.group(1), set()).add(f)
                return m.group(0)
            n += 1
            return SITE + "/" + target + (m.group(2) or "")
        def rel_sub(m):
            global n
            rel = m.group(1)
            if d and not rel.startswith("../"):
                rel = d + "/" + rel
            rel = os.path.normpath(rel).replace("\\", "/")
            target = resolve(rel)
            if target is None:
                unresolved.setdefault(m.group(1), set()).add(f)
                return m.group(0)
            n += 1
            return 'href="%s/%s%s"' % (SITE, target, m.group(2) or "")
        s2 = ABS.sub(abs_sub, s)
        s2 = REL.sub(rel_sub, s2)
        if s2 != s:
            files += 1; total += n
            if WRITE:
                io.open(p, "w", encoding="utf-8").write(s2)
print("%d links rewritten in %d files%s" % (total, files, "" if WRITE else " (dry run)"))
for t, fs in sorted(unresolved.items()):
    print("  unresolved target: %s.html  (in %d files, e.g. %s)" % (t, len(fs), sorted(fs)[0]))
