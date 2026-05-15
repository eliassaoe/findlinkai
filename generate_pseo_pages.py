#!/usr/bin/env python3
"""
LinkFinder AI — pSEO Page Generator
Generates one fully-optimised HTML page per keyword using OpenRouter API
for unique content, assembled with the exact design system from hand-built pages.

Usage:
    pip install requests
    python3 generate_pseo_pages.py

Output: ./pseo-pages/ folder with one HTML file per keyword
"""

import requests
import json
import os
import re
import time

OPENROUTER_API_KEY = "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"

# ── Keywords to generate pages for
KEYWORDS = [
    "company enrichment api",
    "contact enrichment api",
    "lead enrichment api",
    "contact data api",
    "data enrichment api",
    "n8n linkedin automation",
    "company data api",
    "linkedin scraping api",
    "company info api",
    "people data labs alternative",
    "proxycurl alternative",
    "linkedin scraper python",
    "lemlist alternative",
    "hunter io alternative",
    "phone number enrichment",
    "clay enrichment api",
    "snov io alternative",
    "linkedin job scraper",
    "instagram scraper api",
    "instagram email finder",
    "instagram api python",
    "extract job title from linkedin url",
    "extract job title from linkedin profile",
    "extract full name from linkedin profile",
    "extract name from linkedin url",
    "linkedin profile data extraction",
    "data enrichment api pricing",
    "recruiting enrichment api",
    "real time lead enrichment api",
    "clearbit alternative",
    "linkedin profile scraper api",
    "linkedin email finder api",
    "linkedin post scraper api",
    "linkedin search by email api",
    "waalaxy alternative",
    "linkedin profile data extraction api",
]

# ── Slug generator
def to_slug(keyword):
    slug = keyword.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'\s+', '-', slug.strip())
    return slug

