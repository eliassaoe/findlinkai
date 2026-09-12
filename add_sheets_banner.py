#!/usr/bin/env python3
"""
LinkFinder AI - put the Google Sheets add-on in front of free-tool traffic.

The add-on is the cleanest ICP filter the product has: nobody installs a
spreadsheet function to look up one person. Over 60 days sheets_addon_clicked
fired for 20 people, every one of them from inside the app (bulk_upload,
integrations_page, tasks, onboarding). Not a single marketing page linked it, so
the 2,382 monthly visitors on the phone-finder page - the largest free-tool
audience on the site - were never offered it.

Two placements, tracked separately so their pull can be compared:

  topbar   a thin strip above the header, for everyone who lands. The header is
           position:static on these pages, so the strip pushes it down instead
           of overlapping it. Dismissible, remembered per browser.

  banner   a block after the RESULTS section, not before it. Someone who has
           just seen one answer is the right person to ask "now do that for
           every row" - but only once they have the answer they came for.
           Placing it above the results would bury the thing they asked for
           behind a promo.

The banner names the CSV and API routes too, so it qualifies for bulk intent
generally rather than only for Sheets users.

Skipped on purpose:
  - app*.html / beta-index.html : logged-in screens, disallowed in robots.txt,
    and app.html already carries its own add-on links
  - index.html                  : the homepage converts best of any page on the
                                  site; it already mentions Sheets and is not a
                                  free-tool page

Idempotent - re-running removes both blocks and re-inserts them, so an edit to
the copy or the anchor moves existing blocks rather than stacking new ones.
"""

import glob
import io
import os
import re

OUT = os.path.dirname(os.path.abspath(__file__))
ADDON_URL = "https://workspace.google.com/marketplace/app/linkfinder_ai/1096371450007"

BAR_START, BAR_END = "<!-- LF-SHEETS-TOPBAR:START -->", "<!-- LF-SHEETS-TOPBAR:END -->"
BLK_START, BLK_END = "<!-- LF-SHEETS-BANNER:START -->", "<!-- LF-SHEETS-BANNER:END -->"

SKIP = {
    "app.html", "app-beta.html", "app-beta-2.html", "app_beta.html",
    "beta-index.html", "index.html",
}

TOPBAR = """%(start)s
<style>
  .lf-sheets-bar { background: #188038; color: #fff; font-family: 'Inter', -apple-system,
    BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 0.9375rem; line-height: 1.45; }
  .lf-sheets-bar .lf-bar-in { max-width: 1180px; margin: 0 auto; padding: 0.6rem 1.25rem;
    display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap; }
  .lf-sheets-bar .lf-bar-txt { flex: 1 1 auto; min-width: 220px; }
  .lf-sheets-bar code { background: rgba(255,255,255,0.18); padding: 0.08em 0.35em;
    border-radius: 3px; font-size: 0.92em; }
  .lf-sheets-bar a.lf-bar-cta { background: #fff; color: #146c2e; font-weight: 700;
    text-decoration: none; padding: 0.4rem 0.95rem; border-radius: 5px; white-space: nowrap; }
  .lf-sheets-bar a.lf-bar-cta:hover { background: #eaf5ed; }
  .lf-sheets-bar button.lf-bar-x { background: none; border: 0; color: rgba(255,255,255,0.75);
    font-size: 1.15rem; line-height: 1; cursor: pointer; padding: 0 0.15rem; }
  .lf-sheets-bar button.lf-bar-x:hover { color: #fff; }
  @media (max-width: 560px) { .lf-sheets-bar .lf-bar-in { padding: 0.55rem 1rem; gap: 0.6rem; } }
</style>
<div class="lf-sheets-bar" id="lfSheetsBar">
  <div class="lf-bar-in">
    <span class="lf-bar-txt">Get our Google Sheets extension &mdash; enrich every row of a
      sheet with <code>=LINKFINDER()</code>.</span>
    <a class="lf-bar-cta" href="%(url)s" target="_blank" rel="noopener"
       onclick="try{posthog.capture('sheets_addon_clicked',{source:'tool_page_topbar',page:'%(slug)s'})}catch(e){}">Install the add-on</a>
    <button class="lf-bar-x" type="button" aria-label="Dismiss" onclick="lfDismissSheetsBar()">&times;</button>
  </div>
</div>
<script>
  function lfDismissSheetsBar(){
    var el = document.getElementById('lfSheetsBar');
    if (el) el.hidden = true;
    try { localStorage.setItem('lf_sheets_bar_dismissed','1'); } catch(e) {}
    try { posthog.capture('sheets_addon_bar_dismissed',{page:'%(slug)s'}); } catch(e) {}
  }
  (function(){
    try {
      if (localStorage.getItem('lf_sheets_bar_dismissed') === '1') {
        var el = document.getElementById('lfSheetsBar');
        if (el) el.hidden = true;
      }
    } catch(e) {}
  })();
</script>
%(end)s"""

