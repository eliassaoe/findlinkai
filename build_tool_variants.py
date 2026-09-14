#!/usr/bin/env python3
"""
LinkFinder AI - one API page, one bulk page and one Google Sheets page for
every free tool that has a real API operation behind it, and a visible
"Also available as" strip on the parent so the three pages get clicked.

Why
---
Over the last 120 days, 1% of all signups paid. Signups who uploaded a CSV
paid at 4.4% and signups who copied an API key paid at 4.1%, and those two
groups were half of all payers. The tool pages recruit the other 99% from
Google. The single biggest lever is therefore getting the builder minority
who lands on a tool page to see, above the fold, that the same lookup runs
in bulk, from code, and from a spreadsheet.

Before this script: 28 free-tool pages, 10 with an API sibling, 2 with a
bulk sibling, 0 with a Sheets sibling. Four of the ten API siblings were not
linked from their own parent at all (email finder, URL finder, search by
email, company URL finder - the four richest bulk-intent pools on the site).
The rest were linked only from a banner below the results.

What it does
------------
For each tool in CATALOG (only tools whose lookup exists as an API `type` in
integrations/catalog/operations.json - no page is written for a tool the API
cannot run):

  <slug>-api.html            one endpoint, real request shape, real credits
  bulk-<slug>.html           what the CSV needs, what comes back, upload CTA
  <slug>-google-sheets.html  add-on steps and the =LINKFINDER() formula

Existing API and bulk pages are kept as they are; only the missing ones are
written. Every generated page links its parent and its two siblings.

Then, on every parent (and every existing sibling that has a hero), a strip
between the hero and the tool card:

  Also available as:  [Bulk CSV]  [API]  [Google Sheets]

wrapped in LF-VARIANTS:START/END markers, so re-running replaces it in place.

Operation facts (credits, input label, example, output columns) are read from
integrations/google-sheets-addon/Operations.gs, the generated copy of the one
catalog, so a price or field never has to be typed here.

Usage: python3 build_tool_variants.py            (writes files, prints a report)
       python3 build_tool_variants.py --check    (report only, no writes)
"""

import html
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = "https://linkfinderai.com"
ADDON_URL = "https://workspace.google.com/marketplace/app/linkfinder_ai/1096371450007"
SHEETS_SCRIPT_PAGE = SITE + "/linkedIn-enrichment-google-sheets"
CHECK = "--check" in sys.argv

