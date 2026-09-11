#!/usr/bin/env python3
"""
LinkFinder AI - ICP page generator.

Builds the "compact keyword" pages: short, purchase-intent landing pages and
free client-side tools aimed at recruiting and sales teams, rather than the
long developer guides the site already has.

Two page shapes:
  * tool    - a working tool that runs entirely in the browser (no API cost),
              used as a free magnet for an audience that is 100% ICP.
  * landing - a short purchase-intent page whose job is to get a list uploaded.

Usage:
    python3 generate_icp_pages.py
"""

import os
import re

SITE = "https://linkfinderai.com"
OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- shared chrome

STYLE = """
    :root {
      --primary: #2563eb;
      --primary-dark: #1e40af;
      --success: #10b981;
      --gray-900: #111827;
      --gray-800: #1f2937;
      --gray-700: #374151;
      --gray-600: #4b5563;
      --gray-500: #6b7280;
      --gray-300: #d1d5db;
      --gray-200: #e5e7eb;
      --gray-100: #f3f4f6;
      --gray-50: #f9fafb;
      --mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.65; color: var(--gray-800); background: #fff;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
    .narrow { max-width: 720px; margin: 0 auto; }

    .header { background: #fff; border-bottom: 1px solid var(--gray-200); position: sticky; top: 0; z-index: 1000; }
    .header-content { max-width: 1100px; margin: 0 auto; padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .logo { font-size: 1.25rem; font-weight: 800; color: var(--primary); text-decoration: none; display: flex; align-items: center; gap: 0.5rem; }
    .btn { padding: 0.625rem 1.25rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; font-size: 0.9375rem;
           display: inline-block; border: none; cursor: pointer; background: var(--primary); color: #fff; transition: background .15s; font-family: inherit; }
    .btn:hover { background: var(--primary-dark); }
    .btn-outline { background: transparent; color: var(--primary); border: 2px solid var(--primary); }
    .btn-outline:hover { background: var(--gray-50); }
    .btn-full { width: 100%; text-align: center; }
    .btn:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
      outline: 2px solid var(--primary); outline-offset: 2px;
    }

    .hero { padding: 3.5rem 0 2rem; text-align: center; }
    .hero h1 { font-size: clamp(1.85rem, 4.5vw, 2.6rem); font-weight: 800; color: var(--gray-900); line-height: 1.18; letter-spacing: -0.02em; text-wrap: balance; }
    .hero .subtitle { font-size: 1.075rem; color: var(--gray-600); margin-top: 0.85rem; max-width: 62ch; margin-left: auto; margin-right: auto; }

    .tool-card { background: #fff; border: 1px solid var(--gray-200); border-radius: 14px; padding: 1.75rem;
                 box-shadow: 0 4px 20px rgba(0,0,0,.06); margin: 0 auto 2.5rem; max-width: 720px; }
    .field { margin-bottom: 1rem; }
    .field label { display: block; font-weight: 600; font-size: 0.875rem; color: var(--gray-700); margin-bottom: 0.375rem; }
    .field .hint { font-weight: 400; color: var(--gray-500); }
    .field input, .field textarea, .field select {
      width: 100%; padding: 0.7rem 0.85rem; border: 1px solid var(--gray-300); border-radius: 0.5rem;
      font-size: 0.9375rem; font-family: inherit; color: var(--gray-900); background: #fff;
    }
    .field textarea { min-height: 86px; resize: vertical; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    @media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } }

    .output { margin-top: 1.25rem; }
    .output-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
    .output-head h3 { font-size: 0.9375rem; font-weight: 600; color: var(--gray-700); }
    .copy-btn { background: var(--gray-100); color: var(--gray-700); border: 1px solid var(--gray-200);
                padding: 0.35rem 0.75rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 600; cursor: pointer; font-family: inherit; }
    .copy-btn:hover { background: var(--gray-200); }
    .result-box { background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 0.5rem;
                  padding: 0.9rem 1rem; font-family: var(--mono); font-size: 0.8125rem; color: var(--gray-800);
                  white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow-y: auto; }
    .result-box:empty { display: none; }

    .next-step { margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid var(--gray-200); }
    .next-step p { font-size: 0.9375rem; color: var(--gray-600); margin-bottom: 0.75rem; }

    section.block { padding: 2.25rem 0; }
    section.block.alt { background: var(--gray-50); border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200); }
    section.block h2 { font-size: 1.4rem; font-weight: 700; color: var(--gray-900); margin-bottom: 1rem; letter-spacing: -0.01em; text-wrap: balance; }
    section.block p { margin-bottom: 0.9rem; color: var(--gray-700); }
    section.block p:last-child { margin-bottom: 0; }

    .checks { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1rem; }
    .checks li { display: grid; grid-template-columns: 20px 1fr; gap: 0.7rem; align-items: baseline; color: var(--gray-700); }
    .checks li i { color: var(--success); font-size: 0.875rem; }

    .tbl-wrap { overflow-x: auto; border: 1px solid var(--gray-200); border-radius: 0.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--gray-200); vertical-align: top; }
    tbody tr:last-child td { border-bottom: 0; }
    th { background: var(--gray-50); font-weight: 600; color: var(--gray-700); font-size: 0.8125rem; }

    .cta-band { background: var(--gray-900); color: #fff; padding: 2.5rem 0; text-align: center; }
    .cta-band h2 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.6rem; color: #fff; text-wrap: balance; }
    .cta-band p { color: var(--gray-300); margin-bottom: 1.4rem; max-width: 56ch; margin-left: auto; margin-right: auto; }
    .cta-band .btn { background: #fff; color: var(--gray-900); }
    .cta-band .btn:hover { background: var(--gray-100); }

    .footer { background: var(--gray-900); color: var(--gray-300); padding: 2.5rem 0 1.5rem; font-size: 0.875rem; }
    .footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.75rem; margin-bottom: 1.75rem; }
    .footer-heading { color: #fff; font-size: 0.9375rem; font-weight: 600; margin-bottom: 0.75rem; }
    .footer-links { list-style: none; display: flex; flex-direction: column; gap: 0.45rem; }
    .footer a { color: var(--gray-300); text-decoration: none; }
    .footer a:hover { color: #fff; text-decoration: underline; }
    .footer-logo { font-weight: 800; color: #fff; font-size: 1.05rem; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; }
    .footer-bottom { border-top: 1px solid var(--gray-800); padding-top: 1.25rem; }
    .footer-bottom p { margin-bottom: 0.5rem; }
    .legal { font-size: 0.75rem; color: var(--gray-500); line-height: 1.5; }

    .inline-links { font-size: 0.95rem; }
    .inline-links a { color: var(--primary); }

    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
"""

HEADER = """  <header class="header">
    <div class="header-content">
      <a href="{site}/" class="logo"><i class="fas fa-search"></i> Linkfinder AI</a>
      <div>
        <a href="{site}/pricing" class="btn btn-outline">Pricing</a>
        <a href="{site}/sign-up" class="btn">Try for free</a>
      </div>
    </div>
  </header>
"""

