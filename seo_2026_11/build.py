#!/usr/bin/env python3
"""
seo_2026_11/build.py - the November 2026 SEO pages, built from one template.

Why
---
Keyword research on 11-12 Nov 2026 (Semrush US, KD <= 20, plus Search Console)
found ~45 low-difficulty queries with real volume where LinkFinder AI either
had no page or had one ranking on page 3-6. The plan, the volumes and the
revenue estimate are in docs/seo-plan-2026-11.md.

What it does
------------
Every page spec lives in seo_2026_11/pages_*.py as a dict. This script turns
each one into <slug>.html at the repo root, using the design, trackers, header
and footer of /enrich-sales-navigator-export (the newest hand-built content
page), so the new pages look and track exactly like the rest of the site.

Each page gets: title, meta description, self canonical, Open Graph,
WebPage + BreadcrumbList + FAQPage JSON-LD, one H1, a hero card with a real
next step, content sections, a visible FAQ, a "Related tools and guides"
block (internal links, clean URLs only) and the usual CTA band.

Honesty rules (owner, 12 Nov 2026): LinkFinder AI does not scrape LinkedIn
with cookies or a logged-in browser. Pages that target "scraper" queries say
what the product actually does (enrichment from URLs, cookie-free lead
search, post reactions) and never promise a feature that does not exist.
Credit costs come from app.html `creditCosts`, never from memory.

Usage:  python3 seo_2026_11/build.py          (writes the pages)
        python3 seo_2026_11/build.py --check  (lists what would be written)
"""
import html
import importlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = "https://linkfinderai.com"
MODEL = os.path.join(ROOT, "enrich-sales-navigator-export.html")
CHECK = "--check" in sys.argv

EXTRA_CSS = """
    .hero-actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-top: 1.25rem; }
    .faq-item { border-bottom: 1px solid var(--gray-200); padding: 1rem 0; }
    .faq-item:last-child { border-bottom: 0; }
    .faq-item h3 { font-size: 1.02rem; font-weight: 600; color: var(--gray-900); margin-bottom: 0.4rem; }
    .faq-item p { margin: 0; }
    .related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }
    .related-grid a { display: block; padding: 0.85rem 1rem; border: 1px solid var(--gray-200); border-radius: 0.5rem;
                      text-decoration: none; color: var(--gray-900); font-weight: 600; font-size: 0.95rem; background: #fff; }
    .related-grid a span { display: block; font-weight: 400; color: var(--gray-500); font-size: 0.85rem; margin-top: 0.2rem; }
    .related-grid a:hover { border-color: var(--primary); }
    section.block h3.sub { font-size: 1.08rem; font-weight: 600; color: var(--gray-900); margin: 1.25rem 0 0.5rem; }
    section.block ol, section.block ul.plain { margin: 0 0 1rem 1.25rem; color: var(--gray-700); }
    section.block ol li, section.block ul.plain li { margin-bottom: 0.45rem; }
    .note { border-left: 3px solid var(--primary); background: #f8fafc; padding: 0.85rem 1rem; border-radius: 0 0.5rem 0.5rem 0; color: var(--gray-700); margin: 1rem 0; }
    code { font-family: var(--mono); font-size: 0.85em; background: var(--gray-100); padding: 0.1rem 0.35rem; border-radius: 0.25rem; }
"""


def _slice(t, start, end, include_end=True):
    i = t.index(start)
    j = t.index(end, i)
    return t[i:j + (len(end) if include_end else 0)]


TRACKERS = os.path.join(ROOT, "export-linkedin-group-members.html")


def tracker_block():
    """GTM, PostHog, attribution, Bing UET, Google Ads, Plausible, Tolt and Meta
    pixel, copied from a long-standing tool page so the new pages are measured
    exactly like the old ones (the design model page carries attribution only,
    and docs/organic-to-paid-2026-10.md is built on PostHog landing pageviews).
    lf-gate.js and lf-tools-key.js are tool-widget scripts and are left out."""
    t = open(TRACKERS, encoding="utf-8").read()
    top = t[t.index("<head>") + len("<head>"): t.index("<meta charset")]
    top = re.sub(r'<script src="/js/lf-(gate|tools-key)\.js"></script>\s*', "", top)
    pix = _slice(t, "<!-- Privacy-friendly analytics by Plausible -->", "<!-- End Meta Pixel Code -->")
    return top.strip() + "\n" + pix + "\n"


def load_template():
    t = open(MODEL, encoding="utf-8").read()
    head_prefix = t[: t.index("<title>")]
    head_prefix = head_prefix.replace('<script src="/js/lf-attribution.js"></script>\n', "")
    head_prefix = head_prefix.replace("<head>\n", "<head>\n" + tracker_block(), 1)
    css = _slice(t, "<style>", "</style>")
    css = css.replace("</style>", EXTRA_CSS + "</style>")
    header = _slice(t, '<header class="header">', "</header>")
    footer = _slice(t, '<footer class="footer">', "</footer>")
    return head_prefix, css, header, footer


def esc(s):
    return html.escape(s, quote=True)