# ── CSS (identical to hand-built pages)
CSS = """
    :root{--primary:#2563eb;--primary-hover:#1d4ed8;--gray-50:#f9fafb;--gray-100:#f3f4f6;--gray-200:#e5e7eb;--gray-300:#d1d5db;--gray-400:#9ca3af;--gray-500:#6b7280;--gray-600:#4b5563;--gray-700:#374151;--gray-800:#1f2937;--gray-900:#111827;--success:#10b981;--error:#ef4444;}
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:white;color:var(--gray-800);line-height:1.6;font-size:16px;}
    .container{max-width:1200px;margin:0 auto;padding:0 1rem;}
    .header{border-bottom:1px solid var(--gray-200);padding:1rem 0;background:white;position:sticky;top:0;z-index:50;}
    .header-content{display:flex;justify-content:space-between;align-items:center;gap:2rem;}
    .logo{display:flex;align-items:center;gap:.5rem;text-decoration:none;color:var(--gray-900);flex-shrink:0;}
    .logo-icon{width:32px;height:32px;background:var(--primary);border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:.875rem;}
    .logo-text{font-size:1.25rem;font-weight:600;}
    .nav-menu{display:flex;gap:2rem;align-items:center;flex:1;justify-content:center;}
    .nav-menu a{color:var(--gray-700);text-decoration:none;font-size:.875rem;font-weight:500;transition:color .2s;white-space:nowrap;}
    .nav-menu a:hover{color:var(--primary);}
    .auth-buttons{display:flex;gap:.75rem;align-items:center;flex-shrink:0;}
    .btn{background:var(--primary);color:white;border:none;padding:.875rem 1.5rem;border-radius:8px;font-weight:500;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;justify-content:center;gap:.5rem;text-decoration:none;font-size:.875rem;min-height:44px;}
    .btn:hover{background:var(--primary-hover);transform:translateY(-1px);}
    .btn-outline{background:transparent;color:var(--primary);border:1px solid var(--gray-300);}
    .btn-outline:hover{background:var(--gray-50);border-color:var(--primary);transform:none;}
    .btn-large{padding:1rem 2.5rem;font-size:1rem;font-weight:600;}
    .breadcrumb{padding:.75rem 0;font-size:.8rem;color:var(--gray-400);border-bottom:1px solid var(--gray-100);}
    .breadcrumb a{color:var(--gray-400);text-decoration:none;}
    .breadcrumb a:hover{color:var(--primary);}
    .breadcrumb span{margin:0 .4rem;}
    .hero{text-align:center;padding:4.5rem 0 2.5rem;}
    .hero-tag{display:inline-flex;align-items:center;gap:.5rem;background:#eff6ff;color:var(--primary);font-size:.8rem;font-weight:600;padding:.35rem .875rem;border-radius:100px;border:1px solid #bfdbfe;margin-bottom:1.5rem;text-transform:uppercase;letter-spacing:.04em;}
    .hero h1{font-size:3.5rem;font-weight:700;color:var(--gray-900);margin-bottom:1.25rem;line-height:1.1;}
    .hero h1 span{color:var(--primary);}
    .hero p{font-size:1.2rem;color:var(--gray-500);margin:0 auto 2.5rem;max-width:640px;line-height:1.7;}
    .hero-ctas{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-bottom:1.25rem;}
    .hero-social-proof{font-size:.825rem;color:var(--gray-400);display:flex;align-items:center;justify-content:center;gap:1rem;flex-wrap:wrap;}
    .hero-social-proof-item{display:flex;align-items:center;gap:.35rem;}
    .hero-social-proof-item i{color:var(--success);font-size:.75rem;}
    .stats-bar{background:var(--gray-900);padding:2rem 0;}
    .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2rem;max-width:800px;margin:0 auto;text-align:center;}
    .stat-number{font-size:2rem;font-weight:700;color:white;line-height:1;margin-bottom:.35rem;}
    .stat-label{font-size:.8rem;color:var(--gray-400);font-weight:500;}
    .section{padding:5rem 0;}
    .section-alt{padding:5rem 0;background:var(--gray-50);border-top:1px solid var(--gray-200);border-bottom:1px solid var(--gray-200);}
    .section-title{font-size:2rem;font-weight:700;color:var(--gray-900);margin-bottom:.75rem;}
    .section-sub{color:var(--gray-500);font-size:1rem;margin-bottom:3rem;max-width:560px;}
    .use-cases-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;}
    .use-case-card{background:white;border:1px solid var(--gray-200);border-radius:10px;padding:1.5rem;}
    .use-case-icon{width:40px;height:40px;border-radius:8px;background:#eff6ff;display:flex;align-items:center;justify-content:center;margin-bottom:1rem;font-size:1.1rem;}
    .use-case-title{font-size:.95rem;font-weight:600;color:var(--gray-900);margin-bottom:.5rem;}
    .use-case-desc{font-size:.85rem;color:var(--gray-500);line-height:1.6;}
    .integrations-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;}
    .integration-card{border:1px solid var(--gray-200);border-radius:10px;padding:1.25rem;text-align:center;transition:all .2s;}
    .integration-card:hover{border-color:var(--primary);box-shadow:0 4px 12px rgba(37,99,235,.08);}
    .integration-logo{width:40px;height:40px;border-radius:8px;margin:0 auto .75rem;display:flex;align-items:center;justify-content:center;}
    .integration-name{font-size:.875rem;font-weight:600;color:var(--gray-900);margin-bottom:.25rem;}
    .integration-desc{font-size:.75rem;color:var(--gray-500);}
    .faq-list{display:flex;flex-direction:column;gap:1rem;max-width:720px;}
    .faq-item{border:1px solid var(--gray-200);border-radius:8px;overflow:hidden;}
    .faq-q{padding:1.125rem 1.25rem;font-weight:600;color:var(--gray-900);cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:.95rem;}
    .faq-a{padding:0 1.25rem 1.125rem;color:var(--gray-600);font-size:.9rem;line-height:1.7;display:none;}
    .faq-a.open{display:block;}
    .code-block{background:#0f172a;border-radius:8px;padding:1.25rem;overflow-x:auto;margin-top:1rem;}
    .code-block pre{font-family:'JetBrains Mono','Fira Code',monospace;font-size:.8rem;line-height:1.7;color:#e2e8f0;white-space:pre;}
    .demo-tabs{display:flex;border-bottom:1px solid var(--gray-200);margin-bottom:0;}
    .demo-tab{padding:.625rem 1rem;font-size:.8rem;font-weight:600;color:var(--gray-500);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;background:none;border-top:none;border-left:none;border-right:none;font-family:'Inter',sans-serif;}
    .demo-tab.active{color:var(--primary);border-bottom-color:var(--primary);}
    .cta-section{background:var(--primary);padding:5rem 0;text-align:center;}
    .cta-section h2{font-size:2.5rem;font-weight:700;color:white;margin-bottom:1rem;}
    .cta-section p{color:rgba(255,255,255,.8);font-size:1.1rem;margin-bottom:2.5rem;}
    .footer{background:var(--gray-900);padding:3rem 0;color:var(--gray-400);}
    .footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:3rem;}
    .footer-brand p{font-size:.875rem;line-height:1.7;margin-top:.75rem;max-width:280px;}
    .footer-col h4{font-size:.875rem;font-weight:600;color:white;margin-bottom:1rem;}
    .footer-col a{display:block;font-size:.875rem;color:var(--gray-400);text-decoration:none;margin-bottom:.5rem;transition:color .2s;}
    .footer-col a:hover{color:white;}
    .footer-bottom{border-top:1px solid var(--gray-800);margin-top:2.5rem;padding-top:1.5rem;font-size:.8rem;display:flex;justify-content:space-between;align-items:center;}

    .related-section{padding:3.5rem 0;background:white;border-top:1px solid var(--gray-200);}
    .related-grid{display:grid;grid-template-columns:1fr 1fr;gap:3rem;}
    .related-col h3{font-size:1rem;font-weight:700;color:var(--gray-900);margin-bottom:1rem;padding-bottom:.5rem;border-bottom:2px solid var(--primary);display:inline-block;}
    .related-links{display:flex;flex-direction:column;gap:.375rem;}
    .related-links a{font-size:.875rem;color:var(--primary);text-decoration:none;display:flex;align-items:center;gap:.4rem;transition:gap .15s;}
    .related-links a:hover{gap:.7rem;}
    .related-links a::before{content:"→";font-size:.75rem;flex-shrink:0;}
    @media(max-width:768px){.related-grid{grid-template-columns:1fr;}}
    @media(max-width:768px){
      .hero h1{font-size:2.25rem;}
      .use-cases-grid{grid-template-columns:1fr;}
      .integrations-grid{grid-template-columns:repeat(2,1fr);}
      .stats-grid{grid-template-columns:repeat(2,1fr);}
      .footer-grid{grid-template-columns:1fr 1fr;}
      .nav-menu{display:none;}
    }
"""

