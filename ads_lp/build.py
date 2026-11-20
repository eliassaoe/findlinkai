"""Landing pages for paid ads (Microsoft Ads first). Owner's call, 20 Nov 2026:
send ad clicks to a page made to convert, not to the SEO tool page, and leave
the SEO page untouched.

Each LP is generated from its SEO tool page so the working lookup widget and its
scripts (free search, gate, signup modals, CSV upload) stay identical. What
changes:
  - noindex + canonical to the SEO page, no JSON-LD, no hreflang: it never
    competes with the SEO page;
  - a hero and copy written for the ad keyword;
  - only claims we can back (first search free, no card, CSV, API, real plan
    prices from app.html). The SEO pages carry a testimonial and accuracy /
    volume numbers we cannot prove; ad networks reject "misleading" pages, so
    none of that is copied here;
  - no navigation out to other tools: try it, or sign up with Google.

Run:  python3 ads_lp/build.py      (writes lp/<slug>.html)
Never hand-edit lp/*.html; edit this file and re-run.
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "lp"

PLANS = "Starter $49/month for 5,000 credits · Professional $99 for 20,000 · Scale $249 for 70,000 · annual plans 40% off · or a one-off pack from $25 for 1,000 credits"

PAGES = [
    {
        "slug": "linkedin-search-by-email",
        "source": "linkedin-search-by-email.html",
        "canonical": "https://linkfinderai.com/linkedin-search-by-email",
        "title": "Find a LinkedIn Profile From an Email | LinkFinder AI",
        "description": "Paste a work email, get the matching LinkedIn profile URL. First search free, no credit card. Upload a CSV for a whole list.",
        "h1": "Find the LinkedIn profile behind any email",
        "sub": "Paste a work email and get the matching LinkedIn profile URL. Try one search free below, then run your whole list from a CSV.",
        "list_title": "Got a list of emails?",
        "list_body": "Upload a CSV and get a LinkedIn profile URL back for every row you can match. A free account comes with credits to start. No credit card.",
        "steps": [
            ("Paste or upload", "One work email, or a CSV with an email column."),
            ("We match it", "LinkFinder AI looks up the public LinkedIn profile that goes with the address."),
            ("Use the result", "Copy the profile URL, or download your CSV with a LinkedIn column added."),
        ],
        "cost": "Each email-to-LinkedIn lookup costs 5 credits, so Starter covers up to 1,000 lookups a month.",
        "faq": [
            ("Is the first search really free?", "Yes. Your first search needs no account. A free account then gives you credits to keep going, and no credit card is asked."),
            ("Can I look up a whole list at once?", "Yes. Sign up, upload a CSV with an email column, and download it back with the LinkedIn profile URL for each row we could match."),
            ("What does it cost?", "Each email-to-LinkedIn lookup costs 5 credits. " + PLANS + "."),
            ("Is there an API?", "Yes. Paid plans include API access, so you can run the same lookup from your CRM or your own code."),
            ("Can I cancel anytime?", "Yes. You can cancel a subscription at any time with no cancellation fee; access runs to the end of the billing period."),
            ("Which data do you return?", "Only the public LinkedIn profile that matches the address. Use it for business outreach and follow the privacy rules that apply to you."),
        ],
    },
    {
        "slug": "linkedin-url-finder",
        "source": "linkedin-url-finder.html",
        "canonical": "https://linkfinderai.com/linkedin-url-finder",
        "title": "Find a LinkedIn Profile URL From a Name and Company | LinkFinder AI",
        "description": "Enter a name and a company, get the LinkedIn profile URL. First search free, no credit card. Upload a CSV to run a whole list.",
        "h1": "Find anyone's LinkedIn profile URL from a name and company",
        "sub": "Type a full name and the company they work at, get their LinkedIn profile URL. Try one search free below, then run your whole list from a CSV.",
        "list_title": "Got a list of names?",
        "list_body": "Upload a CSV with names and companies and get a LinkedIn profile URL back for every row you can match. A free account comes with credits to start. No credit card.",
        "steps": [
            ("Enter a name and company", "One person, or a CSV with name and company columns."),
            ("We find the profile", "LinkFinder AI searches for the public LinkedIn profile that matches."),
            ("Use the result", "Copy the URL, or download your CSV with a LinkedIn column added. Then find their work email if you need it."),
        ],
        "cost": "Each name-to-LinkedIn lookup costs 1 credit, so Starter covers up to 5,000 lookups a month.",
        "faq": [
            ("Is the first search really free?", "Yes. Your first search needs no account. A free account then gives you credits to keep going, and no credit card is asked."),
            ("Can I run a whole list?", "Yes. Sign up, upload a CSV with name and company columns, and download it back with the LinkedIn profile URL for each row we could match."),
            ("What does it cost?", "Each name-to-LinkedIn lookup costs 1 credit. " + PLANS + "."),
            ("Can I get their email too?", "Yes. Once you have the profile URL, the LinkedIn email finder returns the work email when one can be found (10 credits)."),
            ("Is there an API?", "Yes. Paid plans include API access, so you can run the same lookup from your CRM or your own code."),
            ("Can I cancel anytime?", "Yes. You can cancel a subscription at any time with no cancellation fee; access runs to the end of the billing period."),
        ],
    },
    {
        "slug": "linkedin-email-finder",
        "source": "linkedin-email-finder.html",
        "canonical": "https://linkfinderai.com/linkedin-email-finder",
        "title": "Find a Work Email From a LinkedIn Profile | LinkFinder AI",
        "description": "Paste a LinkedIn profile URL, get the person's work email. First search free, no credit card. Upload a CSV to run a whole list.",
        "h1": "Get the work email behind any LinkedIn profile",
        "sub": "Paste a LinkedIn profile URL and get the person's work email when one can be found. Try one search free below, then run your whole list from a CSV.",
        "list_title": "Got a list of LinkedIn profiles?",
        "list_body": "Upload a CSV of LinkedIn profile URLs and get a work email back for every row we can find. A free account comes with credits to start. No credit card.",
        "steps": [
            ("Paste or upload", "One LinkedIn profile URL, or a CSV with a column of them."),
            ("We look up the email", "LinkFinder AI checks its sources for the person's work email."),
            ("Use the result", "Copy the email, or download your CSV with an email column added."),
        ],
        "cost": "Each LinkedIn-to-email lookup costs 10 credits, so Starter covers up to 500 lookups a month.",
        "faq": [
            ("Is the first search really free?", "Yes. Your first search needs no account. A free account then gives you credits to keep going, and no credit card is asked."),
            ("Will every profile return an email?", "No. Some people have no findable work email. You see the result for each profile, and you can run a list to see your own hit rate before paying anything."),
            ("Can I run a whole list?", "Yes. Sign up, upload a CSV of LinkedIn profile URLs, and download it back with the work email for each row we could find."),
            ("What does it cost?", "Each LinkedIn-to-email lookup costs 10 credits. " + PLANS + "."),
            ("Is there an API?", "Yes. Paid plans include API access, so you can run the same lookup from your CRM or your own code."),
            ("Can I cancel anytime?", "Yes. You can cancel a subscription at any time with no cancellation fee; access runs to the end of the billing period."),
        ],
    },
]

LP_CSS = """
<style>
.lp-hero{text-align:center;max-width:820px;margin:2.5rem auto 1.25rem;padding:0 1rem;}
.lp-hero h1{font-size:2.5rem;line-height:1.15;font-weight:700;color:#111827;margin-bottom:.9rem;letter-spacing:-.02em;}
.lp-hero p{font-size:1.125rem;color:#4b5563;max-width:640px;margin:0 auto 1.1rem;}
.lp-trust{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 1.25rem;font-size:.9rem;color:#374151;margin-bottom:1rem;}
.lp-trust i{color:#16a34a;margin-right:.3rem;}
.lp-block{max-width:820px;margin:2.5rem auto;padding:0 1rem;}
.lp-list{background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:1.75rem;text-align:center;}
.lp-list h2,.lp-block>h2{font-size:1.6rem;font-weight:700;color:#111827;margin-bottom:.6rem;text-align:center;}
.lp-list p{color:#374151;max-width:560px;margin:0 auto 1.1rem;}
.lp-google{display:inline-flex;align-items:center;gap:.6rem;background:#111827;color:#fff;font-weight:600;padding:.85rem 1.4rem;border-radius:10px;text-decoration:none;font-size:1rem;}
.lp-google:hover{background:#1f2937;}
.lp-alt{display:block;margin-top:.7rem;font-size:.875rem;color:#4b5563;}
.lp-alt a{color:#2563eb;}
.lp-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:1.25rem;}
.lp-step{border:1px solid #e5e7eb;border-radius:12px;padding:1.25rem;background:#fff;}
.lp-step b{display:flex;align-items:center;gap:.5rem;color:#111827;margin-bottom:.35rem;}
.lp-step b span{display:inline-flex;width:1.6rem;height:1.6rem;border-radius:50%;background:#2563eb;color:#fff;font-size:.85rem;align-items:center;justify-content:center;}
.lp-step p{color:#4b5563;font-size:.925rem;}
.lp-price{border:1px solid #e5e7eb;border-radius:12px;padding:1.25rem 1.5rem;background:#f9fafb;color:#374151;text-align:center;}
.lp-price strong{color:#111827;}
.lp-final{text-align:center;background:#111827;color:#fff;border-radius:16px;padding:2.25rem 1.25rem;}
.lp-final h2{color:#fff !important;}
.lp-final p{color:#d1d5db;margin-bottom:1.1rem;}
.lp-final .lp-google{background:#2563eb;}
.lp-final .lp-alt,.lp-final .lp-alt a{color:#bfdbfe;}
.lp-foot{text-align:center;font-size:.8rem;color:#6b7280;padding:2rem 1rem 3rem;}
.lp-foot a{color:#6b7280;margin:0 .4rem;}
@media (max-width:720px){.lp-hero h1{font-size:1.85rem;}.lp-steps{grid-template-columns:1fr;}}
</style>
"""

GOOGLE_SVG = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'


def signup_buttons(slug, where):
    src = f"lp_{slug}_{where}"
    return (
        f'<a class="lp-google" href="https://linkfinderai.com/sign-up?google=1&amp;source={src}" '
        f"onclick=\"try{{posthog.capture('lp_signup_clicked',{{lp:'{slug}',where:'{where}',method:'google'}})}}catch(e){{}}\">"
        f"{GOOGLE_SVG} Continue with Google — free</a>"
        f'<span class="lp-alt">or <a href="https://linkfinderai.com/sign-up?source={src}" '
        f"onclick=\"try{{posthog.capture('lp_signup_clicked',{{lp:'{slug}',where:'{where}',method:'email'}})}}catch(e){{}}\">sign up with email</a> · no credit card</span>"
    )


def cut(text, start, end, keep_end=False):
    i = text.index(start)
    j = text.index(end, i)
    return text[:i] + (text[j:] if keep_end else text[j + len(end):])


def build(cfg):
    src = (ROOT / cfg["source"]).read_text(encoding="utf-8")
    e = html.escape

    head, body = src.split("</head>", 1)
    head = re.sub(r'<script type="application/ld\+json">.*?</script>\s*', "", head, flags=re.S)
    head = re.sub(r'\s*<link rel="(canonical|alternate)"[^>]*>', "", head)
    head = re.sub(r'\s*<meta (property|name)="(og:[^"]*|twitter:[^"]*|robots)"[^>]*>', "", head)
    head = re.sub(r"<title>.*?</title>", f"<title>{e(cfg['title'])}</title>", head, flags=re.S)
    head = re.sub(r'<meta name="description"[^>]*>', f'<meta name="description" content="{e(cfg["description"])}"/>', head)
    # robots + canonical first: gen_sitemap.py only reads the first 20,000 characters.
    head = head.replace("<head>", f'<head>\n<meta name="robots" content="noindex, follow"/>\n'
                        f'<link rel="canonical" href="{cfg["canonical"]}"/>', 1)
    head += LP_CSS

    # Google Sheets top bar: an exit, not a conversion.
    if "<!-- LF-SHEETS-TOPBAR:START -->" in body:
        body = cut(body, "<!-- LF-SHEETS-TOPBAR:START -->", "<!-- LF-SHEETS-TOPBAR:END -->")

    header_end = body.index("</header>") + len("</header>")
    top = body[:header_end]
    rest = body[header_end:]

    # Keep the free-search counter element exactly (the widget script writes to it).
    m_counter = re.search(r'<span class="credits-counter" id="\w+">.*?free search remaining\s*</span>', rest, re.S)
    counter = m_counter.group(0) if m_counter else ""

    # The widget: from the main card to the Sheets banner (which we drop).
    card_start = rest.index('<div class="main-card">')
    card_end = rest.index("<!-- LF-SHEETS-BANNER:START -->")
    widget = rest[card_start:card_end]
    # Unprovable accuracy claim under the search button of some widgets.
    widget = re.sub(r"\s*&nbsp;·&nbsp;\s*✓\s*\d+% accuracy", "", widget)
    sticky = ""
    m = re.search(r'<div class="sticky-cta".*?</div>\s*</div>', rest[:card_start], re.S)
    if m:
        sticky = m.group(0)

    after_banner = rest.index("<!-- LF-SHEETS-BANNER:END -->") + len("<!-- LF-SHEETS-BANNER:END -->")
    # Modals, gate and the widget's scripts live after the footer.
    tail = rest[rest.index("</footer>") + len("</footer>"):]

    trust = "".join(
        f'<span><i class="fas fa-check-circle"></i>{t}</span>'
        for t in ("First search free", "No credit card required", "Results in seconds", "Bulk CSV &amp; API")
    )
    steps = "".join(
        f'<div class="lp-step"><b><span>{n}</span>{e(t)}</b><p>{e(d)}</p></div>'
        for n, (t, d) in enumerate(cfg["steps"], 1)
    )
    faq = "".join(
        f'<div class="faq-item"><button class="faq-question" onclick="toggleFAQ(this)">{e(q)}<i class="fas fa-chevron-down icon"></i></button>'
        f'<div class="faq-answer">{e(a)}</div></div>'
        for q, a in cfg["faq"]
    )
    slug = cfg["slug"]

    page = f"""{head}</head>{top}
{sticky}
<div class="container">
  <div class="lp-hero">
    <h1>{e(cfg['h1'])}</h1>
    <p>{e(cfg['sub'])}</p>
    <div class="lp-trust">{trust}</div>
    <div style="text-align:center;margin-bottom:1rem;">{counter}</div>
  </div>
  {widget}
</div>

<section class="lp-block"><div class="lp-list">
  <h2>{e(cfg['list_title'])}</h2>
  <p>{e(cfg['list_body'])}</p>
  {signup_buttons(slug, 'list')}
</div></section>

<section class="lp-block">
  <h2>How it works</h2>
  <div class="lp-steps">{steps}</div>
</section>

<section class="lp-block">
  <div class="lp-price"><strong>{e(cfg['cost'])}</strong><br>{e(PLANS)}. Cancel anytime.</div>
</section>

<div class="faq-section"><div class="container">
  <div class="faq-header"><h2>Questions</h2></div>
  <div class="faq-list">{faq}</div>
</div></div>

<section class="lp-block"><div class="lp-final">
  <h2>Start with a free account</h2>
  <p>Credits to start, bulk CSV upload and the API on paid plans. No credit card.</p>
  {signup_buttons(slug, 'final')}
</div></section>

<footer class="lp-foot">LinkFinder AI ·
  <a href="https://linkfinderai.com/pricing">Pricing</a>
  <a href="https://linkfinderai.com/privacy-policy">Privacy</a>
  <a href="https://linkfinderai.com/terms-of-service">Terms</a>
</footer>
{tail}"""
    doctype, _, after = page.partition("\n")
    page = doctype + "\n<!-- Generated by ads_lp/build.py. Do not edit by hand. -->\n" + after
    OUT.mkdir(exist_ok=True)
    (OUT / f"{slug}.html").write_text(page, encoding="utf-8")
    return OUT / f"{slug}.html"


if __name__ == "__main__":
    for cfg in PAGES:
        print("wrote", build(cfg).relative_to(ROOT))