FOOTER = """  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-logo"><i class="fas fa-search"></i> LinkFinder AI</div>
          <p>B2B data enrichment for recruiting and sales teams. Upload a list, get verified emails and direct dials back. GDPR-compliant.</p>
        </div>
        <div>
          <h4 class="footer-heading">For teams</h4>
          <ul class="footer-links">
            <li><a href="{site}/for-recruiting-teams">Recruitment data enrichment</a></li>
            <li><a href="{site}/for-sales-teams">Sales team data enrichment</a></li>
            <li><a href="{site}/enrich-sales-navigator-export">Enrich a Sales Navigator export</a></li>
            <li><a href="{site}/enrich-ats-candidate-export">Enrich an ATS export</a></li>
            <li><a href="{site}/pricing">Pricing</a></li>
          </ul>
        </div>
        <div>
          <h4 class="footer-heading">Free tools</h4>
          <ul class="footer-links">
            <li><a href="{site}/email-permutator">Email permutator</a></li>
            <li><a href="{site}/boolean-search-string-generator">Boolean search string generator</a></li>
            <li><a href="{site}/linkedin-xray-search-generator">LinkedIn X-ray search generator</a></li>
            <li><a href="{site}/linkedin-email-finder">LinkedIn email finder</a></li>
          </ul>
        </div>
        <div>
          <h4 class="footer-heading">Support &amp; legal</h4>
          <ul class="footer-links">
            <li><a href="{site}/api-documentation">API documentation</a></li>
            <li><a href="{site}/about-us">About us</a></li>
            <li><a href="{site}/privacy">Privacy policy</a></li>
            <li><a href="{site}/terms">Terms of service</a></li>
            <li><a href="mailto:support@linkfinderai.com">support@linkfinderai.com</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 LinkFinder AI. All rights reserved.</p>
        <p class="legal">LinkFinder AI is operated by Hamour Eliasse, Entrepreneur Individuel registered in France &middot; SIRET 937 788 172 00016 &middot; 26 rue de la Coop&eacute;ration, 93240 Stains, France &middot; VAT FR02937788172 &middot; Contact: support@linkfinderai.com</p>
      </div>
    </div>
  </footer>
"""

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<script src="/js/lf-attribution.js"></script>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{title}</title>
  <meta name="description" content="{description}"/>
  <link rel="canonical" href="{site}/{slug}"/>
  <meta property="og:title" content="{title}"/>
  <meta property="og:description" content="{description}"/>
  <meta property="og:url" content="{site}/{slug}"/>
  <meta property="og:type" content="website"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <style>{style}</style>
  <script type="application/ld+json">{schema}</script>
</head>
<body>
{header}
  <main>
    <div class="container">
      <div class="hero">
        <h1>{h1}</h1>
        <p class="subtitle">{subtitle}</p>
      </div>
    </div>
{body}
  </main>
{footer}
<script src="/js/lf-highticket-cta.js"></script>
</body>
</html>
"""

CTA_BAND = """  <section class="cta-band">
    <div class="container">
      <h2>{title}</h2>
      <p>{text}</p>
      <a href="{site}/sign-up" class="btn">Start free &mdash; no card required</a>
    </div>
  </section>
"""


def schema_for(cfg):
    """SoftwareApplication for tools, WebPage otherwise. Kept minimal on purpose."""
    if cfg["shape"] == "tool":
        return (
            '{"@context":"https://schema.org","@type":"SoftwareApplication",'
            '"name":"%s","applicationCategory":"BusinessApplication",'
            '"operatingSystem":"Web","url":"%s/%s",'
            '"offers":{"@type":"Offer","price":"0","priceCurrency":"USD"}}'
            % (cfg["h1"], SITE, cfg["slug"])
        )
    return (
        '{"@context":"https://schema.org","@type":"WebPage",'
        '"name":"%s","url":"%s/%s","description":"%s"}'
        % (cfg["h1"], SITE, cfg["slug"], cfg["description"])
    )


def build(cfg):
    # Plain replace, not .format(): page bodies contain inline JavaScript, and
    # its braces would be parsed as format fields.
    body = cfg["body"].replace("{site}", SITE)
    if cfg.get("cta"):
        body += CTA_BAND.format(site=SITE, **cfg["cta"])
    html = PAGE.format(
        title=cfg["title"],
        description=cfg["description"],
        slug=cfg["slug"],
        site=SITE,
        style=STYLE,
        schema=schema_for(cfg),
        header=HEADER.format(site=SITE),
        footer=FOOTER.format(site=SITE),
        h1=cfg["h1"],
        subtitle=cfg["subtitle"],
        body=body,
    )
    path = os.path.join(OUT, cfg["slug"] + ".html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)
    return path


# ------------------------------------------------------------------- the pages

PAGES = []

# ============================================================ FREE TOOL MAGNETS

PAGES.append({
    "slug": "email-permutator",
    "shape": "tool",
    "title": "Email Permutator - Generate Every Likely Work Email | LinkFinder AI",
    "description": "Free email permutator. Enter a name and company domain to generate every likely work email format, then verify which one is live. No signup.",
    "h1": "Email Permutator",
    "subtitle": "Enter a name and a company domain. Get every likely work email format, instantly, in your browser.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <div class="grid2">
        <div class="field">
          <label for="firstName">First name</label>
          <input type="text" id="firstName" placeholder="Sarah" autocomplete="off">
        </div>
        <div class="field">
          <label for="lastName">Last name</label>
          <input type="text" id="lastName" placeholder="Chen" autocomplete="off">
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="middleName">Middle name <span class="hint">optional</span></label>
          <input type="text" id="middleName" placeholder="Lee" autocomplete="off">
        </div>
        <div class="field">
          <label for="domain">Company domain</label>
          <input type="text" id="domain" placeholder="acme.com" autocomplete="off">
        </div>
      </div>
      <button class="btn btn-full" id="genBtn"><i class="fas fa-bolt"></i> Generate permutations</button>

      <div class="output">
        <div class="output-head">
          <h3 id="countLabel"></h3>
          <button class="copy-btn" id="copyBtn" hidden><i class="fas fa-copy"></i> Copy all</button>
        </div>
        <div class="result-box" id="results"></div>
      </div>

      <div class="next-step" id="nextStep" hidden>
        <p><strong>A permutator produces guesses, not verified addresses.</strong> Only one of these is usually live, and sending to the rest costs you deliverability. Upload your list and get back the address that actually exists.</p>
        <a href="{site}/sign-up" class="btn btn-full">Verify these with 10 free credits</a>
      </div>
    </div>
  </div>

  <section class="block">
    <div class="container narrow">
      <h2>Which format is most likely?</h2>
      <p>Across mid-size and large companies, <code>first.last@</code> is the most common pattern. At companies under about fifty people, <code>first@</code> overtakes it. Neither is a safe assumption on its own, which is why the list above is ordered by how often each pattern appears rather than alphabetically.</p>
      <p>The honest limitation of any permutator: it cannot tell you which guess is real. Sending to twenty guesses to find one live address is how sending domains get burned. Verification is a separate step, and it is the step that matters.</p>
      <h2>Doing this for a whole list</h2>
      <p>If you are permuting one address at a time you are doing manual work a machine should do. Upload a CSV of names and company domains to the <a href="{site}/csv-email-finder">CSV email finder</a> and get verified addresses back for the whole file. Recruiters working from a candidate list should start at <a href="{site}/for-recruiting-teams">recruitment data enrichment</a>; sales teams working a prospect list want <a href="{site}/for-sales-teams">sales team data enrichment</a>.</p>
    </div>
  </section>

  <script>
  (function () {
    var $ = function (id) { return document.getElementById(id); };
    function clean(s) {
      return String(s || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[^a-z-]/g, '');
    }
    function cleanDomain(s) {
      return String(s || '').trim().toLowerCase()
        .replace(/^https?:\\/\\//, '').replace(/^www\\./, '')
        .replace(/\\/.*$/, '').replace(/[^a-z0-9.-]/g, '');
    }
    function permutations(f, l, m, d) {
      var fi = f.charAt(0), li = l.charAt(0), mi = m.charAt(0);
      var out = [];
      function add(local) { if (local && out.indexOf(local) === -1) out.push(local); }
      // Ordered by real-world frequency, most common first.
      add(f + '.' + l); add(f + l); add(fi + l); add(f + '_' + l);
      add(f + '-' + l); add(f); add(l); add(f + li); add(fi + '.' + l);
      add(l + '.' + f); add(l + f); add(l + fi); add(l + '.' + fi);
      add(fi + li); add(fi + '.' + li);
      if (m) {
        add(f + '.' + m + '.' + l); add(f + mi + l); add(fi + mi + li);
        add(f + '.' + mi + '.' + l);
      }
      return out.map(function (local) { return local + '@' + d; });
    }
    function run() {
      var f = clean($('firstName').value), l = clean($('lastName').value);
      var m = clean($('middleName').value), d = cleanDomain($('domain').value);
      var box = $('results'), label = $('countLabel'), copy = $('copyBtn'), next = $('nextStep');
      if (!f || !l || !d) {
        box.textContent = 'Enter a first name, last name and company domain.';
        label.textContent = ''; copy.hidden = true; next.hidden = true;
        return;
      }
      var list = permutations(f, l, m, d);
      box.textContent = list.join('\\n');
      label.textContent = list.length + ' possible addresses, most likely first';
      copy.hidden = false; next.hidden = false;
      if (window.posthog) { posthog.capture('free_tool_used', { tool: 'email_permutator', count: list.length }); }
    }
    $('genBtn').addEventListener('click', run);
    ['firstName', 'lastName', 'middleName', 'domain'].forEach(function (id) {
      $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    });
    $('copyBtn').addEventListener('click', function () {
      var t = $('results').textContent;
      navigator.clipboard.writeText(t).then(function () {
        var b = $('copyBtn'); b.innerHTML = '<i class="fas fa-check"></i> Copied';
        setTimeout(function () { b.innerHTML = '<i class="fas fa-copy"></i> Copy all'; }, 1600);
      });
    });
  })();
  </script>
""",
    "cta": {
        "title": "Stop guessing one address at a time",
        "text": "Upload a CSV of names and companies. Get verified emails and direct dials back, ready for your sequencer or your ATS.",
    },
})