# ---------------------------------------------------------------------------
# Catalog: parent tool page -> operation. api/bulk name an existing page when
# one already exists under a different slug; otherwise the default slug is used.
# ---------------------------------------------------------------------------
CATALOG = {
    "linkedin-email-finder": dict(
        name="LinkedIn Email Finder", op="linkedin_profile_to_email",
        returns="verified work emails", returns_one="a verified work email",
        inputs="LinkedIn profile URLs", input_one="a LinkedIn profile URL",
        csv="linkedin_url",
        why="A profile URL identifies exactly one person, which is why it is the input with the best match rate. A name and a company is ambiguous; a profile URL is not.",
        sources="person",
    ),
    "linkedin-phone-number-finder": dict(
        name="LinkedIn Phone Number Finder", op="linkedin_profile_to_phone",
        returns="direct dial phone numbers", returns_one="a direct dial phone number",
        inputs="LinkedIn profile URLs", input_one="a LinkedIn profile URL",
        csv="linkedin_url",
        why="Direct dials are the most expensive lookup on the platform because a mobile number is the hardest field to source and verify. Run it on a shortlist you have already qualified, not on a raw export.",
        sources="person",
    ),
    "linkedin-search-by-email": dict(
        name="Email to LinkedIn Finder", op="email_to_linkedin_url",
        returns="LinkedIn profile URLs", returns_one="a LinkedIn profile URL",
        inputs="email addresses", input_one="an email address",
        csv="email",
        why="Work addresses match far better than personal ones: the domain names the employer, and the employer plus the local part narrows to one person. Gmail and Outlook addresses still resolve, but expect more blanks.",
        sources="person",
    ),
    "linkedin-url-finder": dict(
        name="LinkedIn URL Finder", op="lead_full_name_to_linkedin_url",
        returns="LinkedIn profile URLs", returns_one="a LinkedIn profile URL",
        inputs="names and companies", input_one="a full name and company",
        csv="full_name,company",
        why="Send more than the name. Company, location and job title all narrow the match and cost nothing extra. John Smith matches thousands of people; John Smith Acme Berlin VP Sales matches one.",
        sources="person",
    ),
    "company-url-finder": dict(
        name="Company URL Finder", op="company_name_to_website",
        returns="company websites", returns_one="a company website",
        inputs="company names", input_one="a company name",
        csv="company_name",
        why="The legal name and the trading name can point at different domains. Use the name your prospect would use, and keep any suffix that disambiguates it, such as the country for a regional subsidiary.",
        sources="company",
    ),
    "company-phone-finder": dict(
        name="Company Phone Finder", op="company_name_to_phone",
        returns="company switchboard numbers", returns_one="a company phone number",
        inputs="company names", input_one="a company name",
        csv="company_name",
        why="This returns the company's published main line, not a person's mobile. For a direct dial to a specific employee, run their LinkedIn profile through the phone number finder instead.",
        sources="company",
    ),
    "company-employee-finder": dict(
        name="Company Employee Finder", op="company_name_to_employees",
        returns="employee lists with titles, emails and LinkedIn URLs", returns_one="an employee list",
        inputs="company names", input_one="a company name",
        csv="company_name",
        why="Filter by department and seniority, and cap how many employees to return per company. Billing is per employee returned, so the cap is also the budget.",
        sources="company",
    ),
    "linkedin-company-employees-finder": dict(
        name="LinkedIn Company Employees Finder", op="linkedin_company_to_employees",
        returns="employee lists with titles, emails and LinkedIn URLs", returns_one="an employee list",
        inputs="LinkedIn company page URLs", input_one="a LinkedIn company page URL",
        csv="company_linkedin_url", api="linkedin-company-employees-api",
        why="A company page URL removes the name ambiguity that company names carry, so this is the input to prefer when your list came from Sales Navigator or a LinkedIn export.",
        sources="company",
    ),
    "find-company-employee-count": dict(
        name="Company Employee Count Finder", op="company_name_to_employee_count",
        returns="employee counts", returns_one="an employee count",
        inputs="company names", input_one="a company name",
        csv="company_name", api="company-employee-count-api",
        why="Headcount is the cheapest segmentation field there is: one credit per company, and it is enough to route an account list into the right tier before you spend anything on contacts.",
        sources="company",
    ),
    "linkedin-company-scraper": dict(
        name="Company Profile Lookup", op="linkedin_company_to_linkedin_info",
        returns="company profiles with website, industry, headcount, location, email and phone", returns_one="a full company profile",
        inputs="LinkedIn company page URLs", input_one="a LinkedIn company page URL",
        csv="company_linkedin_url", api="linkedin-company-scraper-api",
        why="One call returns the whole company record. If you only need one field, the dedicated lookups for website, phone or headcount cost one credit each instead of six.",
        sources="company",
    ),
    "linkedin-profile-scraper": dict(
        name="LinkedIn Profile Extractor", op="linkedin_profile_to_linkedin_info",
        returns="structured profile records with name, title, company, location, email and phone", returns_one="a structured profile record",
        inputs="LinkedIn profile URLs", input_one="a LinkedIn profile URL",
        csv="linkedin_url",
        why="This is the lookup to use when you need several fields from the same profile. It runs asynchronously: the API answers with a job id and you poll for the result.",
        sources="person",
    ),
    "linkedin-post-likers-export": dict(
        name="LinkedIn Post Likers Export", op="linkedin_post_to_reactions",
        returns="lists of everyone who reacted, with headline and profile URL", returns_one="a list of reactions",
        inputs="LinkedIn post URLs", input_one="a LinkedIn post URL",
        csv="post_url",
        why="People who react to a competitor's post, or to a post about your category, are a warm list that no database sells. Export them, then run the profile URLs through the email finder.",
        sources="person",
    ),
    "instagram-profile-url-finder": dict(
        name="Instagram Profile Finder", op="instagram_lookup",
        returns="Instagram profile records with username, followers, bio and website", returns_one="an Instagram profile record",
        inputs="Instagram handles or URLs", input_one="an Instagram handle or URL",
        csv="instagram_handle",
        why="Handles are unambiguous, so a column of @handles enriches cleanly. If you only have names, resolve them to handles first; a name lookup on Instagram is a guess.",
        sources="creator",
    ),
}

# Parents that share an operation with a catalog tool: they get the strip,
# pointing at their own API page and the sibling's bulk and Sheets pages,
# rather than a near-duplicate page set of their own.
SHARED = {
    "company-details-finder": dict(api="company-details-finder-api", like="linkedin-company-scraper"),
    "linkedIn-post-scraper": dict(api="linkedin-post-scraper-api", like="linkedin-post-likers-export"),
}

# ---------------------------------------------------------------------------
# Operation facts, from the generated add-on catalog
# ---------------------------------------------------------------------------
def load_ops():
    src = io.open(os.path.join(ROOT, "integrations/google-sheets-addon/Operations.gs"), encoding="utf-8").read()
    m = re.search(r"var LINKFINDER_OPERATIONS = (\[.*?\n\]);", src, re.S)
    return {o["type"]: o for o in json.loads(m.group(1))}

OPS = load_ops()

def exists(slug):
    return os.path.exists(os.path.join(ROOT, slug + ".html"))

def read(slug):
    return io.open(os.path.join(ROOT, slug + ".html"), encoding="utf-8").read()

