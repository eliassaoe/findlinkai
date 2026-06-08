#!/usr/bin/env python3
"""build-clusters.py — styled topical-cluster internal linking, placed above the footer."""
import sys, re, json
from pathlib import Path
from html import escape
from bs4 import BeautifulSoup

CONTENT_DIR = Path(".")
BASE_URL = "https://linkfinderai.com/"
EXCLUDE_DIRS = {".git", ".github", "node_modules", "clusters"}
EXCLUDE_SLUGS = {"index","blog","about-us","pricing","privacy","privacy-policy","terms",
    "terms-of-service","refund-policy","mention-legales","referral-program","history","sitemap"}
CLUSTER_RULES = [
    ("alternatives","Best Alternatives & Competitor Comparisons",["-alternative","-competitors","-alternatives"]),
    ("linkedin","LinkedIn Data, Scraping & APIs",["linkedin"]),
    ("instagram","Instagram Scraping & APIs",["instagram"]),
    ("enrichment","Data Enrichment APIs",["enrichment","enrich"]),
    ("email","Email Finder & Verification",["email","name-to-email"]),
    ("company","Company Data & Firmographics",["company-","domain-to-company","companyurlfinder","firmographic"]),
    ("workflows","Automation Workflows",["workflow"]),
    ("lead-gen","Lead Generation & Prospecting",["lead-","prospect","intent-data","sales","recruit"]),
]
PILLAR_DIR = CONTENT_DIR/"clusters"
MARKER_START="<!-- CLUSTER-LINKS:START -->"; MARKER_END="<!-- CLUSTER-LINKS:END -->"
MAX_SIBLING_LINKS=6
PRIMARY="#2563eb"; TEXT="#374151"; HEADING="#111827"; SUBTLE="#6b7280"; BORDER="#e5e7eb"
CASING={"api":"API","apis":"APIs","b2b":"B2B","b2c":"B2C","crm":"CRM","ai":"AI","url":"URL",
    "seo":"SEO","saas":"SaaS","csv":"CSV","linkedin":"LinkedIn","io":"io","n8n":"n8n","gtm":"GTM","lp":""}
DRY_RUN="--dry-run" in sys.argv

def clean_label(slug):
    out=[]
    for w in slug.replace("_","-").split("-"):
        lw=w.lower()
        if lw in CASING:
            if CASING[lw]: out.append(CASING[lw])
        else: out.append(w.capitalize())
    return " ".join(out)

def discover_pages():
    pages=[]
    for path in CONTENT_DIR.rglob("*.html"):
        if set(path.relative_to(CONTENT_DIR).parts)&EXCLUDE_DIRS: continue
        if path.name.startswith("."): continue
        slug=path.stem
        if slug in EXCLUDE_SLUGS: continue
        rel=path.relative_to(CONTENT_DIR).as_posix()
        pages.append({"path":path,"rel":rel,"slug":slug,"url":BASE_URL+rel,"label":clean_label(slug)})
    return pages

def assign_cluster(slug):
    s=slug.lower()
    for cid,_n,kw in CLUSTER_RULES:
        if any(k in s for k in kw): return cid
    return None

def cluster_name(cid):
    for c,n,_ in CLUSTER_RULES:
        if c==cid: return n
    return cid