PAGES.append({
    "slug": "boolean-search-string-generator",
    "shape": "tool",
    "title": "Boolean Search String Generator for Recruiters - Free | LinkFinder AI",
    "description": "Free Boolean search string generator. Turn job titles, skills and locations into a search string for LinkedIn Recruiter, Google X-ray and CV databases. No signup.",
    "h1": "Boolean Search String Generator",
    "subtitle": "Turn job titles, skills and locations into a working Boolean string for LinkedIn, Google X-ray or your CV database.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <div class="field">
        <label for="titles">Job titles <span class="hint">one per line, or comma separated</span></label>
        <textarea id="titles" placeholder="Backend Engineer&#10;Software Engineer&#10;Platform Engineer"></textarea>
      </div>
      <div class="field">
        <label for="skills">Required skills <span class="hint">all of these must appear</span></label>
        <textarea id="skills" placeholder="Go&#10;Kubernetes"></textarea>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="locations">Locations <span class="hint">optional</span></label>
          <input type="text" id="locations" placeholder="Berlin, Munich">
        </div>
        <div class="field">
          <label for="exclude">Exclude <span class="hint">optional</span></label>
          <input type="text" id="exclude" placeholder="recruiter, intern">
        </div>
      </div>
      <div class="field">
        <label for="target">Where will you paste this?</label>
        <select id="target">
          <option value="plain">LinkedIn Recruiter / CV database</option>
          <option value="xray">Google X-ray of LinkedIn profiles</option>
        </select>
      </div>
      <button class="btn btn-full" id="genBtn"><i class="fas fa-bolt"></i> Build search string</button>

      <div class="output">
        <div class="output-head">
          <h3 id="outLabel"></h3>
          <button class="copy-btn" id="copyBtn" hidden><i class="fas fa-copy"></i> Copy</button>
        </div>
        <div class="result-box" id="results"></div>
      </div>

      <div class="next-step" id="nextStep" hidden>
        <p><strong>A search string finds profiles. It does not find contact details.</strong> Once you have your shortlist, export the profile URLs and get emails and mobile numbers back for the whole list in one run.</p>
        <a href="{site}/for-recruiting-teams" class="btn btn-full">See recruitment data enrichment</a>
      </div>
    </div>
  </div>

  <section class="block">
    <div class="container narrow">
      <h2>How the string is built</h2>
      <p>Titles are joined with <code>OR</code> inside brackets, because a candidate needs only one of them. Skills are joined with <code>AND</code>, because they are requirements rather than alternatives. Multi-word terms are quoted so the search engine treats them as phrases instead of loose words. Exclusions use <code>NOT</code>, which is what removes the recruiters and the interns from your results.</p>
      <p>The X-ray option wraps the same logic in a <code>site:linkedin.com/in</code> query, which searches public LinkedIn profiles through Google. It is the way to search profiles without a Recruiter seat, and it returns fewer but cleaner results.</p>
      <h2>The part Boolean cannot do</h2>
      <p>Boolean is a filter, not a contact database. It narrows twenty thousand profiles down to sixty good ones, and then you still have sixty people you cannot email. That last step is the one that costs recruiters their week.</p>
      <p>Export the shortlist as a CSV of profile URLs and run it through <a href="{site}/bulk-linkedin-phone-number-finder">bulk LinkedIn phone number finder</a> or the <a href="{site}/csv-email-finder">CSV email finder</a>. If your shortlist already lives in your ATS, <a href="{site}/enrich-ats-candidate-export">enrich an ATS candidate export</a> instead.</p>
    </div>
  </section>

  <script>
  (function () {
    var $ = function (id) { return document.getElementById(id); };
    function terms(raw) {
      return String(raw || '').split(/[\\n,]/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; });
    }
    function quote(t) { return /\\s/.test(t) ? '"' + t + '"' : t; }
    function group(list, op) {
      if (!list.length) return '';
      var joined = list.map(quote).join(' ' + op + ' ');
      return list.length > 1 ? '(' + joined + ')' : joined;
    }
    function run() {
      var titles = terms($('titles').value);
      var skills = terms($('skills').value);
      var locs = terms($('locations').value);
      var excl = terms($('exclude').value);
      var mode = $('target').value;
      var box = $('results'), label = $('outLabel'), copy = $('copyBtn'), next = $('nextStep');

      if (!titles.length && !skills.length) {
        box.textContent = 'Add at least one job title or skill.';
        label.textContent = ''; copy.hidden = true; next.hidden = true;
        return;
      }
      var parts = [];
      if (titles.length) parts.push(group(titles, 'OR'));
      skills.forEach(function (s) { parts.push(quote(s)); });
      if (locs.length) parts.push(group(locs, 'OR'));
      var str = parts.join(' AND ');
      excl.forEach(function (e) { str += ' NOT ' + quote(e); });
      if (mode === 'xray') {
        str = 'site:linkedin.com/in ' + str.replace(/ AND /g, ' ').replace(/ NOT /g, ' -');
      }
      box.textContent = str;
      label.textContent = mode === 'xray' ? 'Paste into Google' : 'Paste into LinkedIn Recruiter or your CV database';
      copy.hidden = false; next.hidden = false;
      if (window.posthog) { posthog.capture('free_tool_used', { tool: 'boolean_generator', mode: mode }); }
    }
    $('genBtn').addEventListener('click', run);
    $('copyBtn').addEventListener('click', function () {
      navigator.clipboard.writeText($('results').textContent).then(function () {
        var b = $('copyBtn'); b.innerHTML = '<i class="fas fa-check"></i> Copied';
        setTimeout(function () { b.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 1600);
      });
    });
  })();
  </script>
""",
    "cta": {
        "title": "You found the candidates. Now reach them.",
        "text": "Upload your shortlist and get verified emails and mobile numbers back in one run, ready to import into your ATS.",
    },
})

PAGES.append({
    "slug": "linkedin-xray-search-generator",
    "shape": "tool",
    "title": "LinkedIn X-Ray Search Generator - Free Google Search Builder | LinkFinder AI",
    "description": "Free LinkedIn X-ray search generator. Build a Google search that finds public LinkedIn profiles by title, skill, company and location. No Recruiter seat needed.",
    "h1": "LinkedIn X-Ray Search Generator",
    "subtitle": "Search public LinkedIn profiles through Google. No Recruiter seat, no Sales Navigator subscription.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <div class="grid2">
        <div class="field">
          <label for="title">Job title</label>
          <input type="text" id="title" placeholder="Head of Talent">
        </div>
        <div class="field">
          <label for="location">Location <span class="hint">optional</span></label>
          <input type="text" id="location" placeholder="London">
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="company">Company <span class="hint">optional</span></label>
          <input type="text" id="company" placeholder="Revolut">
        </div>
        <div class="field">
          <label for="country">Country subdomain <span class="hint">optional</span></label>
          <select id="country">
            <option value="">Any country</option>
            <option value="uk">United Kingdom (uk)</option>
            <option value="fr">France (fr)</option>
            <option value="de">Germany (de)</option>
            <option value="es">Spain (es)</option>
            <option value="it">Italy (it)</option>
            <option value="nl">Netherlands (nl)</option>
            <option value="ca">Canada (ca)</option>
            <option value="in">India (in)</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="keywords">Extra keywords <span class="hint">optional, comma separated</span></label>
        <input type="text" id="keywords" placeholder="hiring, employer branding">
      </div>
      <button class="btn btn-full" id="genBtn"><i class="fas fa-bolt"></i> Build X-ray search</button>

      <div class="output">
        <div class="output-head">
          <h3 id="outLabel"></h3>
          <button class="copy-btn" id="copyBtn" hidden><i class="fas fa-copy"></i> Copy</button>
        </div>
        <div class="result-box" id="results"></div>
        <div class="next-step" id="openStep" hidden style="border-top:0;padding-top:1rem;">
          <a href="#" id="openGoogle" target="_blank" rel="noopener" class="btn btn-full"><i class="fab fa-google"></i> Run this search on Google</a>
        </div>
      </div>

      <div class="next-step" id="nextStep" hidden>
        <p><strong>X-ray gives you profile URLs, not contact details.</strong> Copy the URLs into a CSV and get emails and direct dials back for all of them at once.</p>
        <a href="{site}/csv-email-finder" class="btn btn-full">Turn profile URLs into contacts</a>
      </div>
    </div>
  </div>

  <section class="block">
    <div class="container narrow">
      <h2>Why X-ray instead of LinkedIn search</h2>
      <p>LinkedIn caps what you can see and how many profiles you can open before it asks you to upgrade. Google has no such cap on public profile pages. An X-ray search reaches the same profiles from outside, which is why sourcers use it when a Recruiter seat is not available or has run out of views.</p>
      <p>The trade-off is freshness. Google shows profiles as of its last crawl, so a very recent job change may not appear yet. For most sourcing that is acceptable; for job-change triggers it is not.</p>
      <h2>Country subdomains</h2>
      <p>LinkedIn serves profiles on country subdomains such as <code>uk.linkedin.com</code> and <code>fr.linkedin.com</code>. Setting one narrows results to people whose profile is served from that country, which is a sharper location filter than adding a city name to the query.</p>
      <h2>Then what</h2>
      <p>A list of profile URLs is the input our bulk tools expect. Paste them into a CSV and run <a href="{site}/csv-email-finder">the CSV email finder</a>, or go straight to <a href="{site}/bulk-linkedin-phone-number-finder">bulk LinkedIn phone number finder</a> if you need to call rather than email. Recruiters can see the whole workflow on <a href="{site}/for-recruiting-teams">recruitment data enrichment</a>.</p>
    </div>
  </section>

  <script>
  (function () {
    var $ = function (id) { return document.getElementById(id); };
    function q(s) { s = String(s || '').trim(); return /\\s/.test(s) ? '"' + s + '"' : s; }
    function run() {
      var t = $('title').value.trim(), loc = $('location').value.trim();
      var co = $('company').value.trim(), cc = $('country').value;
      var kw = $('keywords').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var box = $('results'), label = $('outLabel'), copy = $('copyBtn');
      var next = $('nextStep'), openStep = $('openStep');

      if (!t && !co && !kw.length) {
        box.textContent = 'Add a job title, a company, or a keyword.';
        label.textContent = ''; copy.hidden = true; next.hidden = true; openStep.hidden = true;
        return;
      }
      var host = (cc ? cc + '.' : '') + 'linkedin.com/in';
      var parts = ['site:' + host];
      if (t) parts.push(q(t));
      if (co) parts.push(q(co));
      if (loc) parts.push(q(loc));
      kw.forEach(function (k) { parts.push(q(k)); });
      var str = parts.join(' ');
      box.textContent = str;
      label.textContent = 'Google X-ray query';
      copy.hidden = false; next.hidden = false; openStep.hidden = false;
      $('openGoogle').href = 'https://www.google.com/search?q=' + encodeURIComponent(str);
      if (window.posthog) { posthog.capture('free_tool_used', { tool: 'xray_generator' }); }
    }
    $('genBtn').addEventListener('click', run);
    ['title', 'location', 'company', 'keywords'].forEach(function (id) {
      $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    });
    $('copyBtn').addEventListener('click', function () {
      navigator.clipboard.writeText($('results').textContent).then(function () {
        var b = $('copyBtn'); b.innerHTML = '<i class="fas fa-check"></i> Copied';
        setTimeout(function () { b.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 1600);
      });
    });
  })();
  </script>
""",
    "cta": {
        "title": "From profile URLs to people you can actually reach",
        "text": "Upload the URLs your X-ray search found. Get verified emails and mobile numbers back in one run.",
    },
})

