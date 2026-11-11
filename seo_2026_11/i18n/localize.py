#!/usr/bin/env python3
"""
seo_2026_11/i18n/localize.py - French, German and Spanish versions of the key
tool pages, at /fr/<slug>, /de/<slug>, /es/<slug>.

How a localized page is made (owner, 12 Nov 2026: "do not break the English
traffic, get the tags right, target the keyword that ranks in each language"):

1. Start from the live English page, so the tool itself (markup, inline
   scripts, styles, IDs) is byte-for-byte the one that works today.
2. Keep only the page chrome and the tool: header, sticky bar, the main
   container with the lookup form and results, the free-limit modal, the
   footer, and every top-level <script>/<style>. The English-only marketing
   sections under the tool (testimonials, legacy pricing box, FAQ, related
   tools, compare strips) are dropped; testimonials in particular are not
   republished in other languages.
3. Translate every visible text node, the alt/title/placeholder/aria-label
   attributes and the UI strings of the inline scripts with the dictionaries
   in <lang>.py. The build FAILS if any kept segment has no translation, so a
   page is never half English (Google decides a page's language from its
   visible text).
4. Add native-language content written for that market's keyword (CONTENT in
   <lang>.py): sections, a FAQ (visible and as FAQPage JSON-LD) and links to
   the other pages in the same language.
5. <html lang>, self-referencing canonical, og:locale, and a full reciprocal
   hreflang set (en, fr, de, es, x-default -> English) on every version.
   Internal links to a page that has a version in the same language point to
   it; everything else stays on the English URL.

The English pages only receive the hreflang <link> tags in <head> and a small
language switcher above the footer (markers LF-HREFLANG / LF-LANGSWITCH).
Nothing else on them changes.

Usage: python3 seo_2026_11/i18n/localize.py           build everything
       python3 seo_2026_11/i18n/localize.py --missing list untranslated segments
"""
import html
import importlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SITE = "https://linkfinderai.com"
sys.path.insert(0, HERE)

PAGES = ["linkedin-phone-number-finder", "linkedin-email-finder", "linkedin-search-by-email",
         "linkedin-url-finder", "company-url-finder"]
LANGS = ["fr", "de", "es"]
LOCALE = {"fr": "fr_FR", "de": "de_DE", "es": "es_ES"}
KEEP_CLASSES = {"header", "sticky-cta", "container", "limitModal", "footer", "turnstile-widget", "upgradeBar"}

TOKEN = re.compile(r'(<!--.*?-->|<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<[^>]+>)', re.S)
ATTR = re.compile(r'\b(alt|title|placeholder|aria-label)="([^"]*)"')
LETTERS = re.compile(r"[A-Za-z]")
SKIP_SEGMENTS = re.compile(r"^(=LINKFINDER\(\)|https?://\S+|[\w.+-]+@[\w.-]+|linkedin\.com/\S*|[A-Z]{2}|&times;|"
                           r"&nbsp;·&nbsp;|LinkFinder ?AI|LinkFinderAI|Linkfinder AI|Link Finder Ai|API|CSV|"
                           r"firstname\.lastname@company\.com|support@linkfinderai\.com)$")


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


# --------------------------------------------------------------------- body
def top_level_blocks(body):
    """Split <body> content into top-level blocks: (kind, text) where kind is the
    first class/id of the element, 'script', 'style', 'comment' or 'text'."""
    blocks, i, n = [], 0, len(body)
    void = {"br", "img", "input", "meta", "link", "hr", "source"}
    while i < n:
        if body.startswith("<!--", i):
            j = body.index("-->", i) + 3
            blocks.append(("comment", body[i:j])); i = j; continue
        m = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.S).match(body, i)
        if m:
            blocks.append((m.group(1), m.group(0))); i = m.end(); continue
        m = re.compile(r"<([a-zA-Z][\w-]*)([^>]*)>").match(body, i)
        if m:
            tag, attrs = m.group(1).lower(), m.group(2)
            cls = re.search(r'\b(?:class|id)="([^"]*)"', attrs)
            kind = (cls.group(1).split()[0] if cls else tag)
            if tag in void or attrs.rstrip().endswith("/"):
                blocks.append((kind, m.group(0))); i = m.end(); continue
            depth, j = 0, i
            pat = re.compile(r"<!--.*?-->|<script\b.*?</script>|<style\b.*?</style>|<(/?)" + tag + r"\b[^>]*>", re.S | re.I)
            for mm in pat.finditer(body, i):
                if mm.group(0).startswith(("<!--", "<script", "<style")) and not mm.group(0).lower().startswith("<" + tag):
                    continue
                if mm.group(1) == "/":
                    depth -= 1
                    if depth == 0:
                        j = mm.end(); break
                else:
                    depth += 1
            blocks.append((kind, body[i:j])); i = j; continue
        j = body.find("<", i + 1)
        j = n if j < 0 else j
        blocks.append(("text", body[i:j])); i = j
    return blocks