# ── Claude prompt to generate page content
def build_prompt(keyword, slug):
    return f"""You are writing SEO content for a page on LinkFinder AI (linkfinderai.com) — a LinkedIn and company data enrichment API.

Generate content for the keyword: "{keyword}"
Page slug: /{slug}

Return ONLY a valid JSON object with exactly these fields. No markdown, no explanation, just raw JSON:

{{
  "title": "Page title tag (60 chars max, include keyword naturally)",
  "meta_description": "Meta description (155 chars max, include keyword, mention LinkFinder AI)",
  "meta_keywords": "5-8 comma-separated related keywords",
  "hero_tag": "Short tag line (3-5 words, e.g. 'LinkedIn Data API')",
  "hero_tag_icon": "One font-awesome icon class (e.g. fa-envelope, fa-building, fa-users, fa-code, fa-search)",
  "h1_part1": "First part of H1 before the blue highlighted word (2-4 words)",
  "h1_part2": "The highlighted blue word or phrase (1-3 words)",
  "hero_p": "Hero subtitle paragraph (2 sentences, explains what LinkFinder AI does for this keyword)",
  "proof_items": ["4 short trust signals, each under 5 words"],
  "stats": [
    {{"number": "stat value", "label": "stat label"}},
    {{"number": "stat value", "label": "stat label"}},
    {{"number": "stat value", "label": "stat label"}},
    {{"number": "stat value", "label": "stat label"}}
  ],
  "use_cases": [
    {{"icon": "emoji", "title": "use case title", "desc": "2 sentence description specific to this keyword"}},
    {{"icon": "emoji", "title": "use case title", "desc": "2 sentence description specific to this keyword"}},
    {{"icon": "emoji", "title": "use case title", "desc": "2 sentence description specific to this keyword"}},
    {{"icon": "emoji", "title": "use case title", "desc": "2 sentence description specific to this keyword"}},
    {{"icon": "emoji", "title": "use case title", "desc": "2 sentence description specific to this keyword"}},
    {{"icon": "emoji", "title": "use case title", "desc": "2 sentence description specific to this keyword"}}
  ],
  "faqs": [
    {{"q": "question", "a": "answer (2-3 sentences)"}},
    {{"q": "question", "a": "answer (2-3 sentences)"}},
    {{"q": "question", "a": "answer (2-3 sentences)"}},
    {{"q": "question", "a": "answer (2-3 sentences)"}},
    {{"q": "question", "a": "answer (2-3 sentences)"}}
  ],
  "curl_example": "Complete curl command for this use case using linkfinderai.com API",
  "python_example": "Complete Python requests code for this use case (8-12 lines)",
  "node_example": "Complete Node.js fetch code for this use case (8-12 lines)",
  "response_example": "Example JSON response (10-15 lines, realistic data)",
  "cta_headline": "CTA section headline (under 10 words)",
  "cta_sub": "CTA subtitle (one sentence)"
}}

Important rules:
- If the keyword is an "alternative" page (e.g. "proxycurl alternative"), position LinkFinder AI as a better/cheaper alternative. Be direct about what the competitor does and why LinkFinder AI is a good replacement.
- If keyword involves Python/n8n/Make/Zapier, include relevant integration context
- Keep all content factually accurate to what a LinkedIn/company data API would actually do
- Use real-sounding example data (real company names like Stripe, Notion, HubSpot in code examples)
- The API endpoint type should be one of: linkedin_profile_to_linkedin_info, email_to_linkedin_url, linkedin_company_to_linkedin_info, company_name_to_website, company_domain_to_employees, linkedin_profile_to_phone, linkedin_company_to_employee_count
"""

