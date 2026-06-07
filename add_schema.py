#!/usr/bin/env python3
"""add_schema.py - inject JSON-LD structured data into plain .html files.
DRY-RUN by default; pass --write to apply. Idempotent. Review with git diff."""
import argparse, json, os, re, sys
try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Missing dependency. Run:  pip install beautifulsoup4")

# ---------------- CONFIG ----------------
SITE_URL = "https://linkfinderai.com"        # no trailing slash
ROOT = "."
ORG = {
    "@type": "Organization",
    "name": "LinkFinderAI",
    "url": SITE_URL,
    "logo": f"{SITE_URL}/logo.png",          # change to your real logo path
    "sameAs": [                              # add your real profile URLs
        # "https://www.tiktok.com/@yourhandle",
        # "https://www.linkedin.com/company/linkfinderai",
    ],
}
DEFAULT_AUTHOR = "LinkFinderAI"
ARTICLE_DIRS = ["blog", "articles", "posts"]
IGNORE = {"node_modules", ".git", "dist", "build", "vendor"}
# ----------------------------------------

def iter_html_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE]
        for fn in filenames:
            if fn.lower().endswith((".html", ".htm")):
                yield os.path.join(dirpath, fn)

def page_url(rel_path):
    parts = rel_path.replace(os.sep, "/")
    if parts.endswith("index.html"):
        parts = parts[:-len("index.html")]
    parts = parts.lstrip("./")
    return f"{SITE_URL}/{parts}".rstrip("/") or SITE_URL

def _walk_objects(data):
    if isinstance(data, dict):
        if "@graph" in data and isinstance(data["@graph"], list):
            for item in data["@graph"]:
                yield from _walk_objects(item)
        yield data
    elif isinstance(data, list):
        for item in data:
            yield from _walk_objects(item)

def existing_types(soup):
    found = set()
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        if not tag.string:
            continue
        try:
            data = json.loads(tag.string)
        except (json.JSONDecodeError, TypeError):
            continue
        for obj in _walk_objects(data):
            t = obj.get("@type")
            if isinstance(t, list):
                found.update(t)
            elif isinstance(t, str):
                found.add(t)
    return found

def titleize(segment):
    seg = re.sub(r"\.html?$", "", segment).replace("-", " ").replace("_", " ").strip()
    return seg.title() if seg else "Home"

def build_breadcrumbs(rel_path, url):
    parts = [p for p in rel_path.replace(os.sep, "/").split("/") if p and p != "."]
    items = [{"@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL}]
    acc, pos = SITE_URL, 2
    for seg in parts:
        if seg.lower() in ("index.html", "index.htm"):
            continue
        acc = f"{acc}/{seg}"
        items.append({"@type": "ListItem", "position": pos, "name": titleize(seg),
                      "item": re.sub(r"\.html?$", "", acc)})
        pos += 1
    if len(items) < 2:
        return None
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}

def meta(soup, **attrs):
    tag = soup.find("meta", attrs=attrs)
    return tag.get("content", "").strip() if tag and tag.get("content") else ""

def build_article(soup, url):
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    if not title and soup.find("h1"):
        title = soup.find("h1").get_text(strip=True)
    desc = meta(soup, attrs={"name": "description"}) or meta(soup, attrs={"property": "og:description"})
    published = meta(soup, attrs={"property": "article:published_time"})
    time_tag = soup.find("time")
    if not published and time_tag and time_tag.get("datetime"):
        published = time_tag["datetime"].strip()
    author = meta(soup, attrs={"name": "author"}) or DEFAULT_AUTHOR
    article = {"@context": "https://schema.org", "@type": "Article",
               "headline": title[:110], "mainEntityOfPage": {"@type": "WebPage", "@id": url},
               "author": {"@type": "Person", "name": author},
               "publisher": {"@type": "Organization", "name": ORG["name"],
                             "logo": {"@type": "ImageObject", "url": ORG["logo"]}}}
    if desc:
        article["description"] = desc
    if published:
        article["datePublished"] = published
    return article

def extract_faq(soup):
    qa = []
    for det in soup.find_all("details"):
        summ = det.find("summary")
        if not summ:
            continue
        q = summ.get_text(strip=True)
        summ.extract()
        a = det.get_text(" ", strip=True)
        if q and a:
            qa.append((q, a))
    if not qa:
        return None
    return {"@context": "https://schema.org", "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": q,
                            "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]}

def org_block():
    return {"@context": "https://schema.org", **ORG}

def website_block():
    return {"@context": "https://schema.org", "@type": "WebSite", "name": ORG["name"], "url": SITE_URL}

def render(block):
    return f'<script type="application/ld+json">\n{json.dumps(block, indent=2, ensure_ascii=False)}\n</script>\n'

def process(path, write, do_faq):
    rel = os.path.relpath(path, ROOT)
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    soup = BeautifulSoup(content, "html.parser")
    have = existing_types(soup)
    url = page_url(rel)
    is_home = os.path.basename(rel).lower() in ("index.html", "index.htm") and os.path.dirname(rel) in ("", ".")
    in_article_dir = any(rel.replace(os.sep, "/").startswith(d.rstrip("/") + "/") for d in ARTICLE_DIRS)
    blocks, added = [], []
    if "Organization" not in have:
        blocks.append(org_block()); added.append("Organization")
    if is_home and "WebSite" not in have:
        blocks.append(website_block()); added.append("WebSite")
    bc = build_breadcrumbs(rel, url)
    if bc and "BreadcrumbList" not in have:
        blocks.append(bc); added.append("BreadcrumbList")
    if in_article_dir and "Article" not in have:
        blocks.append(build_article(soup, url)); added.append("Article")
    if do_faq and "FAQPage" not in have:
        faq = extract_faq(soup)
        if faq:
            blocks.append(faq); added.append(f"FAQPage({len(faq['mainEntity'])}Q)")
    if not blocks:
        return rel, []
    if write:
        snippet = "".join(render(b) for b in blocks)
        m = re.search(r"</head\s*>", content, re.IGNORECASE) or re.search(r"</body\s*>", content, re.IGNORECASE)
        content = content[:m.start()] + snippet + content[m.start():] if m else content + "\n" + snippet
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    return rel, added

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--faq", action="store_true")
    args = ap.parse_args()
    files = list(iter_html_files(ROOT))
    if not files:
        sys.exit("No .html files found. Run this from your site's root folder.")
    touched = 0
    for path in files:
        rel, added = process(path, args.write, args.faq)
        if added:
            touched += 1
            verb = "ADDED" if args.write else "would add"
            print(f"{verb}: {rel:50s} -> {', '.join(added)}")
    print("-" * 60)
    print(f"{'WROTE' if args.write else 'DRY RUN (no files changed)'}. {touched} of {len(files)} file(s) need schema.")
    if not args.write and touched:
        print("Re-run with --write to apply, then review with: git diff")

if __name__ == "__main__":
    main()
