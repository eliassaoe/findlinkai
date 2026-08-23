#!/usr/bin/env python3
"""Derive a video storyboard from an existing resources page.

The resources pages are already guidee-shaped: numbered steps, click targets
named in quotes, real demo data, written in the house voice. So a storyboard
is not authored from scratch — it is lifted from the page the video will be
embedded on, which also guarantees the video and the page tell the same story.

    python3 derive.py ../../resources/find-linkedin-url.html
    python3 derive.py --all

Output goes to scripts/<slug>.md, ready for a human pass to tighten the
narration for spoken delivery (see STYLE.md).
"""
import argparse, glob, html, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# h2 sections that are page furniture, not recordable steps
SKIP = re.compile(
    r"on this page|frequently asked|^tips |explore more|free$|"
    r"^why |^what |related|next steps", re.I)
# sections worth their own video rather than steps in this one
API_SECTION = re.compile(r"\bapi\b|programmatically|mcp\b", re.I)


def text(fragment):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def parse(path):
    raw = open(path, encoding="utf-8").read()
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", raw, flags=re.S)
    m = re.search(r"<h1[^>]*>(.*?)</h1>", body, flags=re.S)
    title = text(m.group(1)) if m else os.path.basename(path)

    m = re.search(r'<meta name="description" content="([^"]*)"', raw)
    summary = html.unescape(m.group(1)) if m else ""

    sections, cur = [], None
    for m in re.finditer(r"<(h2|h3)[^>]*>(.*?)</\1>(.*?)(?=<h[23]|\Z)",
                         body, flags=re.S):
        tag, head, rest = m.group(1), text(m.group(2)), text(m.group(3))
        # strip the leading step-number badge that bleeds in from the next step
        rest = re.sub(r"\s*\d{1,2}\s*$", "", rest)
        if not head:
            continue
        if tag == "h2":
            cur = {"title": head, "steps": [], "skip": bool(SKIP.search(head))}
            sections.append(cur)
        elif cur and not cur["skip"]:
            cur["steps"].append({"title": head, "body": rest})
    return title, summary, [s for s in sections if s["steps"] and not s["skip"]]


def slug_of(path):
    return os.path.splitext(os.path.basename(path))[0]


SMALL = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "into",
         "of", "on", "or", "the", "to", "with", "your", "их"}


def title_case(s):
    """Guidde step titles are Title Case; keep LinkedIn, CSV, API, URL intact."""
    out = []
    for i, w in enumerate(s.split()):
        if any(c.isupper() for c in w[1:]):      # LinkedIn, CSV, API, URL
            out.append(w)
        elif i and w.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


KEEP = {"Google", "Sheets", "Claude", "Excel", "Zapier", "Make", "n8n",
        "HubSpot", "Salesforce", "Airtable"}


def sentence_case(s):
    """Un-title-case an h1 for the cover line, keeping proper nouns intact."""
    return " ".join(
        w if (any(c.isupper() for c in w[1:]) or w.strip(",.") in KEEP)
        else w.lower()
        for w in s.split())


def quoted_target(body, title):
    """Pull the on-screen label the step tells the viewer to click."""
    for src in (title, body):
        q = re.findall(r'"([^"]{2,40})"', src)
        if q:
            return q[0]
    for src in (title, body):
        m = re.search(r"\bclick(?:\s+on)?\s+([A-Z][A-Za-z ]{2,30})", src)
        if m:
            return m.group(1).strip()
    m = re.search(r"^(?:Switch|Open|Select|Enter|Process|Export)\s+(?:to\s+)?"
                  r"(?:the\s+)?(.{2,32})$", title)
    return m.group(1).strip() if m else "—"


