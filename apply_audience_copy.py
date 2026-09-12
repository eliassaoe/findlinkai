#!/usr/bin/env python3
"""
LinkFinder AI - rewrite the homepage for a named audience, and add the two
things the audience pages were missing.

Modelled on what SignalHire does well, not on their claims. The pattern worth
copying is that every block opens by naming a situation the reader is already in
("CRM Missing Info?"), which filters the audience before any product copy lands.
The part not worth copying is their numbers - "60-70% connect rates", "bounce
under 5% guaranteed" - which are unverifiable from outside. Every figure used
here traces to a query that can be re-run:

    95,000+ enrichments   enrichment_history      (95,102 rows)
    7,500 users           linkfinderai_users      (7,500 rows)
    25,000 rows per run   already in our own bulk page copy

That last one is the headline nobody was using. SignalHire advertises "bulk
enrich up to 1,000 people per run"; we already do 25x that and never said so.

HOMEPAGE. The hero said "Find anyone's LinkedIn, email & phone - instantly."
"Anyone" addresses nobody, which is precisely the problem: it invites the
single-lookup visitor who converts at 2.2% rather than the team with a list who
converts at ~17%. It now names the audience and the unit of work (a list), and
a workflow-block section follows the demo.

AUDIENCE PAGES. Deliberately NOT rewritten. /for-recruiting-teams already opens
"For talent teams who have the candidates already and cannot reach them" and
carries a section headed "On phone coverage, honestly" that tells the reader
mobile coverage is partial for every vendor in the market. That is stronger
trust-building than anything on SignalHire's site and replacing it with
claim-stacking would be a downgrade. They were missing two things only - a proof
band and a setup ladder - so that is all that is added.

Idempotent - re-running replaces the injected blocks rather than stacking them.
"""

import io
import os
import re

OUT = os.path.dirname(os.path.abspath(__file__))

WF_START, WF_END = "<!-- LF-WORKFLOWS:START -->", "<!-- LF-WORKFLOWS:END -->"
PB_START, PB_END = "<!-- LF-PROOFBAND:START -->", "<!-- LF-PROOFBAND:END -->"

AUDIENCE_PAGES = ["for-recruiting-teams.html", "for-sales-teams.html", "for-revops-teams.html"]

# --- homepage hero -------------------------------------------------------

HERO_SWAPS = [
    (
        '<div class="hero-tag"><i class="fas fa-bolt"></i> LinkedIn & Contact Finder</div>',
        '<div class="hero-tag"><i class="fas fa-bolt"></i> For recruiting, sales and RevOps teams</div>',
    ),
    (
        "<h1>Find anyone's LinkedIn,<br><span>email &amp; phone — instantly.</span></h1>",
        "<h1>Turn LinkedIn profiles into<br><span>verified emails &amp; direct dials.</span></h1>",
    ),
    (
        "<h1>Find anyone's LinkedIn,<br><span>email & phone — instantly.</span></h1>",
        "<h1>Turn LinkedIn profiles into<br><span>verified emails &amp; direct dials.</span></h1>",
    ),
    (
        "<p>Give LinkFinder AI a name, company, or LinkedIn URL and get verified contact "
        "and company data back in seconds. Then connect it to n8n, Make, or Zapier and let "
        "it keep finding and enriching your CRM automatically — on schedule, GDPR-compliant.</p>",
        "<p>The list already exists — the shortlist, the Sales Navigator export, the CRM "
        "segment full of profiles nobody can email or call. Upload it and get contactable "
        "people back: up to <strong>25,000 rows a run</strong>, inside Google Sheets, or "
        "through the API. Over 95,000 enrichments run so far.</p>",
    ),
    (
        '<div class="hero-social-proof-item"><i class="fas fa-check-circle"></i><span>Setup in 5 minutes</span></div>',
        '<div class="hero-social-proof-item"><i class="fas fa-check-circle"></i><span>Up to 25,000 rows per run</span></div>',
    ),
    (
        '<div class="hero-social-proof-item"><i class="fas fa-check-circle"></i><span>Free credits to start</span></div>',
        '<div class="hero-social-proof-item"><i class="fas fa-check-circle"></i><span>Runs in Sheets, n8n and your CRM</span></div>',
    ),
]