# --------------------------------------------------------------- translation
class Missing(Exception):
    pass


def tr(seg, d, missing):
    k = norm(seg)
    if not k or not LETTERS.search(k) or SKIP_SEGMENTS.match(k):
        return seg
    if k in d:
        lead = seg[: len(seg) - len(seg.lstrip())]
        trail = seg[len(seg.rstrip()):]
        return lead + d[k] + trail
    missing.add(k)
    return seg


def js_replace(script, en, loc):
    """Replace a UI string inside a script, escaping the translation for the quote
    that encloses it (French and Spanish apostrophes inside '...' broke the
    scripts in the first build)."""
    out, i = [], 0
    while True:
        j = script.find(en, i)
        if j < 0:
            out.append(script[i:])
            return "".join(out)
        # nearest unescaped quote char before the match decides the string type
        k, q = j - 1, None
        while k >= 0:
            if script[k] in "'\"`" and (k == 0 or script[k - 1] != "\\"):
                q = script[k]
                break
            if script[k] == "\n":
                break
            k -= 1
        s = loc.replace("\\", "\\\\")
        if q in ("'", '"'):
            s = s.replace(q, "\\" + q)
        elif q == "`":
            s = s.replace("`", "\\`").replace("${", "\\${")
        out.append(script[i:j] + s)
        i = j + len(en)


def translate_html(fragment, d, js, missing):
    out = []
    for part in TOKEN.split(fragment):
        if not part:
            continue
        if part.startswith("<script"):
            if "application/ld+json" in part:
                out.append("")  # replaced by localized JSON-LD in <head>
                continue
            for en, loc in js.items():
                part = js_replace(part, en, loc)
            if "/js/lf-highticket-cta.js" in part:
                part = ""  # English-only CTA line; not shown on localized pages
            out.append(part)
        elif part.startswith(("<style", "<!--")):
            out.append(part)
        elif part.startswith("<"):
            out.append(ATTR.sub(lambda m: f'{m.group(1)}="{tr(m.group(2), d, missing)}"'
                                if LETTERS.search(m.group(2)) else m.group(0), part))
        else:
            out.append(tr(part, d, missing))
    return "".join(out)


def relink(fragment, lang):
    def fix(m):
        slug = m.group(1).strip("/")
        if slug in PAGES:
            return f'href="{SITE}/{lang}/{slug}"'
        return m.group(0)
    return re.sub(r'href="https://linkfinderai\.com/([^"#?]*)"', fix, fragment)


# ---------------------------------------------------------------- head bits
def hreflang_block(slug):
    rows = [f'<link rel="alternate" hreflang="en" href="{SITE}/{slug}"/>']
    rows += [f'<link rel="alternate" hreflang="{l}" href="{SITE}/{l}/{slug}"/>' for l in LANGS]
    rows.append(f'<link rel="alternate" hreflang="x-default" href="{SITE}/{slug}"/>')
    return "<!-- LF-HREFLANG:START -->\n  " + "\n  ".join(rows) + "\n  <!-- LF-HREFLANG:END -->"


def switcher(slug, current):
    names = {"en": "English", "fr": "Français", "de": "Deutsch", "es": "Español"}
    links = []
    for l in ["en"] + LANGS:
        href = f"{SITE}/{slug}" if l == "en" else f"{SITE}/{l}/{slug}"
        if l == current:
            links.append(f'<span aria-current="true" style="font-weight:600;color:#111827;">{names[l]}</span>')
        else:
            links.append(f'<a href="{href}" hreflang="{l}" lang="{l}" style="color:#2563eb;text-decoration:none;">{names[l]}</a>')
    return ('<!-- LF-LANGSWITCH:START -->\n<nav aria-label="Language" style="max-width:1100px;margin:1.5rem auto;'
            'padding:0 1.5rem;font:0.9rem Inter,-apple-system,sans-serif;color:#6b7280;display:flex;gap:0.9rem;'
            'flex-wrap:wrap;justify-content:center;">' + " · ".join(links) + "</nav>\n<!-- LF-LANGSWITCH:END -->\n")