# ── HTML template assembler
def build_html(keyword, slug, content):
    c = content

    # Build use cases HTML
    use_cases_html = ""
    for uc in c["use_cases"]:
        use_cases_html += f"""
      <div class="use-case-card">
        <div class="use-case-icon">{uc['icon']}</div>
        <div class="use-case-title">{uc['title']}</div>
        <div class="use-case-desc">{uc['desc']}</div>
      </div>"""

    # Build stats HTML
    stats_html = ""
    for s in c["stats"]:
        stats_html += f"""
      <div><div class="stat-number">{s['number']}</div><div class="stat-label">{s['label']}</div></div>"""

    # Build social proof HTML
    proof_html = ""
    for p in c["proof_items"]:
        proof_html += f"""
      <div class="hero-social-proof-item"><i class="fas fa-check-circle"></i> {p}</div>"""

    # Build FAQ HTML
    faq_html = ""
    for faq in c["faqs"]:
        faq_html += f"""
      <div class="faq-item">
        <div class="faq-q" onclick="toggleFaq(this)">{faq['q']} <i class="fas fa-chevron-down"></i></div>
        <div class="faq-a">{faq['a']}</div>
      </div>"""

    canonical = f"https://linkfinderai.com/{slug}"

    return f"""<!doctype html>
<html lang="en">
<head>
  <script>(function(w,d,s,l,i){{w[l]=w[l]||[];w[l].push({{'gtm.start':new Date().getTime(),event:'gtm.js'}});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);}})(window,document,'script','dataLayer','GTM-TL7WVD2N');</script>
  <script>
    !function(t,e){{var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){{function g(t,e){{var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){{t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){{var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}},u.people.toString=function(){{return u.toString(1)+".people (stub)"}},o="init capture identify reset get_distinct_id getGroups get_session_id alias set_config startSessionRecording stopSessionRecording".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])}},e.__SV=1}}(document,window.posthog||[]);
    posthog.init('phc_HqgzMyWAMtzH7K5j9CLw0dijB0I9W1VjPkkyzg9KOFG',{{api_host:'https://us.i.posthog.com',defaults:'2025-11-30',person_profiles:'identified_only'}})
  </script>
  <meta charset="utf-8"/>
  <link rel="icon" href="https://i.ibb.co/jPjX9SSp/Screen-Shot-2025-03-28-at-8-16-15-PM.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{c['title']}</title>
  <meta name="description" content="{c['meta_description']}"/>
  <meta name="keywords" content="{c['meta_keywords']}"/>
  <link rel="canonical" href="{canonical}"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <style>{CSS}</style>
</head>
<body>

<header class="header">
  <div class="container">
    <div class="header-content">
      <a href="https://linkfinderai.com" class="logo">
        <div class="logo-icon"><i class="fas fa-search"></i></div>
        <span class="logo-text">LinkFinder AI</span>
      </a>
      <nav class="nav-menu">
        <a href="https://linkfinderai.com/#features">Features</a>
        <a href="https://linkfinderai.com/api-documentation">API Docs</a>
        <a href="https://linkfinderai.com/#pricing">Pricing</a>
        <a href="https://linkfinderai.com/#integrations">Integrations</a>
      </nav>
      <div class="auth-buttons">
        <a href="https://linkfinderai.com/sign-in" class="btn btn-outline">Sign in</a>
        <a href="https://linkfinderai.com/sign-up" class="btn">Get API Key</a>
      </div>
    </div>
  </div>
</header>

<div class="breadcrumb">
  <div class="container">
    <a href="https://linkfinderai.com">Home</a>
    <span>›</span>
    <a href="https://linkfinderai.com/api-documentation">API</a>
    <span>›</span>
    {keyword.title()}
  </div>
</div>

<section class="hero">
  <div class="container">
    <div class="hero-tag"><i class="fas {c['hero_tag_icon']}"></i> {c['hero_tag']}</div>
    <h1>{c['h1_part1']} <span>{c['h1_part2']}</span></h1>
    <p>{c['hero_p']}</p>
    <div class="hero-ctas">
      <a href="https://linkfinderai.com/sign-up" class="btn btn-large">Get API Key Free</a>
      <a href="https://linkfinderai.com/api-documentation" class="btn btn-outline btn-large">View API Docs</a>
    </div>
    <div class="hero-social-proof">{proof_html}
    </div>
  </div>
</section>

<div class="stats-bar">
  <div class="container">
    <div class="stats-grid">{stats_html}
    </div>
  </div>
</div>

<section class="section">
  <div class="container">
    <div class="section-title">Code examples</div>
    <div class="section-sub">Copy and paste — works in any language or automation platform.</div>
    <div class="demo-tabs">
      <button class="demo-tab active" onclick="showTab('curl', this)">cURL</button>
      <button class="demo-tab" onclick="showTab('python', this)">Python</button>
      <button class="demo-tab" onclick="showTab('node', this)">Node.js</button>
      <button class="demo-tab" onclick="showTab('response', this)">Response</button>
    </div>
    <div id="tab-curl" class="code-block"><pre>{c['curl_example']}</pre></div>
    <div id="tab-python" class="code-block" style="display:none;"><pre>{c['python_example']}</pre></div>
    <div id="tab-node" class="code-block" style="display:none;"><pre>{c['node_example']}</pre></div>
    <div id="tab-response" class="code-block" style="display:none;"><pre>{c['response_example']}</pre></div>
  </div>
</section>

<section class="section-alt">
  <div class="container">
    <div class="section-title">Use cases</div>
    <div class="section-sub">Who uses this and why.</div>
    <div class="use-cases-grid">{use_cases_html}
    </div>
  </div>
</section>



<section class="section">
  <div class="container">
    <div class="section-title">Integrate in minutes</div>
    <div class="section-sub">Works natively with the tools your team already uses.</div>
    <div class="integrations-grid">
      <div class="integration-card">
        <div class="integration-logo" style="background:#fdf2f5;color:#ea4b71;font-weight:900;font-size:.9rem;">n</div>
        <div class="integration-name">n8n</div>
        <div class="integration-desc">HTTP Request node — no plugin needed</div>
      </div>
      <div class="integration-card">
        <div class="integration-logo" style="background:#f5f0fd;color:#6d28d9;font-weight:900;">M</div>
        <div class="integration-name">Make</div>
        <div class="integration-desc">HTTP module in any scenario</div>
      </div>
      <div class="integration-card">
        <div class="integration-logo" style="background:#fff3ee;color:#ff4a00;font-weight:900;">Z</div>
        <div class="integration-name">Zapier</div>
        <div class="integration-desc">Webhooks by Zapier action</div>
      </div>
      <div class="integration-card">
        <div class="integration-logo" style="background:#eff6ff;color:#2563eb;font-size:.75rem;font-weight:700;">&lt;/&gt;</div>
        <div class="integration-name">REST API</div>
        <div class="integration-desc">Any language, any platform</div>
      </div>
    </div>
    <div style="margin-top:2rem;text-align:center;">
      <a href="https://linkfinderai.com/app-workflows" style="color:var(--primary);font-size:.875rem;font-weight:500;text-decoration:none;">View pre-built workflow templates →</a>
    </div>
  </div>
</section>

<section class="section-alt">
  <div class="container">
    <div class="section-title">Frequently asked questions</div>
    <div class="faq-list">{faq_html}
    </div>
  </div>
</section>


<section class="related-section">
  <div class="container">
    <div class="related-grid">
      <div>
        <h3>Related API Endpoints</h3>
        <div class="related-links">
          <a href="/linkedin-profile-scraper-api">LinkedIn Profile Scraper API</a>
          <a href="/linkedin-company-scraper-api">LinkedIn Company Scraper API</a>
          <a href="/linkedin-email-finder-api">LinkedIn Email Finder API</a>
          <a href="/linkedin-search-by-email-api">LinkedIn Search by Email API</a>
          <a href="/linkedin-phone-number-finder-api">LinkedIn Phone Number Finder API</a>
          <a href="/linkedin-company-employees-api">LinkedIn Company Employees API</a>
          <a href="/company-url-finder-api">Company URL Finder API</a>
          <a href="/company-details-finder-api">Company Data API</a>
          <a href="/company-employee-count-api">Company Employee Count API</a>
          <a href="/linkedin-url-finder-api">LinkedIn URL Finder API</a>
        </div>
      </div>
      <div>
        <h3>Free Tools</h3>
        <div class="related-links">
          <a href="https://linkfinderai.com/linkedin-profile-scraper">LinkedIn Profile Scraper</a>
          <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn Email Finder</a>
          <a href="https://linkfinderai.com/company-url-finder">Company URL Finder</a>
          <a href="https://linkfinderai.com/linkedin-url-finder">LinkedIn URL Finder</a>
          <a href="https://linkfinderai.com/company-phone-finder">Company Phone Finder</a>
          <a href="https://linkfinderai.com/linkedin-phone-number-finder">Find Phone from LinkedIn</a>
          <a href="https://linkfinderai.com/company-employee-finder">Company Employee Finder</a>
          <a href="https://linkfinderai.com/linkedin-company-scraper">LinkedIn Company Scraper</a>
          <a href="https://linkfinderai.com/linkedin-search-by-email">LinkedIn Search by Email</a>
          <a href="https://linkfinderai.com/company-details-finder">Company Details Finder</a>
          <a href="https://linkfinderai.com/find-company-employee-count">Company Employee Count</a>
          <a href="https://linkfinderai.com/instagram-profile-scraper">Instagram Profile Scraper</a>
          <a href="https://linkfinderai.com/scrape-linkedIn-jobs">Scrape LinkedIn Jobs</a>
          <a href="https://linkfinderai.com/linkedin-post-commenters-export">LinkedIn Post Commenters Export</a>
          <a href="https://linkfinderai.com/email-extractor-from-website">Email Extractor</a>
          <a href="https://linkfinderai.com/company-tech-stack-finder">Company Tech Stack Finder</a>
          <a href="https://linkfinderai.com/free-linkedin-sales-navigator-scraper">Free Sales Navigator Scraper</a>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="cta-section">
  <div class="container">
    <h2>{c['cta_headline']}</h2>
    <p>{c['cta_sub']}</p>
    <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
      <a href="https://linkfinderai.com/sign-up" class="btn btn-large" style="background:white;color:var(--primary);">Get API Key Free</a>
      <a href="https://linkfinderai.com/api-documentation" class="btn btn-large" style="background:transparent;border:2px solid rgba(255,255,255,.4);color:white;">View API Docs</a>
    </div>
  </div>
</section>

<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a href="https://linkfinderai.com" class="logo" style="color:white;">
          <div class="logo-icon"><i class="fas fa-search"></i></div>
          <span class="logo-text">LinkFinder AI</span>
        </a>
        <p>LinkedIn data enrichment API for sales teams, recruiters and growth engineers. Find emails, scrape profiles, and enrich your pipeline at scale.</p>
      </div>
      <div class="footer-col">
        <h4>API Endpoints</h4>
        <a href="/linkedin-profile-scraper-api">Profile Scraper</a>
        <a href="/linkedin-company-scraper-api">Company Scraper</a>
        <a href="/linkedin-email-finder-api">Email Finder</a>
        <a href="/linkedin-company-employees-api">Company Employees</a>
        <a href="/company-url-finder-api">Company URL Finder</a>
      </div>
      <div class="footer-col">
        <h4>Product</h4>
        <a href="https://linkfinderai.com/#features">Features</a>
        <a href="https://linkfinderai.com/#pricing">Pricing</a>
        <a href="https://linkfinderai.com/api-documentation">API Docs</a>
        <a href="https://linkfinderai.com/app-workflows">Workflows</a>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <a href="https://linkfinderai.com/sign-up">Sign Up</a>
        <a href="https://linkfinderai.com/sign-in">Sign In</a>
        <a href="mailto:support@linkfinderai.com">Support</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2025 LinkFinder AI. All rights reserved.</span>
      <span>{keyword.title()}</span>
    </div>
  </div>
</footer>

<script>
function showTab(tab, btn) {{
  document.querySelectorAll('.demo-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(b => b.style.display = 'none');
  btn.classList.add('active');
  document.getElementById('tab-' + tab).style.display = 'block';
}}
function toggleFaq(el) {{
  const answer = el.nextElementSibling;
  const icon = el.querySelector('i');
  const isOpen = answer.classList.contains('open');
  document.querySelectorAll('.faq-a').forEach(a => a.classList.remove('open'));
  document.querySelectorAll('.faq-q i').forEach(i => i.style.transform = '');
  if (!isOpen) {{
    answer.classList.add('open');
    icon.style.transform = 'rotate(180deg)';
  }}
}}
</script>
</body>
</html>"""