BANNER = """%(start)s
<style>
  .lf-sheets-cta { margin: 1.5rem auto; max-width: 640px; border: 1px solid #d7e5db;
    border-left: 4px solid #188038; background: #f4faf6; border-radius: 8px;
    padding: 1.25rem 1.4rem;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .lf-sheets-cta h3 { margin: 0 0 0.45rem; font-size: 1.05rem; font-weight: 700; color: #12241a;
    letter-spacing: -0.01em; }
  .lf-sheets-cta p { margin: 0 0 0.9rem; font-size: 0.9375rem; line-height: 1.6; color: #38473e; }
  .lf-sheets-cta p:last-of-type { margin-bottom: 0; }
  .lf-sheets-cta code { background: #e4f0e8; padding: 0.1em 0.4em; border-radius: 3px;
    font-size: 0.9em; color: #12241a; }
  .lf-sheets-cta .lf-sheets-btn { display: inline-block; background: #188038; color: #fff;
    font-weight: 600; font-size: 0.9375rem; text-decoration: none; padding: 0.6rem 1.15rem;
    border-radius: 6px; }
  .lf-sheets-cta .lf-sheets-btn:hover { background: #146c2e; }
  .lf-sheets-cta .lf-sheets-alt { margin-top: 0.85rem; font-size: 0.875rem; color: #5b6b61; }
  .lf-sheets-cta .lf-sheets-alt a { color: #146c2e; }
</style>
<section class="lf-sheets-cta">
  <h3>Doing this for a whole list?</h3>
  <p>Install the LinkFinder AI add-on for Google Sheets and call
     <code>=LINKFINDER()</code> straight in a cell. Same data as the tool above,
     filled down every row of your sheet, with no export and no re-upload.</p>
  <a class="lf-sheets-btn" href="%(url)s" target="_blank" rel="noopener"
     onclick="try{posthog.capture('sheets_addon_clicked',{source:'tool_page_banner',page:'%(slug)s'})}catch(e){}">
    Install the Google Sheets add-on
  </a>
  <p class="lf-sheets-alt">Working from a file or from code instead?
     Upload a CSV in the bulk tab above, or run the same lookup through the
     <a href="https://linkfinderai.com/api-documentation">API</a>.</p>
</section>
%(end)s"""


def strip_block(html, start, end):
    return re.sub(re.escape(start) + r".*?" + re.escape(end) + r"\n?", "", html, flags=re.S)


def close_of_div(html, open_idx):
    """Index just past the </div> closing the <div> that opens at open_idx."""
    tag = re.compile(r"<\s*(/?)div\b", re.I)
    depth, pos = 0, open_idx
    while True:
        m = tag.search(html, pos)
        if not m:
            return -1
        depth += -1 if m.group(1) else 1
        pos = m.end()
        if depth == 0:
            end = html.find(">", m.end())
            return end + 1 if end != -1 else -1


def banner_anchor(html):
    """Prefer just after the results section, so the answer is never buried."""
    for pat in (r'<div[^>]*id=["\']resultsSection["\']',
                r'<div[^>]*class=["\'][^"\']*\bmain-card\b'):
        m = re.search(pat, html, re.I)
        if m:
            idx = close_of_div(html, m.start())
            if idx != -1:
                return idx, ("after results" if "results" in pat else "after tool card")
    idx = html.find("<footer")
    return (idx, "before footer") if idx != -1 else (-1, "no anchor")


def apply_to(path):
    fname = os.path.basename(path)
    slug = fname[:-5].lstrip("​")
    html = io.open(path, encoding="utf-8").read()

    html = strip_block(html, BAR_START, BAR_END)
    html = strip_block(html, BLK_START, BLK_END)

    fields = {"url": ADDON_URL, "slug": slug}
    bar = TOPBAR % dict(fields, start=BAR_START, end=BAR_END)
    blk = BANNER % dict(fields, start=BLK_START, end=BLK_END)

    idx, where = banner_anchor(html)
    if idx == -1:
        return "no anchor - skipped"
    html = html[:idx] + "\n" + blk + "\n" + html[idx:]

    m = re.search(r"<body[^>]*>", html, re.I)
    if not m:
        return "no body tag - skipped"
    html = html[:m.end()] + "\n" + bar + "\n" + html[m.end():]

    io.open(path, "w", encoding="utf-8").write(html)
    return "topbar + banner (%s)" % where


def main():
    for path in sorted(glob.glob(os.path.join(OUT, "*.html"))):
        fname = os.path.basename(path)
        if fname in SKIP:
            continue
        html = io.open(path, encoding="utf-8", errors="replace").read()
        if not (("main-card" in html) or ("switchMode(" in html) or ('id="csvFile"' in html)):
            continue
        print("%-46s %s" % (fname, apply_to(path)))


if __name__ == "__main__":
    main()