def write(slug, content):
    if CHECK:
        return
    io.open(os.path.join(ROOT, slug + ".html"), "w", encoding="utf-8").write(content)

def esc(s):
    return html.escape(s, quote=True)

def credits_line(op):
    c = op["credits"]
    if op["perEmployeeBilling"]:
        return "0.5 credits per employee returned"
    return "%d credit%s per lookup" % (c, "" if c == 1 else "s")

def output_columns(op):
    if op["outputKind"] == "scalar":
        return [op["outputField"]]
    cols = (op.get("columns") or {}).get("default") or []
    return cols

def output_labels(op):
    labels = op.get("labels") or {}
    return [labels.get(c, c) for c in output_columns(op)]

def response_example(op, tool):
    if op["outputKind"] == "scalar":
        sample = {
            "email": "j.doe@company.com", "phone": "+1 415 555 0100",
            "linkedin_url": "https://www.linkedin.com/in/j-doe", "website": "https://company.com",
            "employee_count": 1250,
        }.get(op["outputField"], "...")
        return json.dumps({"status": "success", "result": {op["outputField"]: sample}}, indent=2)
    cols = output_columns(op)
    row = {c: "..." for c in cols}
    if op["outputKind"] == "list":
        return json.dumps({"status": "success", "result": [row, {"...": "..."}]}, indent=2)
    return json.dumps({"status": "success", "result": row}, indent=2)

# ---------------------------------------------------------------------------
# Page chrome, taken from the newest hand-built page so the design matches
# ---------------------------------------------------------------------------
TEMPLATE = read("bulk-linkedin-email-finder")
CSS = re.search(r"<style>.*?</style>", TEMPLATE, re.S).group(0)
FOOTER = re.search(r"<footer class=\"footer\">.*?</footer>", TEMPLATE, re.S).group(0)
HEADER = re.search(r"<header class=\"header\">.*?</header>", TEMPLATE, re.S).group(0)

EXTRA_CSS = """<style>
    .steps { list-style: none; counter-reset: s; display: flex; flex-direction: column; gap: 0.9rem; }
    .steps li { counter-increment: s; display: grid; grid-template-columns: 30px 1fr; gap: 0.8rem; align-items: start; }
    .steps li::before { content: counter(s); width: 26px; height: 26px; border-radius: 50%; background: var(--primary); color: #fff;
      font-weight: 700; font-size: 0.8125rem; display: flex; align-items: center; justify-content: center; }
    .steps strong { color: var(--gray-900); }
    .code { background: var(--gray-900); color: #e5e7eb; border-radius: 0.5rem; padding: 1rem 1.1rem; font-family: var(--mono);
      font-size: 0.8125rem; line-height: 1.6; overflow-x: auto; white-space: pre; margin: 0.75rem 0 1rem; }
    .code .k { color: #93c5fd; } .code .s { color: #86efac; }
    .tabs { display: flex; gap: 0.35rem; margin-top: 1rem; flex-wrap: wrap; }
    .tab { background: var(--gray-100); border: 1px solid var(--gray-200); color: var(--gray-700); padding: 0.35rem 0.8rem;
      border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 600; cursor: pointer; font-family: inherit; }
    .tab.active { background: var(--gray-900); color: #fff; border-color: var(--gray-900); }
    .pane { display: none; } .pane.active { display: block; }
    .btn-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; }
    .cred { display: inline-block; background: #eff6ff; color: var(--primary-dark); font-weight: 600; font-size: 0.8125rem;
      padding: 0.25rem 0.6rem; border-radius: 999px; }
</style>"""

STRIP_START, STRIP_END = "<!-- LF-VARIANTS:START -->", "<!-- LF-VARIANTS:END -->"

def strip_html(page_slug, current, links):
    """links: list of (key, label, href). `current` is the key of this page."""
    chips = []
    for key, label, href in links:
        if key == current:
            chips.append('<span class="lf-var lf-var--here" aria-current="page">%s</span>' % esc(label))
        else:
            chips.append('<a class="lf-var" href="%s" onclick="try{posthog.capture(\'variant_link_clicked\',{page:\'%s\',variant:\'%s\'})}catch(e){}">%s</a>'
                         % (esc(href), esc(page_slug), esc(key), esc(label)))
    return """%s
<style>
  .lf-variants { max-width: 760px; margin: 0 auto 1.25rem; display: flex; align-items: center; justify-content: center;
    gap: 0.5rem; flex-wrap: wrap; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 0.875rem; color: #4b5563; }
  .lf-variants .lf-var { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.85rem; border-radius: 999px;
    border: 1px solid #d1d5db; background: #fff; color: #111827; font-weight: 600; text-decoration: none; transition: all .15s; }
  .lf-variants a.lf-var:hover { border-color: #2563eb; color: #2563eb; box-shadow: 0 2px 8px rgba(37,99,235,.12); }
  .lf-variants .lf-var--here { background: #111827; color: #fff; border-color: #111827; }
  @media (max-width: 560px) { .lf-variants { font-size: 0.8125rem; } .lf-variants .lf-var { padding: 0.35rem 0.7rem; } }
</style>
<nav class="lf-variants" aria-label="Other ways to run this lookup">
  <span>Also available as:</span>
  %s
</nav>
%s""" % (STRIP_START, "\n  ".join(chips), STRIP_END)