# ── Main generator
def generate_pages():
    out_dir = "pseo-pages"
    os.makedirs(out_dir, exist_ok=True)

    print(f"Generating {len(KEYWORDS)} pages into ./{out_dir}/\n")

    success, failed = 0, []

    for i, keyword in enumerate(KEYWORDS, 1):
        slug = to_slug(keyword)
        filename = f"{out_dir}/{slug}.html"

        print(f"[{i}/{len(KEYWORDS)}] {keyword} → {slug}.html", end=" ... ", flush=True)

        # Skip if already generated
        if os.path.exists(filename):
            print("SKIPPED (already exists)")
            success += 1
            continue

        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://linkfinderai.com",
                    "X-Title": "LinkFinder AI pSEO Generator",
                },
                json={
                    "model": "anthropic/claude-sonnet-4",
                    "max_tokens": 2000,
                    "messages": [{"role": "user", "content": build_prompt(keyword, slug)}]
                },
                timeout=60
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()

            # Strip markdown code fences if present
            raw = re.sub(r'^```json\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)

            page_content = json.loads(raw)
            html = build_html(keyword, slug, page_content)

            with open(filename, "w", encoding="utf-8") as f:
                f.write(html)

            print(f"DONE ({len(html)//1024}KB)")
            success += 1

        except json.JSONDecodeError as e:
            print(f"FAILED (JSON parse error: {e})")
            failed.append(keyword)
        except Exception as e:
            print(f"FAILED ({e})")
            failed.append(keyword)

        # Rate limit buffer between calls
        if i < len(KEYWORDS):
            time.sleep(1)

    print(f"\n{'='*50}")
    print(f"Done: {success}/{len(KEYWORDS)} pages generated")
    print(f"Output: ./{out_dir}/")

    if failed:
        print(f"\nFailed ({len(failed)}):")
        for kw in failed:
            print(f"  - {kw}")
        print("\nRe-run the script to retry failed pages (already-done pages are skipped).")

    # Write a simple index of all pages
    index_path = f"{out_dir}/index.txt"
    with open(index_path, "w") as f:
        for kw in KEYWORDS:
            slug = to_slug(kw)
            f.write(f"/{slug}  →  {kw}\n")
    print(f"\nPage index written to {index_path}")

if __name__ == "__main__":
    generate_pages()