def strip_tags(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()


def url(slug):
    return SITE if slug in ("", "/") else f"{SITE}/{slug.strip('/')}"


def render(p, tpl):
    head_prefix, css, header, footer = tpl
    slug = p["slug"]
    canon = url(slug)
    title = p["title"]
    desc = p["description"]
    assert len(desc) <= 165, (slug, len(desc))
    assert len(title) <= 70, (slug, len(title))

    faq = p.get("faq", [])
    ld = [
        {"@context": "https://schema.org", "@type": "WebPage", "name": p["h1"], "url": canon,
         "description": desc, "inLanguage": "en"},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
            {"@type": "ListItem", "position": 2, "name": p.get("crumb", p["h1"]), "item": canon}]},
    ]
    if faq:
        ld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": strip_tags(a)}}
            for q, a in faq]})
    ld_html = "\n".join(
        '  <script type="application/ld+json">' + json.dumps(x, ensure_ascii=False) + "</script>" for x in ld)

    checks = "".join(
        f'        <li><i class="fas fa-check"></i> <span>{c}</span></li>\n' for c in p.get("checks", []))
    actions = "".join(
        f'<a href="{esc(h)}" class="btn{" btn-outline" if i else ""}">{l}</a>'
        for i, (l, h) in enumerate(p.get("actions", [])))
    upload = p.get("upload")
    card_tail = ('      <div id="lfUpload"></div>\n' if upload else
                 f'      <div class="hero-actions">{actions}</div>\n')
    card = (
        '  <div class="container">\n    <div class="tool-card">\n'
        f'      <ul class="checks">\n{checks}      </ul>\n{card_tail}'
        + (f'      <div class="next-step"><p style="margin:0;">{p["card_note"]}</p></div>\n' if p.get("card_note") else "")
        + "    </div>\n  </div>\n")

    secs = []
    for i, (h2, body) in enumerate(p["sections"]):
        alt = " alt" if i % 2 == 0 else ""
        secs.append(f'  <section class="block{alt}">\n    <div class="container narrow">\n'
                    f'      <h2>{h2}</h2>\n{body}\n    </div>\n  </section>\n')
    n = len(secs)
    if faq:
        items = "".join(f'      <div class="faq-item"><h3>{esc(q)}</h3><p>{a}</p></div>\n' for q, a in faq)
        alt = " alt" if n % 2 == 0 else ""
        secs.append(f'  <section class="block{alt}">\n    <div class="container narrow">\n'
                    f'      <h2>Frequently asked questions</h2>\n{items}    </div>\n  </section>\n')
        n += 1
    rel = p.get("related", [])
    if rel:
        cards = "".join(f'        <a href="{url(s)}">{esc(l)}<span>{esc(d)}</span></a>\n' for s, l, d in rel)
        alt = " alt" if n % 2 == 0 else ""
        secs.append(f'  <section class="block{alt}">\n    <div class="container narrow">\n'
                    f'      <h2>Related tools and guides</h2>\n      <div class="related-grid">\n{cards}'
                    '      </div>\n    </div>\n  </section>\n')

    cta_h, cta_p = p.get("cta", ("Try it on your own list",
                                  "Free credits, no card. Run a real sample and check the results yourself before you pay for anything."))
    scripts = '<script src="/js/lf-highticket-cta.js"></script>\n'
    if upload:
        scripts += ('<script src="/js/lf-csv.js"></script>\n<script src="/js/lf-tools-key.js"></script>\n'
                    '<script src="/js/lf-upload-preview.js"></script>\n<script>\n'
                    f"  lfUploadPreview.mount({{\n    container: '#lfUpload',\n    tool: '{upload['tool']}',\n"
                    f"    enrichType: '{upload['enrichType']}',\n    signupUrl: '{SITE}/sign-up'\n  }});\n</script>\n")
    if p.get("script"):
        scripts += p["script"] + "\n"

    out = (
        head_prefix
        + f"<title>{esc(title)}</title>\n"
        f'  <meta name="description" content="{esc(desc)}"/>\n'
        f'  <link rel="canonical" href="{canon}"/>\n'
        f'  <meta property="og:title" content="{esc(title)}"/>\n'
        f'  <meta property="og:description" content="{esc(desc)}"/>\n'
        f'  <meta property="og:url" content="{canon}"/>\n'
        '  <meta property="og:type" content="website"/>\n'
        '  <link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n'
        '  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>\n'
        f"  {css}\n{p.get('extra_css', '')}{ld_html}\n</head>\n<body>\n  {header}\n\n  <main>\n"
        '    <div class="container">\n      <div class="hero">\n'
        f'        <h1>{p["h1"]}</h1>\n        <p class="subtitle">{p["subtitle"]}</p>\n'
        "      </div>\n    </div>\n\n"
        + (p.get("tool_html") or card)
        + "\n" + "".join(secs)
        + '  <section class="cta-band">\n    <div class="container">\n'
        f"      <h2>{cta_h}</h2>\n      <p>{cta_p}</p>\n"
        f'      <a href="{SITE}/sign-up" class="btn">Start free &mdash; no card required</a>\n'
        "    </div>\n  </section>\n</main>\n  "
        + footer + "\n\n" + scripts + "</body>\n</html>\n")
    return out


def all_pages():
    pages = []
    for f in sorted(os.listdir(HERE)):
        if f.startswith("pages_") and f.endswith(".py"):
            sys.path.insert(0, HERE)
            mod = importlib.import_module(f[:-3])
            pages.extend(mod.PAGES)
    slugs = [p["slug"] for p in pages]
    dup = {s for s in slugs if slugs.count(s) > 1}
    assert not dup, dup
    return pages


def main():
    tpl = load_template()
    pages = all_pages()
    for p in pages:
        path = os.path.join(ROOT, p["slug"] + ".html")
        if os.path.exists(path) and not p.get("overwrite"):
            existing = open(path, encoding="utf-8").read()
            if "seo_2026_11/build.py" not in existing:
                raise SystemExit(f"{path} exists and was not built by this script - refusing to overwrite")
        out = render(p, tpl).replace("</head>", "<!-- built by seo_2026_11/build.py -->\n</head>", 1)
        if CHECK:
            print("would write", p["slug"] + ".html", len(out))
            continue
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(out)
        print("wrote", p["slug"] + ".html")
    print(len(pages), "pages")


if __name__ == "__main__":
    main()