def put_before_footer(t, block):
    for m in re.finditer(r"<footer[\s>]", t):
        lo = t.rfind("<!--", 0, m.start())
        if lo < 0 or t.rfind("-->", lo, m.start()) >= 0:
            return t[:m.start()] + block + t[m.start():]
    raise SystemExit("no footer")


def strip_markers(t, name):
    return re.sub(rf"\s*<!-- {name}:START -->.*?<!-- {name}:END -->\n?", "\n", t, flags=re.S)


CONTENT_STYLE = ('<style>.lf-loc{background:#fff;border-top:1px solid #e5e7eb;padding:2.5rem 0}.lf-loc.alt{background:#f9fafb}'
                 '.lf-loc .lf-inner{max-width:780px;margin:0 auto;padding:0 1.5rem;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
                 '.lf-loc h2{font-size:1.4rem;font-weight:700;color:#111827;margin:0 0 1rem;letter-spacing:-.01em}'
                 '.lf-loc h3{font-size:1.05rem;font-weight:600;color:#111827;margin:1.1rem 0 .4rem}'
                 '.lf-loc p,.lf-loc li{color:#374151;line-height:1.7;font-size:1rem}.lf-loc p{margin:0 0 .9rem}'
                 '.lf-loc ol,.lf-loc ul{margin:0 0 .9rem 1.25rem}.lf-loc li{margin-bottom:.4rem}.lf-loc a{color:#2563eb}'
                 '.lf-loc table{width:100%;border-collapse:collapse;font-size:.92rem;margin:.5rem 0 1rem}'
                 '.lf-loc th,.lf-loc td{text-align:left;padding:.6rem .75rem;border-bottom:1px solid #e5e7eb;vertical-align:top}'
                 '.lf-loc th{background:#f9fafb;font-weight:600;color:#374151}'
                 '.lf-loc .lf-links{display:flex;flex-wrap:wrap;gap:.5rem}.lf-loc .lf-links a{border:1px solid #e5e7eb;border-radius:999px;'
                 'padding:.4rem .85rem;text-decoration:none;color:#111827;font-size:.92rem}.lf-loc .lf-links a:hover{border-color:#2563eb}'
                 '.lf-loc .faq-q{font-weight:600;color:#111827;margin:1rem 0 .3rem}</style>')


def content_html(c, lang, slug, all_titles):
    parts = [CONTENT_STYLE]
    for i, (h2, body) in enumerate(c["sections"]):
        parts.append(f'<section class="lf-loc{" alt" if i % 2 else ""}"><div class="lf-inner"><h2>{h2}</h2>{body}</div></section>')
    faq = "".join(f'<h3 class="faq-q">{html.escape(q)}</h3><p>{a}</p>' for q, a in c["faq"])
    parts.append(f'<section class="lf-loc{" alt" if len(c["sections"]) % 2 else ""}"><div class="lf-inner"><h2>{c["faq_title"]}</h2>{faq}</div></section>')
    rel = "".join(f'<a href="{SITE}/{lang}/{s}">{all_titles[s]}</a>' for s in PAGES if s != slug)
    parts.append(f'<section class="lf-loc"><div class="lf-inner"><h2>{c["related_title"]}</h2><div class="lf-links">{rel}</div></div></section>')
    return "<!-- LF-LOC-CONTENT -->\n" + "\n".join(parts) + "\n"


def jsonld(c, lang, slug):
    url = f"{SITE}/{lang}/{slug}"
    strip = lambda s: norm(re.sub(r"<[^>]+>", "", s))
    data = [
        {"@context": "https://schema.org", "@type": "WebPage", "name": c["h1"], "url": url,
         "description": c["description"], "inLanguage": lang},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "LinkFinder AI", "item": SITE},
            {"@type": "ListItem", "position": 2, "name": c["h1"], "item": url}]},
        {"@context": "https://schema.org", "@type": "FAQPage", "inLanguage": lang, "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": strip(a)}} for q, a in c["faq"]]},
    ]
    return "\n".join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False) + "</script>" for x in data)