# ============================================================== WORKFLOW PAGES

PAGES.append({
    "slug": "enrich-sales-navigator-export",
    "shape": "landing",
    "title": "Enrich a Sales Navigator Export with Emails and Phone Numbers | LinkFinder AI",
    "description": "Upload your Sales Navigator export and get verified work emails and direct dial phone numbers back. Handles the export's column names automatically. 10 free credits.",
    "h1": "Enrich a Sales Navigator Export",
    "subtitle": "Upload the CSV you exported from Sales Navigator. Get verified work emails and direct dials back, ready for your sequencer.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <ul class="checks">
        <li><i class="fas fa-check"></i> <span>Upload the export exactly as it comes out of Sales Navigator. No reformatting.</span></li>
        <li><i class="fas fa-check"></i> <span>Column names are detected automatically, including the LinkedIn URL column.</span></li>
        <li><i class="fas fa-check"></i> <span>Returns verified work email, direct dial, job title, company and company domain.</span></li>
        <li><i class="fas fa-check"></i> <span>Download as CSV, or push straight into HubSpot.</span></li>
      </ul>
      <a href="{site}/sign-up" class="btn btn-full"><i class="fas fa-cloud-upload-alt"></i> Upload your export &mdash; 10 free credits</a>
      <div class="next-step">
        <p style="margin:0;">Already have an account? <a href="{site}/app">Go to bulk enrichment</a>.</p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Sales Navigator does not give you emails</h2>
      <p>The export gives you names, titles, companies and profile URLs. It does not give you a work email, and it does not give you a phone number. Around four percent of profiles carry a contact detail you can actually use, which is why every team that exports from Sales Navigator ends up enriching the file somewhere.</p>
      <p>That step is what this page does. The profile URL in your export is the strongest possible input for enrichment, because it identifies one specific person rather than a name that forty other people share.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>What comes back</h2>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Field</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td>Work email</td><td>Verified before it is returned. Unverifiable addresses are left blank rather than guessed.</td></tr>
            <tr><td>Direct dial</td><td>Mobile where available, switchboard otherwise. Coverage is lower than email &mdash; expect a partial fill, not a full one.</td></tr>
            <tr><td>Job title and company</td><td>Current as of the last profile refresh, which catches people who moved since you built the list.</td></tr>
            <tr><td>Company domain</td><td>Useful for deduplicating against accounts already in your CRM.</td></tr>
          </tbody>
        </table>
      </div>
      <p style="margin-top:1rem;">We would rather return an empty cell than a plausible-looking wrong address. A bounced send costs more than a missing row.</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>The rest of the workflow</h2>
      <p class="inline-links">If your list came from somewhere else, there is a page for that: <a href="{site}/enrich-apollo-export">enrich an Apollo export</a>, <a href="{site}/enrich-crm-contact-list">enrich a CRM contact list</a>, or <a href="{site}/enrich-ats-candidate-export">enrich an ATS candidate export</a>. If you do not have a list yet, the <a href="{site}/linkedin-xray-search-generator">LinkedIn X-ray search generator</a> builds one without a Sales Navigator seat. Sales teams running this end to end should start at <a href="{site}/for-sales-teams">sales team data enrichment</a>.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "Your export is one upload away from being useful",
        "text": "Ten free credits, no card. Enough to run a real sample of your list and check the match rate yourself before you pay for anything.",
    },
})