def head(title, description, slug, extra_css=""):
    url = SITE + "/" + slug
    ld = json.dumps({"@context": "https://schema.org", "@type": "WebPage", "name": title.split(" | ")[0].split(" - ")[0],
                     "url": url, "description": description})
    return """<!DOCTYPE html>
<html lang="en">
<head>
<script src="/js/lf-attribution.js"></script>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>%s</title>
  <meta name="description" content="%s"/>
  <link rel="canonical" href="%s"/>
  <meta property="og:title" content="%s"/>
  <meta property="og:description" content="%s"/>
  <meta property="og:url" content="%s"/>
  <meta property="og:type" content="website"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  %s
  %s
  <script type="application/ld+json">%s</script>
</head>
<body>
  %s
""" % (esc(title), esc(description), url, esc(title), esc(description), url, CSS, extra_css, ld, HEADER)

def tail(scripts=""):
    return """  </main>
  %s
%s
</body>
</html>
""" % (FOOTER, scripts)

def source_links(kind):
    if kind == "person":
        return ('There is a page for each list source, and each keeps your original columns: '
                '<a href="%s/enrich-sales-navigator-export">Sales Navigator export</a>, '
                '<a href="%s/enrich-apollo-export">Apollo export</a>, '
                '<a href="%s/enrich-ats-candidate-export">ATS candidate export</a>, '
                '<a href="%s/enrich-crm-contact-list">CRM contact list</a>.' % (SITE, SITE, SITE, SITE))
    if kind == "company":
        return ('Account lists usually come out of a CRM or a data tool: see '
                '<a href="%s/enrich-crm-contact-list">enrich a CRM contact list</a> and '
                '<a href="%s/enrich-apollo-export">enrich an Apollo export</a>. '
                'Both keep every column you uploaded.' % (SITE, SITE))
    return ('If your list is a CSV from any tool, upload it as is. Every original column is kept and the new fields are appended on the right.')

# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------
def variants_for(parent, t):
    api = t.get("api", parent + "-api")
    bulk = t.get("bulk", "bulk-" + parent)
    sheets = t.get("sheets", parent + "-google-sheets")
    return api, bulk, sheets

def links_for(parent, t):
    api, bulk, sheets = variants_for(parent, t)
    return [
        ("single", "Single lookup", "%s/%s" % (SITE, parent)),
        ("bulk", "Bulk CSV", "%s/%s" % (SITE, bulk)),
        ("api", "API", "%s/%s" % (SITE, api)),
        ("sheets", "Google Sheets", "%s/%s" % (SITE, sheets)),
    ]