HOME_TITLE = ("LinkFinder AI - LinkedIn to Verified Emails and Direct Dials, in Bulk")
HOME_DESC = (
    "Turn a list of LinkedIn profiles into verified work emails and direct dials. "
    "Up to 25,000 rows per run, in Google Sheets, n8n or the API. Built for recruiting, "
    "sales and RevOps teams."
)

# --- workflow blocks (homepage) -----------------------------------------

WORKFLOWS = """%(start)s
<style>
  .lf-wf { background: #f8fafc; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;
    padding: 3rem 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .lf-wf .lf-wf-in { max-width: 1080px; margin: 0 auto; padding: 0 1.5rem; }
  .lf-wf h2 { font-size: 1.6rem; font-weight: 800; color: #0f172a; margin: 0 0 0.5rem;
    letter-spacing: -0.02em; }
  .lf-wf .lf-wf-sub { color: #475569; margin: 0 0 2rem; font-size: 1rem; max-width: 62ch; }
  .lf-wf-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 1rem; }
  .lf-wf-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1.3rem 1.4rem; }
  .lf-wf-card h3 { font-size: 1.02rem; font-weight: 700; color: #0f172a; margin: 0 0 0.55rem;
    line-height: 1.35; }
  .lf-wf-card p { color: #475569; font-size: 0.9375rem; line-height: 1.6; margin: 0 0 0.85rem; }
  .lf-wf-card a { color: #2563eb; font-weight: 600; font-size: 0.9375rem; text-decoration: none; }
  .lf-wf-card a:hover { text-decoration: underline; }
  .lf-wf-card code { background: #eef2f7; padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.9em; }
</style>
<section class="lf-wf">
  <div class="lf-wf-in">
    <h2>Where is your list coming from?</h2>
    <p class="lf-wf-sub">Four shapes of the same job. Start at whichever one describes your week.</p>
    <div class="lf-wf-grid">

      <div class="lf-wf-card">
        <h3>A Sales Navigator export with no contact details?</h3>
        <p>Enrich the whole export in one run. Your original columns stay intact and verified
           work emails and direct dials are added alongside them &mdash; up to 25,000 rows.</p>
        <a href="https://linkfinderai.com/enrich-sales-navigator-export">Enrich a Sales Navigator export &rarr;</a>
      </div>

      <div class="lf-wf-card">
        <h3>A CRM full of LinkedIn URLs you cannot action?</h3>
        <p>Fill the gaps in place. HubSpot sync writes back without creating duplicates, and
           every enriched row returns the person's current employer &mdash; so the same run
           tells you who has changed job.</p>
        <a href="https://linkfinderai.com/enrich-crm-contact-list">Enrich a CRM contact list &rarr;</a>
      </div>

      <div class="lf-wf-card">
        <h3>Sourcing in a spreadsheet?</h3>
        <p><code>=LINKFINDER()</code> runs in the cell. No export, no re-upload, and no leaving
           the sheet you have already built your pipeline around.</p>
        <a href="https://linkfinderai.com/linkedIn-enrichment-google-sheets">Enrich inside Google Sheets &rarr;</a>
      </div>

      <div class="lf-wf-card">
        <h3>Building this into a workflow?</h3>
        <p>An n8n node, an MCP server and a REST API with a published OpenAPI spec. No runtime
           dependencies, and credits accounted for in the response headers.</p>
        <a href="https://linkfinderai.com/api-documentation">Read the API documentation &rarr;</a>
      </div>

    </div>
  </div>
</section>
%(end)s"""

# --- proof band (audience pages) ----------------------------------------