PAGES.append({
    "slug": "enrich-ats-candidate-export",
    "shape": "landing",
    "title": "Enrich an ATS Candidate Export - Add Missing Emails and Phones | LinkFinder AI",
    "description": "Upload a candidate export from Greenhouse, Lever, Workable, Bullhorn or Recruitee and fill in missing emails and mobile numbers. 10 free credits, no card.",
    "h1": "Enrich an ATS Candidate Export",
    "subtitle": "Upload a candidate export and fill in the missing emails and mobile numbers, so your pipeline is reachable again.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <ul class="checks">
        <li><i class="fas fa-check"></i> <span>Works with exports from Greenhouse, Lever, Workable, Bullhorn, Recruitee and Teamtailor.</span></li>
        <li><i class="fas fa-check"></i> <span>Matches on LinkedIn URL where your export has one, on name and company where it does not.</span></li>
        <li><i class="fas fa-check"></i> <span>Fills only the gaps. Existing contact details in your file are left untouched.</span></li>
        <li><i class="fas fa-check"></i> <span>Returns the same row order, so you can paste the columns straight back.</span></li>
      </ul>
      <a href="{site}/sign-up" class="btn btn-full"><i class="fas fa-cloud-upload-alt"></i> Upload a candidate export &mdash; 10 free credits</a>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Old candidate records are the cheapest pipeline you have</h2>
      <p>A database of two thousand past applicants is worth more than a fresh sourcing project, and it is already yours. The problem is that a contact record decays roughly twenty to thirty percent a year: people change jobs, company email addresses die, and mobile numbers are often missing entirely because the candidate applied through a form that never asked.</p>
      <p>Re-enriching an export is the fastest way to make that database callable again. It is also the least glamorous piece of recruiting ops, which is why most teams never get to it.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>What we can and cannot fill</h2>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Field</th><th>Typical coverage</th></tr></thead>
          <tbody>
            <tr><td>Work email</td><td>Strong, when the candidate is currently employed somewhere with a public domain.</td></tr>
            <tr><td>Mobile number</td><td>Partial. Phone coverage is genuinely lower than email across every provider, ours included. Anyone claiming otherwise is counting switchboards.</td></tr>
            <tr><td>Current employer and title</td><td>Strong. This is often the most useful field, because it tells you who is newly open to a move.</td></tr>
            <tr><td>LinkedIn profile URL</td><td>Filled where your export lacks one, which makes every future enrichment more accurate.</td></tr>
          </tbody>
        </table>
      </div>
      <p style="margin-top:1rem;">Run a sample of a hundred rows on free credits before committing your whole database. Match rates vary by market and seniority, and you should see yours rather than take ours on faith.</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>Before and after this step</h2>
      <p class="inline-links">Still building the shortlist? The <a href="{site}/boolean-search-string-generator">Boolean search string generator</a> and the <a href="{site}/linkedin-xray-search-generator">LinkedIn X-ray search generator</a> are free and need no account. Need to call rather than email? Go to <a href="{site}/bulk-linkedin-phone-number-finder">bulk LinkedIn phone number finder</a>. The full picture for talent teams is on <a href="{site}/for-recruiting-teams">recruitment data enrichment</a>.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "Make your candidate database callable again",
        "text": "Ten free credits is enough to re-enrich a sample and see what your real match rate looks like before you decide.",
    },
})

PAGES.append({
    "slug": "enrich-apollo-export",
    "shape": "landing",
    "title": "Enrich an Apollo Export - Fill In Missing Phone Numbers | LinkFinder AI",
    "description": "Apollo exports often arrive without mobile numbers. Upload your export and fill in the missing direct dials and verified emails. 10 free credits, no card.",
    "h1": "Enrich an Apollo Export",
    "subtitle": "Apollo gives you the list. Upload it here to fill in the direct dials and emails it left blank.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <ul class="checks">
        <li><i class="fas fa-check"></i> <span>Upload the Apollo CSV as exported. Its column names are recognised automatically.</span></li>
        <li><i class="fas fa-check"></i> <span>Only the blank cells are filled. Data you already paid Apollo for stays as it is.</span></li>
        <li><i class="fas fa-check"></i> <span>You are charged for rows we actually enrich, not for rows we could not.</span></li>
      </ul>
      <a href="{site}/sign-up" class="btn btn-full"><i class="fas fa-cloud-upload-alt"></i> Upload your Apollo export &mdash; 10 free credits</a>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Why the phone column is half empty</h2>
      <p>Apollo is strong on company data and on work email. Mobile numbers are a different data type with a different supply chain, and no single provider has good coverage of all of them. That is not a criticism of Apollo specifically &mdash; it is true of every all-in-one platform, and it is why experienced teams run a second pass rather than accept the gaps.</p>
      <p>Running a second provider over the blanks is called waterfall enrichment. It costs a little more per record and it is the difference between a callable list and a list of names.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Honest expectations</h2>
      <p>A second pass does not fill every gap. If Apollo returned no mobile for a given person, there is a reasonable chance nobody has one. What a second pass reliably does is recover a meaningful share of the blanks &mdash; enough to matter on a list of two thousand, not enough to promise on a list of ten.</p>
      <p>Run your free credits against rows Apollo left empty rather than rows it filled. That is the only test that tells you whether this is worth paying for on your particular list.</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>Related workflows</h2>
      <p class="inline-links">Exporting from somewhere else? See <a href="{site}/enrich-sales-navigator-export">enrich a Sales Navigator export</a> or <a href="{site}/enrich-crm-contact-list">enrich a CRM contact list</a>. If phone coverage is the whole reason you are here, go straight to <a href="{site}/bulk-linkedin-phone-number-finder">bulk LinkedIn phone number finder</a>. Sales teams: <a href="{site}/for-sales-teams">sales team data enrichment</a>.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "Fill the blanks Apollo left",
        "text": "Upload the export, run it against your free credits, and look at how many empty phone cells come back filled.",
    },
})