def build_bulk(parent, t, op, slug):
    api, _, sheets = variants_for(parent, t)
    cols = output_labels(op)
    title = "Bulk %s - Upload a CSV of %s | LinkFinder AI" % (t["name"], t["inputs"].title())
    desc = "Upload a CSV of %s and get %s back for the whole list in one run. %s. Keeps every column you uploaded." % (
        t["inputs"], t["returns"], credits_line(op).capitalize())
    csv_cols = t["csv"].split(",")
    example = op["example"]
    if len(csv_cols) == 2:
        ex_row = "Bill Gates,Microsoft"
    else:
        ex_row = example
    body = head(title, desc, slug, EXTRA_CSS) + """
  <main>
    <div class="container">
      <div class="hero">
        <h1>Bulk %(name)s</h1>
        <p class="subtitle">Upload a CSV of %(inputs)s. Get %(returns)s back for every row, in one run.</p>
      </div>
      %(strip)s
    </div>

  <div class="container">
    <div class="tool-card">
      <ul class="checks">
        <li><i class="fas fa-check"></i> <span>One CSV of %(inputs)s in, one enriched CSV out.</span></li>
        <li><i class="fas fa-check"></i> <span><span class="cred">%(credits)s</span> &mdash; you see the total before the run starts.</span></li>
        <li><i class="fas fa-check"></i> <span>Every column you uploaded is kept; the new fields are appended.</span></li>
        <li><i class="fas fa-check"></i> <span>Download as CSV, or push the enriched rows into HubSpot.</span></li>
      </ul>
      <h3 style="font-size:0.9375rem;font-weight:600;color:var(--gray-700);margin:1rem 0 0.4rem;">What the file needs</h3>
      <div class="code">%(csv_header)s
%(csv_row)s</div>
      <p style="font-size:0.9rem;color:var(--gray-600);">One row per lookup. Extra columns are fine and come back untouched.</p>
      <div class="btn-row">
        <a class="btn" href="%(site)s/sign-up?intent=bulk" onclick="try{posthog.capture('bulk_page_upload_cta_clicked',{page:'%(slug)s'})}catch(e){}">Upload your CSV</a>
        <a class="btn btn-outline" href="%(site)s/%(parent)s">Try one lookup first</a>
      </div>
      <div class="next-step">
        <p style="margin:0;">Prefer a formula? Run it <a href="%(site)s/%(sheets)s">inside Google Sheets</a>. Writing code? Use the <a href="%(site)s/%(api)s">%(name)s API</a>.</p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>What the file needs</h2>
      <p>%(why)s</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>What comes back</h2>
      <p>Each row gains %(cols_sentence)s. Rows where nothing was found come back with the new field empty rather than with a guess, so you can filter them out or re-run them with a better input.</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>Where your list came from</h2>
      <p class="inline-links">%(sources)s</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Three ways to run the same lookup</h2>
      <p class="inline-links">Looking up one at a time? Use the <a href="%(site)s/%(parent)s">single %(name_lower)s</a>. Have the list in a spreadsheet? The <a href="%(site)s/%(sheets)s">Google Sheets add-on</a> enriches a column in place. Building a pipeline? The <a href="%(site)s/%(api)s">API</a> is one POST per lookup, or point <a href="%(site)s/n8n-linkedin-automation">n8n</a>, Make or Zapier at it.</p>
    </div>
  </section>

  <section class="cta-band">
    <div class="container">
      <h2>One upload instead of a week of tabs</h2>
      <p>Free credits on signup, no card. Enough to run a real sample of your own list and judge the match rate yourself.</p>
      <a href="%(site)s/sign-up?intent=bulk" class="btn">Start free &mdash; no card required</a>
    </div>
  </section>
""" % dict(
        name=esc(t["name"]), name_lower=esc(t["name"].lower()), inputs=esc(t["inputs"]), returns=esc(t["returns"]),
        credits=esc(credits_line(op)), csv_header=esc(t["csv"]), csv_row=esc(ex_row), site=SITE, slug=slug,
        parent=parent, sheets=sheets, api=api, why=esc(t["why"]),
        cols_sentence=esc(", ".join(cols[:-1]) + " and " + cols[-1] if len(cols) > 1 else "a " + cols[0].replace("_", " ") + " column"),
        sources=source_links(t["sources"]),
        strip=strip_html(slug, "bulk", links_for(parent, t)),
    )
    return body + tail('<script src="/js/lf-highticket-cta.js"></script>')