def localize(slug, lang, mod, missing):
    src = open(os.path.join(ROOT, slug + ".html"), encoding="utf-8").read()
    src = strip_markers(src, "LF-HREFLANG")
    src = strip_markers(src, "LF-LANGSWITCH")
    c = mod.CONTENT[slug]
    head, rest = src.split("<body", 1)
    body_open, body = rest.split(">", 1)
    body, tail = body.rsplit("</body>", 1)

    kept = []
    for kind, block in top_level_blocks(body):
        if kind in ("script", "style") or kind in KEEP_CLASSES:
            kept.append(block)
        elif kind == "text" and not block.strip():
            kept.append(block)
    body = "".join(kept)
    body = translate_html(body, mod.DICT, mod.JS, missing)
    body = relink(body, lang)
    # H1 and hero line are the page's keyword: set them from CONTENT.
    body = re.sub(r"(<h1\b[^>]*>).*?(</h1>)", lambda m: m.group(1) + c["h1"] + m.group(2), body, count=1, flags=re.S)
    body = put_before_footer(body, content_html(c, lang, slug, {s: mod.CONTENT[s]["short"] for s in PAGES})
                             + switcher(slug, lang))

    url = f"{SITE}/{lang}/{slug}"
    head = head.replace('<html lang="en">', f'<html lang="{lang}">', 1)
    head = re.sub(r"<title>.*?</title>", f"<title>{html.escape(c['title'], quote=False)}</title>", head, count=1, flags=re.S)
    head = re.sub(r'(<meta\s+name="description"\s+content=")[^"]*(")', lambda m: m.group(1) + html.escape(c["description"]) + m.group(2), head, count=1)
    head = re.sub(r'(<meta\s+property="og:title"\s+content=")[^"]*(")', lambda m: m.group(1) + html.escape(c["title"]) + m.group(2), head)
    head = re.sub(r'(<meta\s+property="og:description"\s+content=")[^"]*(")', lambda m: m.group(1) + html.escape(c["description"]) + m.group(2), head)
    head = re.sub(r'(<meta\s+name="twitter:title"\s+content=")[^"]*(")', lambda m: m.group(1) + html.escape(c["title"]) + m.group(2), head)
    head = re.sub(r'(<meta\s+name="twitter:description"\s+content=")[^"]*(")', lambda m: m.group(1) + html.escape(c["description"]) + m.group(2), head)
    head = re.sub(r'<meta\s+name="keywords"[^>]*>\s*', "", head)
    head = re.sub(r'<link rel="canonical" href="[^"]*"\s*/?>', f'<link rel="canonical" href="{url}"/>', head)
    head = re.sub(r'(<meta\s+property="og:url"\s+content=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), head)
    head = re.sub(r'<script type="application/ld\+json">.*?</script>\s*', "", head, flags=re.S)
    head = re.sub(r"<!-- FAQ-SCHEMA:START -->\s*<!-- FAQ-SCHEMA:END -->\s*", "", head)
    extra = (f'<meta property="og:locale" content="{LOCALE[lang]}"/>\n  ' + hreflang_block(slug) + "\n" + jsonld(c, lang, slug) + "\n")
    head = head.replace("</head>", extra + "</head>", 1)
    assert head.count('rel="canonical"') == 1, (slug, lang)
    return head + "<body" + body_open + ">" + body + "</body>" + tail


def patch_english(slug):
    p = os.path.join(ROOT, slug + ".html")
    t = open(p, encoding="utf-8").read()
    t = strip_markers(t, "LF-HREFLANG")
    t = strip_markers(t, "LF-LANGSWITCH")
    t = t.replace("</head>", "  " + hreflang_block(slug) + "\n</head>", 1)
    t = put_before_footer(t, switcher(slug, "en"))
    open(p, "w", encoding="utf-8").write(t)


def main():
    show_missing = "--missing" in sys.argv
    allmissing = {}
    outputs = {}
    for lang in LANGS:
        mod = importlib.import_module(lang)
        importlib.reload(mod)
        missing = set()
        for slug in PAGES:
            outputs[(lang, slug)] = localize(slug, lang, mod, missing)
        allmissing[lang] = missing
    if any(allmissing.values()):
        for lang, m in allmissing.items():
            if m:
                print(f"--- {lang}: {len(m)} untranslated")
                if show_missing:
                    for s in sorted(m):
                        print(json.dumps(s, ensure_ascii=False))
        raise SystemExit(1)
    for (lang, slug), out in outputs.items():
        os.makedirs(os.path.join(ROOT, lang), exist_ok=True)
        with open(os.path.join(ROOT, lang, slug + ".html"), "w", encoding="utf-8") as fh:
            fh.write(out)
        print("wrote", f"{lang}/{slug}.html")
    for slug in PAGES:
        patch_english(slug)
        print("hreflang + switcher on", slug)


if __name__ == "__main__":
    main()