def render(path):
    title, summary, sections = parse(path)
    slug = slug_of(path)
    page = os.path.relpath(path, ROOT)
    recordable = [s for s in sections if not API_SECTION.search(s["title"])]
    deferred = [s for s in sections if API_SECTION.search(s["title"])]
    steps = [st for s in recordable for st in s["steps"]]

    video_title = re.sub(r"^How to ", "", title).strip()
    video_title = video_title[0].upper() + video_title[1:] + " With LinkFinder AI"

    L = []
    a = L.append
    a(f"# {video_title}\n")
    a("| | |")
    a("| --- | --- |")
    a(f"| **Slug** | `{slug}` |")
    a(f"| **Target page** | `{page}` |")
    a(f"| **Derived from** | that page's own steps — keep the two in sync |")
    a(f"| **Length** | {len(steps) + 3} steps, ~{max(2, round((len(steps) + 3) * 7 / 60))} min |\n")

    a("## Cover\n")
    intro = summary or f"how to {title[7:].lower()}" if title.startswith("How to") else summary
    m = re.search(r"How to (.+)", title)          # h1 may be "Foo: How to Bar"
    if m:
        lead = "how to " + sentence_case(m.group(1))
    else:                                          # fall back to the meta description
        lead = re.split(r"(?<=[a-z])\. ", summary)[0]
        lead = re.sub(r"^Learn how to ", "how to ", lead)
        lead = sentence_case(lead) if lead else "how to use LinkFinder AI"
    a(f"> In this video we are going to see {lead.rstrip('.')} using LinkFinder AI.\n")

    a("## Click script\n")
    a("Rehearse this before recording. Type each value in one go — a pause "
      "mid-field becomes two steps in the Guidde output.\n")
    a("| # | Action | Target | Notes |")
    a("| --- | --- | --- | --- |")
    a("| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |")
    a("| 02 | Click | first link in the video description | — |")
    a("| 03 | Click | `Start Free Trial` | — |")
    n = 3
    for sec in recordable:
        for st in sec["steps"]:
            n += 1
            a(f"| {n:02d} | Click / Fill | `{quoted_target(st['body'], st['title'])}` | {st['title']} |")
    a(f"| {n + 1:02d} | (closing card) | — | — |\n")

    a("## Step cards\n")
    a("Narration lifted from the page, then tightened for speech. Anything "
      "still reading like prose needs a second pass — see STYLE.md.\n")
    a("**01 What You End Up With**")
    a("> TODO: one sentence naming the result the viewer is about to get.\n")
    a("**02 Open LinkFinder AI**")
    a("> Click the first link in the video description to open LinkFinder AI.\n")
    a("**03 Create Your Free Account**")
    a("> Click Start Free Trial. You get free credits on signup, which covers "
      "everything in this video.\n")
    n = 3
    for sec in recordable:
        a(f"<!-- section: {sec['title']} -->\n")
        for st in sec["steps"]:
            n += 1
            a(f"**{n:02d} {title_case(st['title'])}**")
            a(f"> {st['body']}\n")
    a(f"**{n + 1:02d} Closing card**")
    a("> TODO: name the next action — start a free trial, or the next video "
      "in the series.\n")

    if deferred:
        a("## Deliberately not in this video\n")
        for s in deferred:
            a(f"- **{s['title']}** ({len(s['steps'])} steps) — its own video "
              f"and its own landing page. Folding it in is what pushed the "
              f"reference guidee to 67 steps.")
        a("")

    a("## Embed snippet\n")
    a(f"Paste into `{page}`, matching the pattern in "
      "`linkedin-profile-scraper.html`.\n")
    a("```html")
    a('<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>')
    a('<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">')
    a('  <iframe')
    a('    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"')
    a(f'    title="{video_title}"')
    a('    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"')
    a('    loading="lazy"')
    a('    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"')
    a("    allowfullscreen></iframe>")
    a("</div>")
    a("```")
    return slug, "\n".join(L), len(steps)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", nargs="*")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()

    pages = a.pages
    if a.all:
        pages = [p for p in sorted(glob.glob(os.path.join(ROOT, "resources", "*.html")))
                 if not p.endswith("index.html")]
    if not pages:
        ap.error("pass one or more resources pages, or --all")

    out_dir = os.path.join(HERE, "scripts")
    os.makedirs(out_dir, exist_ok=True)
    for p in pages:
        try:
            slug, md, n = render(p)
        except Exception as e:
            print(f"  ! {os.path.basename(p)}: {e}", file=sys.stderr)
            continue
        if n < 5:
            print(f"  ! {os.path.basename(p)}: only {n} steps parsed — "
                  f"page structure differs, needs a hand-written storyboard",
                  file=sys.stderr)
            continue
        dest = os.path.join(out_dir, slug + ".md")
        open(dest, "w", encoding="utf-8").write(md + "\n")
        print(f"  {n + 3:2d} steps  scripts/{slug}.md")


if __name__ == "__main__":
    main()