def build_api(parent, t, op, slug):
    _, bulk, sheets = variants_for(parent, t)
    title = "%s API - %s from %s | LinkFinder AI" % (t["name"], t["returns_one"].split(" ", 1)[1].capitalize(), t["input_one"].split(" ", 1)[1])
    if len(title) > 70:
        title = "%s API | LinkFinder AI" % t["name"]
    desc = "REST API: POST %s, get %s back as JSON. %s. Bearer auth, one endpoint, OpenAPI spec included." % (
        t["input_one"], t["returns_one"], credits_line(op).capitalize())
    ex = op["example"]
    resp = response_example(op, t)
    async_note = ("This lookup always runs asynchronously. The first response is <code>202</code> with a <code>job_id</code> and a <code>poll_url</code>; "
                  "poll <code>GET /status/{job_id}</code> until <code>status</code> is <code>done</code>."
                  if op["alwaysAsync"] else
                  "Most calls return the result inline with <code>200</code>. When a lookup takes longer, you get <code>202</code> with a "
                  "<code>job_id</code> and a <code>poll_url</code> instead; poll <code>GET /status/{job_id}</code> until <code>status</code> is <code>done</code>.")
    params_rows = ""
    if op["perEmployeeBilling"]:
        params_rows = """
          <tr><td><code>department</code></td><td>optional</td><td>Only employees in this department.</td></tr>
          <tr><td><code>seniority</code></td><td>optional</td><td>Only employees at this seniority.</td></tr>
          <tr><td><code>employee_count</code></td><td>optional</td><td>Cap on how many employees to return. Billed 0.5 credits each.</td></tr>"""
    curl = """curl -X POST https://api.linkfinderai.com \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"type": "%s", "input_data": "%s"}'""" % (op["type"], ex)
    python = """import requests

r = requests.post(
    "https://api.linkfinderai.com",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={"type": "%s", "input_data": "%s"},
)
print(r.json())""" % (op["type"], ex)
    node = """const r = await fetch("https://api.linkfinderai.com", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.LINKFINDER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "%s", input_data: "%s" }),
});
console.log(await r.json());""" % (op["type"], ex)
    cols = output_labels(op)
    body = head(title, desc, slug, EXTRA_CSS) + """
  <main>
    <div class="container">
      <div class="hero">
        <h1>%(name)s API</h1>
        <p class="subtitle">One POST with %(input_one)s, %(returns_one)s back as JSON. <span class="cred">%(credits)s</span></p>
      </div>
      %(strip)s
    </div>

  <div class="container">
    <div class="tool-card">
      <div class="tabs" role="tablist">
        <button class="tab active" onclick="lfTab(this,'curl')">cURL</button>
        <button class="tab" onclick="lfTab(this,'python')">Python</button>
        <button class="tab" onclick="lfTab(this,'node')">Node.js</button>
        <button class="tab" onclick="lfTab(this,'resp')">Response</button>
      </div>
      <div id="pane-curl" class="pane active"><div class="code">%(curl)s</div></div>
      <div id="pane-python" class="pane"><div class="code">%(python)s</div></div>
      <div id="pane-node" class="pane"><div class="code">%(node)s</div></div>
      <div id="pane-resp" class="pane"><div class="code">%(resp)s</div></div>
      <div class="btn-row">
        <a class="btn" href="%(site)s/sign-up?intent=api" onclick="try{posthog.capture('api_page_key_cta_clicked',{page:'%(slug)s'})}catch(e){}">Get an API key</a>
        <a class="btn btn-outline" href="%(site)s/api-documentation">Full API documentation</a>
        <a class="btn btn-outline" href="%(site)s/openapi.json">OpenAPI spec</a>
      </div>
      <div class="next-step">
        <p style="margin:0;">Not writing code? Upload a <a href="%(site)s/%(bulk)s">CSV in bulk</a>, run it <a href="%(site)s/%(sheets)s">inside Google Sheets</a>, or <a href="%(site)s/%(parent)s">try one lookup</a> in the browser.</p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Request</h2>
      <p>Every LinkFinder lookup goes to the same endpoint, <code>POST https://api.linkfinderai.com</code>. The <code>type</code> field selects the lookup; <code>input_data</code> carries the input as a plain string.</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Field</th><th></th><th>Value for this lookup</th></tr></thead>
        <tbody>
          <tr><td><code>type</code></td><td>required</td><td><code>%(op)s</code></td></tr>
          <tr><td><code>input_data</code></td><td>required</td><td>%(input_label)s, e.g. <code>%(example)s</code></td></tr>%(params_rows)s
        </tbody>
      </table></div>
      <p style="margin-top:0.9rem;">Authenticate with your API key as a Bearer token. Keep it server-side; never ship it in a browser or a mobile app.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Response</h2>
      <p>A successful call returns <code>{"status": "success", "result": ...}</code>. For this lookup the result carries %(cols_sentence)s. When nothing is found, <code>result</code> is <code>null</code>; the call is still charged, so cache your inputs and do not retry a null.</p>
      <p>%(async_note)s</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>Credits and errors</h2>
      <p>%(credits_cap)s. <code>401</code> means the key is missing or wrong, <code>402</code> means the account is out of credits, <code>422</code> means the type or the input is malformed, and <code>429</code> means you are being rate limited; back off and retry.</p>
      <p>%(why)s</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Use it from an automation tool</h2>
      <p class="inline-links">The same request works from an HTTP node: see <a href="%(site)s/n8n-linkedin-automation">n8n</a>, or the <a href="%(site)s/integrations">integrations</a> page for Make, Zapier, Clay and the MCP server. Bulk without code: <a href="%(site)s/%(bulk)s">upload a CSV</a>.</p>
    </div>
  </section>

  <section class="cta-band">
    <div class="container">
      <h2>First call in under five minutes</h2>
      <p>Free credits on signup, no card. Copy the cURL above, paste your key, and read the JSON.</p>
      <a href="%(site)s/sign-up?intent=api" class="btn">Get an API key</a>
    </div>
  </section>
""" % dict(
        name=esc(t["name"]), input_one=esc(t["input_one"]), returns_one=esc(t["returns_one"]), credits=esc(credits_line(op)),
        credits_cap=esc(credits_line(op).capitalize()), curl=esc(curl), python=esc(python), node=esc(node), resp=esc(resp),
        site=SITE, slug=slug, bulk=bulk, sheets=sheets, parent=parent, op=op["type"], input_label=esc(op["inputLabel"]),
        example=esc(ex), params_rows=params_rows, why=esc(t["why"]), async_note=async_note,
        cols_sentence=esc(", ".join(cols[:-1]) + " and " + cols[-1] if len(cols) > 1 else "the " + cols[0].replace("_", " ")),
        strip=strip_html(slug, "api", links_for(parent, t)),
    )
    scripts = """<script src="/js/lf-highticket-cta.js"></script>
<script>
  function lfTab(btn, key) {
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('pane-' + key).classList.add('active');
  }
</script>"""
    return body + tail(scripts)