PROOF_BAND = """%(start)s
<style>
  .lf-proof { border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc;
    padding: 1.4rem 1.5rem; margin: 2rem auto; max-width: 720px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .lf-proof-nums { display: flex; flex-wrap: wrap; gap: 1.75rem; margin-bottom: 1.15rem; }
  .lf-proof-nums div { min-width: 110px; }
  .lf-proof-nums b { display: block; font-size: 1.4rem; font-weight: 800; color: #0f172a;
    letter-spacing: -0.02em; line-height: 1.15; }
  .lf-proof-nums span { font-size: 0.8125rem; color: #64748b; }
  .lf-proof h3 { font-size: 0.72rem; letter-spacing: 0.09em; text-transform: uppercase;
    color: #64748b; font-weight: 600; margin: 0 0 0.7rem; }
  .lf-proof ol { margin: 0; padding-left: 1.15rem; }
  .lf-proof li { font-size: 0.9375rem; color: #334155; line-height: 1.6; margin-bottom: 0.3rem; }
  .lf-proof li:last-child { margin-bottom: 0; }
</style>
<section class="lf-proof">
  <div class="lf-proof-nums">
    <div><b>95,000+</b><span>enrichments run</span></div>
    <div><b>7,500</b><span>users</span></div>
    <div><b>25,000</b><span>rows per run</span></div>
  </div>
  <h3>From signing up to your first export</h3>
  <ol>
    <li><strong>Minute 0&ndash;2.</strong> Sign up. No card.</li>
    <li><strong>Minute 2&ndash;5.</strong> Install the Google Sheets add-on, or copy your API key.</li>
    <li><strong>Minute 5&ndash;8.</strong> Paste ten LinkedIn URLs, or drop in your CSV.</li>
    <li><strong>Minute 8.</strong> Export verified emails and direct dials.</li>
  </ol>
</section>
%(end)s"""


def strip_block(html, start, end):
    return re.sub(re.escape(start) + r".*?" + re.escape(end) + r"\n?", "", html, flags=re.S)


def set_meta(html, title, desc):
    html = re.sub(r"(<title>)(.*?)(</title>)", lambda m: m.group(1) + title + m.group(3),
                  html, count=1, flags=re.S | re.I)
    return re.sub(r'(<meta[^>]+name=["\']description["\'][^>]*content=["\'])(.*?)(["\'])',
                  lambda m: m.group(1) + desc + m.group(3), html, count=1, flags=re.S | re.I)


def do_homepage():
    path = os.path.join(OUT, "index.html")
    html = io.open(path, encoding="utf-8").read()
    swapped = 0
    for old, new in HERO_SWAPS:
        if old in html:
            html = html.replace(old, new, 1)
            swapped += 1
    html = set_meta(html, HOME_TITLE, HOME_DESC)

    html = strip_block(html, WF_START, WF_END)
    block = WORKFLOWS % {"start": WF_START, "end": WF_END}
    # After the demo section, where someone has just seen the single-lookup tool.
    m = re.search(r"</section>", html[html.find('class="demo-section"'):] or "")
    anchor = -1
    ds = html.find('class="demo-section"')
    if ds != -1:
        m = re.search(r"</section>", html[ds:])
        if m:
            anchor = ds + m.end()
    if anchor == -1:
        anchor = html.find("<footer")
    if anchor == -1:
        return "no anchor"
    html = html[:anchor] + "\n" + block + "\n" + html[anchor:]

    io.open(path, "w", encoding="utf-8").write(html)
    return "hero swaps %d/%d, meta set, workflow blocks inserted" % (swapped, len(HERO_SWAPS) - 1)


def do_audience(fname):
    path = os.path.join(OUT, fname)
    if not os.path.exists(path):
        return "missing"
    html = io.open(path, encoding="utf-8").read()
    html = strip_block(html, PB_START, PB_END)
    block = PROOF_BAND % {"start": PB_START, "end": PB_END}
    m = re.search(r"</h1>", html, re.I)
    if not m:
        return "no h1"
    # After the opening section that contains the h1, so the band sits under the intro.
    nxt = html.find("<h2", m.end())
    anchor = nxt if nxt != -1 else m.end()
    html = html[:anchor] + block + "\n" + html[anchor:]
    io.open(path, "w", encoding="utf-8").write(html)
    return "proof band + setup ladder"


def main():
    print("%-32s %s" % ("index.html", do_homepage()))
    for f in AUDIENCE_PAGES:
        print("%-32s %s" % (f, do_audience(f)))


if __name__ == "__main__":
    main()