PAGES.append({
    "slug": "enrich-crm-contact-list",
    "shape": "landing",
    "title": "Enrich a CRM Contact List - Refresh Stale Records | LinkFinder AI",
    "description": "Upload a HubSpot or Salesforce contact export and refresh stale emails, missing phone numbers and outdated job titles. 10 free credits, no card.",
    "h1": "Enrich a CRM Contact List",
    "subtitle": "Upload a contact export from HubSpot or Salesforce. Get corrected emails, missing phone numbers and current job titles back.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <ul class="checks">
        <li><i class="fas fa-check"></i> <span>Accepts HubSpot and Salesforce contact exports in their native column format.</span></li>
        <li><i class="fas fa-check"></i> <span>Flags contacts who have changed employer since the record was created.</span></li>
        <li><i class="fas fa-check"></i> <span>Push results back into HubSpot directly, or download a CSV for import.</span></li>
      </ul>
      <a href="{site}/sign-up" class="btn btn-full"><i class="fas fa-cloud-upload-alt"></i> Upload a contact export &mdash; 10 free credits</a>
      <div class="next-step">
        <p style="margin:0;">Using HubSpot? There is a direct integration on <a href="{site}/hubspot-crm-enrichment">HubSpot CRM enrichment</a>.</p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Your CRM is quietly rotting</h2>
      <p>Contact data decays at roughly two to three percent a month. Nothing breaks visibly &mdash; the records are still there, the dashboards still count them &mdash; but a growing share of the addresses are dead and a growing share of the titles describe a job the person no longer holds. By the two-year mark a meaningful fraction of a database is fiction.</p>
      <p>The cost shows up somewhere else: bounce rates climb, sender reputation drops, and campaigns to clean segments start underperforming for reasons nobody traces back to the data.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>The job-change signal</h2>
      <p>The most valuable output of a CRM refresh is not the corrected email. It is the list of people who moved. A former customer who just started at a new company is the warmest outbound you will ever send, and that signal is sitting unused in most CRMs because nobody re-checks old records.</p>
      <p>Every enriched row comes back with current employer and title, so a refresh doubles as a job-change report on your existing database.</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>Related</h2>
      <p class="inline-links">Working from a prospecting tool instead of your CRM? See <a href="{site}/enrich-sales-navigator-export">enrich a Sales Navigator export</a> or <a href="{site}/enrich-apollo-export">enrich an Apollo export</a>. For the whole picture, <a href="{site}/for-sales-teams">sales team data enrichment</a>.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "Find out how much of your CRM is still real",
        "text": "Export a thousand contacts, run the free credits against a sample, and see the bounce rate you have been carrying.",
    },
})

PAGES.append({
    "slug": "bulk-linkedin-phone-number-finder",
    "shape": "landing",
    "title": "Bulk LinkedIn Phone Number Finder - Upload a CSV | LinkFinder AI",
    "description": "Upload a CSV of LinkedIn profile URLs and get direct dial phone numbers back for the whole list. Built for recruiting and sales teams. 10 free credits.",
    "h1": "Bulk LinkedIn Phone Number Finder",
    "subtitle": "Upload a CSV of LinkedIn profile URLs. Get direct dial numbers back for the whole list in one run.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <ul class="checks">
        <li><i class="fas fa-check"></i> <span>One CSV of profile URLs in, one enriched CSV out.</span></li>
        <li><i class="fas fa-check"></i> <span>Up to 25,000 profiles a month on a standard plan.</span></li>
        <li><i class="fas fa-check"></i> <span>Credits are only spent on rows where a number is actually found.</span></li>
      </ul>
      <a href="{site}/sign-up" class="btn btn-full"><i class="fas fa-cloud-upload-alt"></i> Upload your list &mdash; 10 free credits</a>
      <div class="next-step">
        <p style="margin:0;">Looking up one person instead? Use the <a href="{site}/linkedin-phone-number-finder">single LinkedIn phone number finder</a>.</p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>What honest phone coverage looks like</h2>
      <p>Phone data is harder than email and the coverage numbers vendors quote are usually generous. Expect a partial fill on any list, weighted toward senior people in the US and Western Europe and thinner for junior roles and smaller markets.</p>
      <p>You should measure this yourself rather than believe a number on a landing page. Run a hundred rows on free credits, count the filled cells, and decide from that. If the rate is poor on your particular list, you will have spent nothing finding out.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Getting the input list</h2>
      <p>The tools that produce a list of profile URLs are free and need no account. The <a href="{site}/linkedin-xray-search-generator">X-ray search generator</a> builds a Google query that returns public profiles; the <a href="{site}/boolean-search-string-generator">Boolean search string generator</a> does the same inside LinkedIn Recruiter. Either way you end up with URLs, which is exactly what this page expects.</p>
      <p>If your list already lives in a system, use <a href="{site}/enrich-ats-candidate-export">enrich an ATS candidate export</a> or <a href="{site}/enrich-sales-navigator-export">enrich a Sales Navigator export</a> instead, since those keep your original columns intact.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "Stop looking people up one at a time",
        "text": "If you are opening profiles one by one to find numbers, you are spending a week on something that takes one upload.",
    },
})

PAGES.append({
    "slug": "bulk-linkedin-email-finder",
    "shape": "landing",
    "title": "Bulk LinkedIn Email Finder - Upload a CSV of Profile URLs | LinkFinder AI",
    "description": "Upload a CSV of LinkedIn profile URLs and get verified work emails back for the whole list. Up to 25,000 profiles a month. 10 free credits, no card.",
    "h1": "Bulk LinkedIn Email Finder",
    "subtitle": "Upload a CSV of LinkedIn profile URLs. Get verified work emails back for every row, in one run.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <ul class="checks">
        <li><i class="fas fa-check"></i> <span>One CSV of profile URLs in, one enriched CSV out.</span></li>
        <li><i class="fas fa-check"></i> <span>Up to 25,000 profiles a month on a standard plan.</span></li>
        <li><i class="fas fa-check"></i> <span>Every address verified before it is returned. No permutation guesses.</span></li>
        <li><i class="fas fa-check"></i> <span>Export to CSV or push straight into HubSpot.</span></li>
      </ul>
      <a href="{site}/sign-up" class="btn btn-full"><i class="fas fa-cloud-upload-alt"></i> Upload your list &mdash; 10 free credits</a>
      <div class="next-step">
        <p style="margin:0;">Looking up one profile instead? Use the <a href="{site}/linkedin-email-finder">single LinkedIn email finder</a>.</p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Why the profile URL is the best input</h2>
      <p>A LinkedIn profile URL identifies exactly one person. A name and a company does not &mdash; there are six Sarah Chens at large employers, and picking the wrong one produces an address that verifies fine and reaches the wrong human.</p>
      <p>If your file already carries profile URLs, your match rate will be the best this product can produce. If it carries names and companies instead, use the <a href="{site}/csv-email-finder">CSV email finder</a>, which handles that shape.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Verified, not generated</h2>
      <p>Generating likely addresses from a name is trivial, and you can do it yourself for free with the <a href="{site}/email-permutator">email permutator</a>. Confirming which of those guesses actually exists is the part that takes infrastructure, and the part that protects your sending domain.</p>
      <p>Rows we cannot verify come back blank. An empty cell costs you nothing; a plausible wrong address costs you deliverability across the whole campaign.</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>Where your list came from</h2>
      <p class="inline-links">There is a page for each source, and each keeps your original columns: <a href="{site}/enrich-sales-navigator-export">Sales Navigator export</a>, <a href="{site}/enrich-apollo-export">Apollo export</a>, <a href="{site}/enrich-ats-candidate-export">ATS candidate export</a>, <a href="{site}/enrich-crm-contact-list">CRM contact list</a>. Need numbers too? <a href="{site}/bulk-linkedin-phone-number-finder">Bulk LinkedIn phone number finder</a>. Writing code instead? <a href="{site}/api-documentation">API documentation</a>.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "One upload instead of a week of tabs",
        "text": "Ten free credits, no card. Enough to run a real sample of your own list and judge the match rate yourself.",
    },
})