def build_sheets(parent, t, op, slug):
    api, bulk, _ = variants_for(parent, t)
    title = "%s for Google Sheets - Add-on and Formula | LinkFinder AI" % t["name"]
    if len(title) > 70:
        title = "%s for Google Sheets | LinkFinder AI" % t["name"]
    desc = "Turn a column of %s into %s inside Google Sheets: install the LinkFinder AI add-on, or use =LINKFINDER(A2, \"%s\"). %s." % (
        t["inputs"], t["returns"], op["type"], credits_line(op).capitalize())
    scalar = op["outputKind"] == "scalar"
    is_list = op["outputKind"] == "list"
    cols = output_labels(op)
    if scalar:
        formula_block = """      <h3 style="font-size:0.9375rem;font-weight:600;color:var(--gray-700);margin:1.25rem 0 0.4rem;">Or as a formula</h3>
      <div class="code">=LINKFINDER(A2, "%s")</div>
      <p style="font-size:0.9rem;color:var(--gray-600);">Drag it down the column. The custom function comes from a short Apps Script you paste once; <a href="%s">the script and setup are here</a>.</p>""" % (op["type"], SHEETS_SCRIPT_PAGE)
    elif is_list:
        formula_block = """      <h3 style="font-size:0.9375rem;font-weight:600;color:var(--gray-700);margin:1.25rem 0 0.4rem;">Why the side panel, not a formula</h3>
      <p style="font-size:0.9rem;color:var(--gray-600);">This lookup returns several rows per input (one per person). A cell formula can only hold one value, so the add-on writes the results as new rows below your sheet instead.</p>"""
    else:
        formula_block = """      <h3 style="font-size:0.9375rem;font-weight:600;color:var(--gray-700);margin:1.25rem 0 0.4rem;">Or as a formula</h3>
      <div class="code">=LINKFINDER(A2, "%s")</div>
      <p style="font-size:0.9rem;color:var(--gray-600);">The formula returns the main field. To get every field as its own column, use the side panel. <a href="%s">Script and setup are here</a>.</p>""" % (op["type"], SHEETS_SCRIPT_PAGE)
    body = head(title, desc, slug, EXTRA_CSS) + """
  <main>
    <div class="container">
      <div class="hero">
        <h1>%(name)s in Google Sheets</h1>
        <p class="subtitle">A column of %(inputs)s in, %(returns)s out, without leaving the spreadsheet. <span class="cred">%(credits)s</span></p>
      </div>
      %(strip)s
    </div>

  <div class="container">
    <div class="tool-card">
      <ol class="steps">
        <li><span><strong>Install the add-on</strong> from the <a href="%(addon)s" target="_blank" rel="noopener" onclick="try{posthog.capture('sheets_addon_clicked',{source:'sheets_tool_page',page:'%(slug)s'})}catch(e){}">Google Workspace Marketplace</a>. It is free; lookups spend LinkFinder credits.</span></li>
        <li><span><strong>Paste your API key</strong> once, from your <a href="%(site)s/sign-up?intent=sheets">LinkFinder account</a>. Free credits on signup, no card.</span></li>
        <li><span><strong>Open the side panel</strong> (Extensions &rarr; LinkFinder AI) and choose <strong>%(label)s</strong>.</span></li>
        <li><span><strong>Point it at the column</strong> of %(inputs)s and run. %(output_note)s</span></li>
      </ol>
%(formula_block)s
      <div class="btn-row">
        <a class="btn" href="%(addon)s" target="_blank" rel="noopener" onclick="try{posthog.capture('sheets_addon_clicked',{source:'sheets_tool_page_cta',page:'%(slug)s'})}catch(e){}">Install the add-on</a>
        <a class="btn btn-outline" href="%(site)s/sign-up?intent=sheets">Get an API key</a>
      </div>
      <div class="next-step">
        <p style="margin:0;">Not in a spreadsheet? <a href="%(site)s/%(bulk)s">Upload a CSV in bulk</a>, call the <a href="%(site)s/%(api)s">API</a>, or <a href="%(site)s/%(parent)s">try one lookup</a> in the browser.</p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Side panel or formula?</h2>
      <p>The side panel processes each row once, skips rows that are already filled, and paces itself against the rate limit. That makes it the right choice for hundreds or thousands of rows.</p>
      <p>A <code>=LINKFINDER()</code> formula is handy for a few rows, but Google Sheets can recalculate custom functions on its own, which re-spends credits and can hit the script time limit on a large sheet. Use it for a sample, then switch to the panel.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>What comes back</h2>
      <p>%(cols_sentence)s. Rows where nothing was found stay empty rather than getting a guess, so a filter on the new column gives you the misses to re-run.</p>
      <p>%(why)s</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>Three ways to run the same lookup</h2>
      <p class="inline-links">The panel and the formula call the same API as the <a href="%(site)s/%(bulk)s">bulk CSV upload</a> and the <a href="%(site)s/%(api)s">%(name)s API</a>, and cost the same credits. Pick whichever is closest to where your list already lives.</p>
    </div>
  </section>

  <section class="cta-band">
    <div class="container">
      <h2>Enrich your first sheet free</h2>
      <p>Install the add-on, paste a key, and run it on ten rows of your own list before deciding anything.</p>
      <a href="%(addon)s" class="btn" target="_blank" rel="noopener">Install the Google Sheets add-on</a>
    </div>
  </section>
""" % dict(
        name=esc(t["name"]), inputs=esc(t["inputs"]), returns=esc(t["returns"]), credits=esc(credits_line(op)),
        addon=ADDON_URL, site=SITE, slug=slug, label=esc(op["label"]), formula_block=formula_block,
        bulk=bulk, api=api, parent=parent, why=esc(t["why"]),
        output_note=esc("The result lands in the next empty column." if scalar else
                        ("Each person becomes a row, with " + ", ".join(cols) + "." if is_list else
                         "Each field becomes its own column: " + ", ".join(cols) + ".")),
        cols_sentence=esc(("A new column with the " + cols[0].replace("_", " ")) if scalar else
                          ("One row per result, with " + ", ".join(cols) if is_list else
                           "One column per field: " + ", ".join(cols))),
        strip=strip_html(slug, "sheets", links_for(parent, t)),
    )
    return body + tail('<script src="/js/lf-highticket-cta.js"></script>')