def build_block(page,members,cid):
    pillar_url=f"{BASE_URL}clusters/{cid}.html"; pillar_label=cluster_name(cid)
    others=[m for m in members if m["slug"]!=page["slug"]]
    if others:
        idx=next(i for i,m in enumerate(members) if m["slug"]==page["slug"])
        rotated=others[idx%len(others):]+others[:idx%len(others)]; siblings=rotated[:MAX_SIBLING_LINKS]
    else: siblings=[]
    cards="\n".join(f'        <a class="lf-rel__card" href="{escape(m["url"])}">{escape(m["label"])}</a>' for m in siblings)
    style=(".lf-rel{max-width:1200px;margin:3rem auto 1rem;padding:0 1rem;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;}"
        f".lf-rel__title{{font-size:1.25rem;font-weight:600;color:{HEADING};margin:0 0 .25rem;}}"
        f".lf-rel__sub{{font-size:.875rem;color:{SUBTLE};margin:0 0 1.25rem;}}"
        f".lf-rel__sub a{{color:{PRIMARY};text-decoration:none;font-weight:500;}}"
        ".lf-rel__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.75rem;}"
        f".lf-rel__card{{display:block;padding:.85rem 1rem;background:#fff;border:1px solid {BORDER};border-radius:10px;color:{TEXT};text-decoration:none;font-size:.9rem;font-weight:500;transition:all .2s ease;}}"
        f".lf-rel__card:hover{{border-color:{PRIMARY};color:{PRIMARY};box-shadow:0 4px 12px rgba(37,99,235,.1);transform:translateY(-2px);}}")
    return (f"{MARKER_START}\n  <style>{style}</style>\n"
        f'  <section class="lf-rel" aria-label="Related pages">\n'
        f'    <h2 class="lf-rel__title">Explore more in {escape(pillar_label)}</h2>\n'
        f'    <p class="lf-rel__sub">See the full topic &rarr; <a href="{escape(pillar_url)}">{escape(pillar_label)} hub</a></p>\n'
        f'    <div class="lf-rel__grid">\n{cards}\n    </div>\n  </section>\n  {MARKER_END}')

def inject(page,block):
    text=page["path"].read_text(encoding="utf-8",errors="ignore"); original=text
    text=re.sub(r"\s*"+re.escape(MARKER_START)+r".*?"+re.escape(MARKER_END),"",text,flags=re.DOTALL)
    if re.search(r"<footer",text,flags=re.IGNORECASE):
        text=re.sub(r"(<footer)",block+r"\n\n\1",text,count=1,flags=re.IGNORECASE)
    elif re.search(r"</body>",text,flags=re.IGNORECASE):
        text=re.sub(r"</body>",block+"\n</body>",text,count=1,flags=re.IGNORECASE)
    else: text=text+"\n"+block+"\n"
    if text!=original and not DRY_RUN: page["path"].write_text(text,encoding="utf-8")
    return text!=original

def write_pillar(cid,members):
    label=cluster_name(cid)
    lis="\n".join(f'    <li><a href="{escape(m["url"])}">{escape(m["label"])}</a></li>' for m in sorted(members,key=lambda m:m["label"].lower()))
    html=('<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n'
        f"  <title>{escape(label)} | LinkFinder AI</title>\n"
        f'  <meta name="description" content="{escape(label)} — guides, tools and APIs from LinkFinder AI.">\n'
        f'  <link rel="canonical" href="{BASE_URL}clusters/{cid}.html">\n</head>\n<body>\n'
        f"  <h1>{escape(label)}</h1>\n  <p>Replace this with 2-3 paragraphs of original overview content.</p>\n  <ul>\n"+lis+"\n  </ul>\n</body>\n</html>\n")
    if not DRY_RUN:
        PILLAR_DIR.mkdir(exist_ok=True); (PILLAR_DIR/f"{cid}.html").write_text(html,encoding="utf-8")

def main():
    pages=discover_pages(); clusters={}; unclustered=[]
    for p in pages:
        cid=assign_cluster(p["slug"])
        clusters.setdefault(cid,[]).append(p) if cid else unclustered.append(p)
    edited=0; report={}
    for cid,members in clusters.items():
        members.sort(key=lambda m:m["slug"]); write_pillar(cid,members)
        for p in members:
            if inject(p,build_block(p,members,cid)): edited+=1
        report[cid]={"name":cluster_name(cid),"pillar":f"{BASE_URL}clusters/{cid}.html","count":len(members),"pages":[m["rel"] for m in members]}
    report["_unclustered"]=[p["rel"] for p in unclustered]
    if not DRY_RUN: Path("clusters.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Pages scanned: {len(pages)}")
    for cid,members in clusters.items(): print(f"  {cid:14} {len(members):>3} pages -> clusters/{cid}.html")
    print(f"  {'UNCLUSTERED':14} {len(unclustered):>3} pages (tune rules or prune)")
    print(f"Pages edited: {edited}")

if __name__=="__main__": main()