PAGES.append({
    "slug": "csv-email-finder",
    "shape": "landing",
    "title": "CSV Email Finder - Upload a List, Get Verified Emails | LinkFinder AI",
    "description": "Upload a CSV of names, companies or LinkedIn URLs and get verified work emails back for the whole file. Column names detected automatically. 10 free credits.",
    "h1": "CSV Email Finder",
    "subtitle": "Upload a CSV of names and companies, or of LinkedIn profile URLs. Get verified work emails back for the whole file.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <ul class="checks">
        <li><i class="fas fa-check"></i> <span>Accepts names plus company, company domains, or LinkedIn profile URLs.</span></li>
        <li><i class="fas fa-check"></i> <span>Column headers are detected automatically, in English and in French.</span></li>
        <li><i class="fas fa-check"></i> <span>Every address is verified before it is returned. Unverifiable rows come back blank.</span></li>
      </ul>
      <a href="{site}/sign-up" class="btn btn-full"><i class="fas fa-cloud-upload-alt"></i> Upload a CSV &mdash; 10 free credits</a>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Which input gives the best match rate</h2>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>What your CSV has</th><th>Expected accuracy</th></tr></thead>
          <tbody>
            <tr><td>LinkedIn profile URL</td><td>Best. The URL identifies one specific person, so there is nothing to guess.</td></tr>
            <tr><td>Full name plus company domain</td><td>Good. Ambiguity only appears for very common names at very large companies.</td></tr>
            <tr><td>Full name plus company name</td><td>Fair. The company has to be resolved to a domain first, which adds a failure point.</td></tr>
            <tr><td>Full name only</td><td>Not usable. There is no way to tell which of six hundred people you mean.</td></tr>
          </tbody>
        </table>
      </div>
      <p style="margin-top:1rem;">If you can add a LinkedIn URL column before uploading, do. It is the single biggest lever on your match rate.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Verified, not permuted</h2>
      <p>Generating likely addresses is trivial and mostly useless &mdash; you can do it yourself with the free <a href="{site}/email-permutator">email permutator</a>. The work is confirming which one exists. Sending to unverified permutations is the fastest way to damage a sending domain, and it is what most cheap lists actually are underneath.</p>
      <h2>Related</h2>
      <p class="inline-links">Working from a specific system? <a href="{site}/enrich-sales-navigator-export">Sales Navigator export</a>, <a href="{site}/enrich-apollo-export">Apollo export</a>, <a href="{site}/enrich-crm-contact-list">CRM contact list</a> or <a href="{site}/enrich-ats-candidate-export">ATS candidate export</a>. Need numbers rather than addresses? <a href="{site}/bulk-linkedin-phone-number-finder">Bulk LinkedIn phone number finder</a>.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "One upload, one enriched file back",
        "text": "Ten free credits, no card. Enough to test your own file and see the match rate before you decide anything.",
    },
})

# ==================================================================== ICP HUBS

PAGES.append({
    "slug": "for-recruiting-teams",
    "shape": "landing",
    "title": "Recruitment Data Enrichment for Talent Teams | LinkFinder AI",
    "description": "Enrich candidate lists with verified emails and mobile numbers. Built for in-house talent teams and recruitment agencies working from ATS exports and sourcing shortlists.",
    "h1": "Recruitment Data Enrichment",
    "subtitle": "For talent teams who have the candidates already and cannot reach them. Upload the list, get emails and mobiles back.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <a href="{site}/sign-up" class="btn btn-full"><i class="fas fa-cloud-upload-alt"></i> Enrich a candidate list &mdash; 10 free credits</a>
      <div class="next-step">
        <p style="margin:0;">Or start with a free tool that needs no account: <a href="{site}/boolean-search-string-generator">Boolean search string generator</a> &middot; <a href="{site}/linkedin-xray-search-generator">X-ray search generator</a></p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>The week this gives back</h2>
      <p>Sourcing is not usually the bottleneck. A good recruiter can build a shortlist of sixty strong candidates in an afternoon. What takes the rest of the week is opening sixty profiles one at a time, hunting for a personal email, giving up on the ones with no contact route, and starting the outreach three days later than planned.</p>
      <p>That part is a batch job. Export the shortlist, upload it, get sixty contactable people back, and start the outreach the same afternoon.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Where your list is coming from</h2>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Your situation</th><th>Start here</th></tr></thead>
          <tbody>
            <tr><td>A shortlist from LinkedIn Recruiter or a sourcing session</td><td><a href="{site}/csv-email-finder">CSV email finder</a></td></tr>
            <tr><td>A candidate export from Greenhouse, Lever, Workable or Bullhorn</td><td><a href="{site}/enrich-ats-candidate-export">Enrich an ATS candidate export</a></td></tr>
            <tr><td>You need to call, not email</td><td><a href="{site}/bulk-linkedin-phone-number-finder">Bulk LinkedIn phone number finder</a></td></tr>
            <tr><td>You do not have a list yet</td><td><a href="{site}/boolean-search-string-generator">Boolean search string generator</a></td></tr>
            <tr><td>You want this inside your own system</td><td><a href="{site}/api-documentation">API documentation</a></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>What agencies use it for</h2>
      <p>Two jobs come up repeatedly. The first is re-activating an old database: a few thousand past applicants whose contact details have decayed past the point of usefulness, refreshed in one run and turned back into pipeline. The second is the job-change report &mdash; every enriched row returns the candidate's current employer, so a refresh tells you who has moved and is therefore worth a call this month.</p>
      <p>Both are batch work on a list you already own, which is the shape of problem this is built for.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>On phone coverage, honestly</h2>
      <p>Email coverage is strong. Mobile coverage is partial, and it is partial for every vendor in this market regardless of what their pricing page implies. It skews toward senior roles in the US and Western Europe.</p>
      <p>Run a hundred candidates on free credits before you plan a campaign around it. If the fill rate does not work for your market, you will have found out for nothing.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "Built for the list you already have",
        "text": "Ten free credits, no card, no call. Enough to run a real shortlist and judge it on your own numbers.",
    },
})