# ---------------------------------------------------------------------------
# Strip insertion on existing pages
# ---------------------------------------------------------------------------
def remove_strip(page):
    return re.sub(re.escape(STRIP_START) + r".*?" + re.escape(STRIP_END) + r"\n?", "", page, flags=re.S)

def insert_strip(slug, current, links):
    page = remove_strip(read(slug))
    strip = strip_html(slug, current, links)
    anchors = [
        '<div class="main-card">',          # free-tool pages: right above the tool
        '<div class="tool-card">',          # bulk pages: right above the upload card
        '<div class="sticky-cta" id="stickyCta">',  # API pages: right after the hero section
    ]
    for a in anchors:
        i = page.find(a)
        if i != -1:
            page = page[:i] + strip + "\n" + page[i:]
            write(slug, page)
            return a
    # Older API pages: a <section class="hero"> block, or a <div class="hero"> whose
    # CTAs are the last thing worth keeping above the strip.
    i = page.find('<section class="hero">')
    if i != -1:
        j = page.find("</section>", i)
        if j != -1:
            j += len("</section>")
            page = page[:j] + "\n" + strip + page[j:]
            write(slug, page)
            return "after <section class=hero>"
    i = page.find('<div class="hero-ctas">')
    if i != -1:
        page = page[:i] + strip + "\n" + page[i:]
        write(slug, page)
        return "before hero-ctas"
    return None

# ---------------------------------------------------------------------------
def main():
    report = []
    written = set()
    for parent, t in CATALOG.items():
        op = OPS[t["op"]]
        api, bulk, sheets = variants_for(parent, t)
        for kind, slug, builder in (("api", api, build_api), ("bulk", bulk, build_bulk), ("sheets", sheets, build_sheets)):
            if exists(slug):
                report.append((parent, kind, slug, "kept"))
            else:
                write(slug, builder(parent, t, op, slug))
                written.add(slug)
                report.append((parent, kind, slug, "written"))
        links = links_for(parent, t)
        for kind, slug in (("single", parent), ("api", api), ("bulk", bulk), ("sheets", sheets)):
            if not exists(slug) or slug in written:
                continue  # generated pages carry their strip already
            anchor = insert_strip(slug, kind, links)
            report.append((parent, "strip:" + kind, slug, "at %r" % anchor if anchor else "NO ANCHOR"))
    for parent, s in SHARED.items():
        like = CATALOG[s["like"]]
        _, bulk, sheets = variants_for(s["like"], like)
        links = [
            ("single", "Single lookup", "%s/%s" % (SITE, parent)),
            ("bulk", "Bulk CSV", "%s/%s" % (SITE, bulk)),
            ("api", "API", "%s/%s" % (SITE, s["api"])),
            ("sheets", "Google Sheets", "%s/%s" % (SITE, sheets)),
        ]
        anchor = insert_strip(parent, "single", links)
        report.append((parent, "strip:single", parent, "at %r" % anchor if anchor else "NO ANCHOR"))
        if exists(s["api"]):
            anchor = insert_strip(s["api"], "api", links)
            report.append((parent, "strip:api", s["api"], "at %r" % anchor if anchor else "NO ANCHOR"))
    w = sum(1 for r in report if r[3] == "written")
    for r in report:
        print("%-36s %-13s %-46s %s" % r)
    print("\n%d pages written, %d strips placed%s" % (w, sum(1 for r in report if r[1].startswith("strip")), " (check mode, nothing saved)" if CHECK else ""))

if __name__ == "__main__":
    main()