PAGES.append({
    "slug": "for-sales-teams",
    "shape": "landing",
    "title": "Sales Team Data Enrichment - Emails and Direct Dials | LinkFinder AI",
    "description": "Enrich prospect lists with verified work emails and direct dials. Built for SDR teams and revenue ops working from Sales Navigator, Apollo and CRM exports.",
    "h1": "Sales Team Data Enrichment",
    "subtitle": "For revenue teams with a list and no way to reach it. Upload the export, get verified emails and direct dials back.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <a href="{site}/sign-up" class="btn btn-full"><i class="fas fa-cloud-upload-alt"></i> Enrich a prospect list &mdash; 10 free credits</a>
      <div class="next-step">
        <p style="margin:0;">Or try a free tool with no account: <a href="{site}/email-permutator">Email permutator</a> &middot; <a href="{site}/linkedin-xray-search-generator">X-ray search generator</a></p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>The list is not the problem</h2>
      <p>Most teams can build a target list. What stops the sequence going out is that a third of the rows have no email, most have no phone, and a slice of the rest describe people who left the company months ago. The sequence launches against a file that quietly wastes a third of its sends.</p>
      <p>Enrichment before launch fixes the arithmetic. It also protects the sending domain, which is the asset nobody notices until it is damaged.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Where your list is coming from</h2>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Your situation</th><th>Start here</th></tr></thead>
          <tbody>
            <tr><td>A Sales Navigator export</td><td><a href="{site}/enrich-sales-navigator-export">Enrich a Sales Navigator export</a></td></tr>
            <tr><td>An Apollo export with empty phone columns</td><td><a href="{site}/enrich-apollo-export">Enrich an Apollo export</a></td></tr>
            <tr><td>A stale CRM segment</td><td><a href="{site}/enrich-crm-contact-list">Enrich a CRM contact list</a></td></tr>
            <tr><td>A CSV of names and companies</td><td><a href="{site}/csv-email-finder">CSV email finder</a></td></tr>
            <tr><td>You want it wired into your stack</td><td><a href="{site}/api-documentation">API documentation</a></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>The job-change trigger</h2>
      <p>Every enriched row returns the person's current employer and title. Run it over a closed-lost list or a former-customer list and you get back something more useful than corrected emails: the names of people who have just moved somewhere new.</p>
      <p>Someone who liked your product at their last company and has just arrived at a new one, with budget and a mandate to change things, is the warmest outbound available to you. That list is sitting in your CRM right now and nobody is re-checking it.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>What we will not claim</h2>
      <p>Direct dial coverage is partial. It is best for senior titles in the US and Western Europe and noticeably thinner elsewhere and below manager level. Email coverage is considerably stronger.</p>
      <p>Test it on your own segment with free credits rather than taking a published match rate at face value, including ours.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "Enrich the list before the sequence goes out",
        "text": "Ten free credits, no card. Enough to run a real segment and see the fill rate on your own data.",
    },
})

# =============================================================== ALTERNATIVES

PAGES.append({
    "slug": "salesql-alternative",
    "shape": "landing",
    "title": "SalesQL Alternative for Bulk Email and Phone Enrichment | LinkFinder AI",
    "description": "Looking for a SalesQL alternative? LinkFinder AI enriches CSV uploads and offers a full API, with credits that are only spent on rows that return data.",
    "h1": "SalesQL Alternative",
    "subtitle": "If you like the LinkedIn workflow but need bulk CSV runs and an API behind it, this is the comparison you want.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <a href="{site}/sign-up" class="btn btn-full">Try LinkFinder AI &mdash; 10 free credits</a>
      <div class="next-step">
        <p style="margin:0;">Compare others: <a href="{site}/lusha-alternative">Lusha</a> &middot; <a href="{site}/kaspr-alternative">Kaspr</a> &middot; <a href="{site}/contact-out-alternative.html">ContactOut</a> &middot; <a href="{site}/wiza-alternative">Wiza</a></p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Where SalesQL is the better choice</h2>
      <p>SalesQL is a well-built browser extension and the in-browser experience is genuinely good. If your work is looking up contacts while you browse LinkedIn profiles one at a time, and you have no need to process files or call an API, it does that job and there is no strong reason to move.</p>
      <p>We would rather say that plainly than pretend otherwise. Comparison pages that find no merit in the competitor are not comparisons.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Where teams move across</h2>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th></th><th>LinkFinder AI</th><th>SalesQL</th></tr></thead>
          <tbody>
            <tr><td>Primary workflow</td><td>Upload a file, or call the API</td><td>Browser extension on LinkedIn</td></tr>
            <tr><td>Bulk CSV enrichment</td><td>Up to 25,000 rows a month</td><td>Available, secondary to the extension</td></tr>
            <tr><td>Public API</td><td>Documented, with an OpenAPI spec</td><td>Limited</td></tr>
            <tr><td>Credits on empty results</td><td>Not charged</td><td>Varies by plan</td></tr>
            <tr><td>Automation</td><td>n8n, Make, Google Sheets, MCP</td><td>Zapier and native integrations</td></tr>
          </tbody>
        </table>
      </div>
      <p style="margin-top:1rem;">The short version: an extension is the right tool for one profile at a time, and the wrong tool for two thousand.</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>Try it against your own list</h2>
      <p class="inline-links">Do not take a table's word for it. Take a hundred rows you already ran through SalesQL, run them again on free credits, and compare the fill rates side by side. Start with <a href="{site}/csv-email-finder">the CSV email finder</a>, or <a href="{site}/enrich-sales-navigator-export">a Sales Navigator export</a> if that is where your list lives.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "Compare on your data, not on ours",
        "text": "Ten free credits is enough to re-run a real sample and see which tool fills more of your rows.",
    },
})

PAGES.append({
    "slug": "evaboot-alternative",
    "shape": "landing",
    "title": "Evaboot Alternative for Sales Navigator Exports | LinkFinder AI",
    "description": "Looking for an Evaboot alternative? Enrich Sales Navigator exports with verified emails and direct dials, plus a full API and CRM sync. 10 free credits.",
    "h1": "Evaboot Alternative",
    "subtitle": "Both clean up Sales Navigator exports. The difference is what happens after the export is clean.",
    "body": """
  <div class="container">
    <div class="tool-card">
      <a href="{site}/sign-up" class="btn btn-full">Try LinkFinder AI &mdash; 10 free credits</a>
      <div class="next-step">
        <p style="margin:0;">Or go straight to the workflow: <a href="{site}/enrich-sales-navigator-export">enrich a Sales Navigator export</a></p>
      </div>
    </div>
  </div>

  <section class="block alt">
    <div class="container narrow">
      <h2>Where Evaboot is the better choice</h2>
      <p>Evaboot's core job is extracting and cleaning a Sales Navigator search, and it does that well. Its filtering catches the false positives Sales Navigator returns, which is a real and specific problem. If exporting clean lists out of Sales Navigator is the whole of your workflow, it is a good fit.</p>
    </div>
  </section>

  <section class="block">
    <div class="container narrow">
      <h2>Where the two diverge</h2>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th></th><th>LinkFinder AI</th><th>Evaboot</th></tr></thead>
          <tbody>
            <tr><td>Sales Navigator exports</td><td>Enriches an export you already have</td><td>Extracts and cleans the export itself</td></tr>
            <tr><td>Input sources</td><td>Any CSV: ATS, CRM, Apollo, X-ray results</td><td>Sales Navigator focused</td></tr>
            <tr><td>Direct dial numbers</td><td>Included</td><td>Email focused</td></tr>
            <tr><td>Public API</td><td>Documented, with an OpenAPI spec</td><td>Limited</td></tr>
            <tr><td>Recruiting workflows</td><td>ATS exports supported</td><td>Sales oriented</td></tr>
          </tbody>
        </table>
      </div>
      <p style="margin-top:1rem;">They are not strictly competitors. Plenty of teams export with Evaboot and enrich the result here, particularly when they need phone numbers.</p>
    </div>
  </section>

  <section class="block alt">
    <div class="container narrow">
      <h2>Related</h2>
      <p class="inline-links">The workflow page is <a href="{site}/enrich-sales-navigator-export">enrich a Sales Navigator export</a>. Compare others: <a href="{site}/lusha-alternative">Lusha</a> &middot; <a href="{site}/kaspr-alternative">Kaspr</a> &middot; <a href="{site}/salesql-alternative">SalesQL</a>. Sales teams start at <a href="{site}/for-sales-teams">sales team data enrichment</a>.</p>
    </div>
  </section>
""",
    "cta": {
        "title": "Clean list, then contactable list",
        "text": "However you got the export, ten free credits will tell you how many of its rows we can make reachable.",
    },
})


def main():
    written = []
    for cfg in PAGES:
        written.append(build(cfg))
    print("Generated %d pages:" % len(written))
    for p in written:
        print("  " + os.path.basename(p))


if __name__ == "__main__":
    main()
