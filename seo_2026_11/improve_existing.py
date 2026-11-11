#!/usr/bin/env python3
"""
seo_2026_11/improve_existing.py - content blocks added to existing pages.

Two jobs, one block per page:
  1. Pages that rank on page 2-6 for a query in the Nov 2026 plan get a short
     section that answers that query directly (see docs/seo-plan-2026-11.md).
  2. Every page built by seo_2026_11/build.py gets links from the money pages
     closest to it, so no new page is an orphan.

Each block is self-styled (it lands on pages with different stylesheets) and
sits between <!-- LF-SEO-2026-11:START --> and <!-- LF-SEO-2026-11:END -->, so
re-running replaces it in place. It is inserted just before the topical
cluster links (or before the footer when a page has none).

Not touched on purpose: the pages softened by soften_tool_pages.py
(/linkedin-scraping-api, /linkedin-profile-data-extraction,
/linkedin-company-scraper, /linkedIn-post-scraper). Their wording was taken off
"scraper" deliberately; adding it back is the owner's call.
No <title>, meta description or H1 is changed by this script
(docs/gsc-seo-2026-10.md: titles are decided page by page).

Usage: python3 seo_2026_11/improve_existing.py [--check]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = "https://linkfinderai.com"
START, END = "<!-- LF-SEO-2026-11:START -->", "<!-- LF-SEO-2026-11:END -->"
CHECK = "--check" in sys.argv

STYLE = ('<style>.lf-seo26{background:#fff;border-top:1px solid #e5e7eb;padding:2.25rem 0}'
         '.lf-seo26 .lf-inner{max-width:780px;margin:0 auto;padding:0 1.5rem;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
         '.lf-seo26 h2{font-size:1.25rem;font-weight:700;color:#111827;margin:0 0 .75rem;letter-spacing:-.01em}'
         '.lf-seo26 h3{font-size:1.02rem;font-weight:600;color:#111827;margin:1.1rem 0 .4rem}'
         '.lf-seo26 p,.lf-seo26 li{color:#374151;line-height:1.65;font-size:.9688rem}'
         '.lf-seo26 p{margin:0 0 .85rem}.lf-seo26 ol,.lf-seo26 ul{margin:0 0 .85rem 1.25rem}'
         '.lf-seo26 li{margin-bottom:.35rem}.lf-seo26 a{color:#2563eb}'
         '.lf-seo26 .lf-links{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem}'
         '.lf-seo26 .lf-links a{border:1px solid #e5e7eb;border-radius:999px;padding:.35rem .8rem;text-decoration:none;font-size:.9rem;color:#111827}'
         '.lf-seo26 .lf-links a:hover{border-color:#2563eb}</style>')


def links(*pairs):
    return '<div class="lf-links">' + "".join(f'<a href="{S}/{s}">{l}</a>' for s, l in pairs) + "</div>"


BLOCKS = {
    "resources/find-linkedin-email.html": """
<h2>How to find someone's email on LinkedIn</h2>
<p>LinkedIn shows an email only in a member's <em>Contact info</em>, only if they added one, and only to their connections. So for most people you will not find it on LinkedIn itself. You find their work email elsewhere and match it to the profile:</p>
<ol>
<li>Open their profile and click <em>Contact info</em>. If you are connected and they listed an email, it is there.</li>
<li>If not, copy the profile URL and paste it into the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>. It returns their verified work email for 10 credits, and finds one for about 9 profiles in 10 for paying users.</li>
<li>For many profiles at once, upload them as a CSV to the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk email finder</a>.</li>
</ol>
""" + links(("how-to-find-someones-email", "7 ways to find someone's email"), ("scrape-emails-from-linkedin", "Scraping emails from LinkedIn"), ("find-email-by-name", "Find an email by name")),

    "resources/find-ceo-email.html": """
<h2>Finding a founder's or owner's email</h2>
<p>At startups and small companies, the person you want is often the founder or the owner rather than a CEO with an assistant. The same method works: list the company's people from its domain, keep titles such as Founder, Co-founder, Owner or Managing Director, and get the verified email from their LinkedIn profile (10 credits). Founders frequently use one address for everything, so the email you get is often the one they read.</p>
<p>When the owner is not on LinkedIn, the company's public registry lists directors by name, and the company's own contact address is available from its name for 5 credits.</p>
""" + links(("find-business-owner-email", "Find a business owner's email"), ("company-email-finder", "Company email finder"), ("find-business-email", "Find a business email")),

    "linkedin-email-finder.html": """
<h2>Other ways to find a work email</h2>
<p>No profile URL yet? Start from a <a href="https://linkfinderai.com/find-email-by-name">name and a company</a>, or from <a href="https://linkfinderai.com/company-email-finder">the company alone</a>. Here is how every route compares, with real find rates: <a href="https://linkfinderai.com/email-finder">email finder routes</a>. And if you came here to scrape emails off LinkedIn pages, read <a href="https://linkfinderai.com/scrape-emails-from-linkedin">why that finds so few</a> first.</p>
""" + links(("how-to-find-someones-email", "How to find someone's email"), ("find-business-email", "Find a business email"), ("export-sales-navigator-leads", "Export Sales Navigator leads")),

    "hunter-io-alternative.html": """
<h2>Hunter email finder vs a LinkedIn-based email finder</h2>
<p>Hunter's email finder works from a name and a company domain: it predicts the address from the company's pattern and scores its confidence. That is a good fit when you only know a name and a website.</p>
<p>When you can get the person's LinkedIn profile, it is the stronger input, because a profile URL identifies exactly one person. LinkFinder AI's <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> returns a verified address from the profile for about 9 in 10 lookups by paying users. With only a name and company, it first finds the profile (1 credit), then the email (10 credits). The full comparison is in <a href="https://linkfinderai.com/email-finder">email finder routes</a>.</p>
""" + links(("find-email-by-name", "Find an email by name"), ("find-business-email", "Find a business email"), ("how-to-find-someones-email", "7 ways to find an email")),

    "lusha-alternative.html": """
<h2>Lusha competitors by what you need</h2>
<ul>
<li><strong>Emails and phones for people you found on LinkedIn:</strong> a LinkedIn-based finder such as <a href="https://linkfinderai.com/linkedin-email-finder">LinkFinder AI's email finder</a> (10 credits per email) and <a href="https://linkfinderai.com/linkedin-phone-number-finder">phone finder</a> (50 credits per phone).</li>
<li><strong>A list built from criteria:</strong> a lead search tool. LinkFinder AI's <a href="https://linkfinderai.com/linkedin-lead-extractor">LinkedIn lead extractor</a> returns profiles with work emails, without your LinkedIn account.</li>
<li><strong>Enrichment from your own code or CRM:</strong> an <a href="https://linkfinderai.com/data-enrichment-api">enrichment API</a> with HubSpot sync.</li>
</ul>
""" + links(("b2b-lead-lists", "B2B lead lists"), ("lead-prospecting-tools", "Lead prospecting tools"), ("export-sales-navigator-leads", "Export Sales Navigator leads")),

    "instagram-email-finder.html": """
<h2>Where Instagram accounts show an email</h2>
<p>Business and creator accounts can add an Email button under their bio, on the mobile app. Personal accounts cannot, and Instagram does not let anyone look up a member's email. For brands, the company behind the account is often easier to reach directly: the <a href="https://linkfinderai.com/company-email-finder">company email finder</a> returns its contact address from the company name, and <a href="https://linkfinderai.com/find-business-email">finding a business email</a> gets you a named person there.</p>
""" + links(("instagram-profile-url-finder", "Instagram profile finder"), ("instagram-follower-scraper", "Instagram follower exports"), ("youtube-email-finder", "YouTube email finder")),

    "email-to-phone-number-finder.html": """
<h2>No number found? Go through LinkedIn</h2>
<p>In the LinkFinder AI app, the most reliable route from an email to a phone number goes through the person's LinkedIn profile: the work email finds the profile (5 credits, see <a href="https://linkfinderai.com/reverse-email-lookup">reverse email lookup</a>), then the profile returns a direct dial when one exists (50 credits). Phone coverage is lower than email coverage, so expect some rows to stay empty.</p>
""" + links(("linkedin-phone-number-finder", "LinkedIn phone number finder"), ("reverse-email-lookup", "Reverse email lookup"), ("linkedin-search-by-email", "Email to LinkedIn")),

    "linkedin-search-by-email.html": """
<h2>More on looking people up by email</h2>
<p>The <a href="https://linkfinderai.com/reverse-email-lookup">reverse email lookup guide</a> covers what you can learn from a work address and what you cannot. Going the other way, from a person to their email, start at the <a href="https://linkfinderai.com/email-finder">email finder</a>.</p>
""" + links(("reverse-email-lookup", "Reverse email lookup"), ("email-to-phone-number-finder", "Email to phone number"), ("how-to-find-someones-email", "How to find someone's email")),

    "linkedin-url-finder.html": """
<h2>Found the profile? Get the email next</h2>
<p>A LinkedIn profile is the best input there is for an email lookup. From a name and a company, this finder gets the profile for 1 credit; the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a> then returns the verified work email for 10. The whole route is explained in <a href="https://linkfinderai.com/find-email-by-name">find an email by name</a>.</p>
""" + links(("find-email-by-name", "Find an email by name"), ("find-business-email", "Find a business email"), ("twitter-email-finder", "From an X profile to an email")),

    "company-employee-finder.html": """
<h2>Reach the decision maker at each company</h2>
<p>Filter the employee list on Owner, Founder or CEO to find who runs a company, then get their email: <a href="https://linkfinderai.com/find-business-owner-email">finding a business owner's email</a> shows the steps. For the company's general address instead, use the <a href="https://linkfinderai.com/company-email-finder">company email finder</a>. Doing this across many companies is how you build a <a href="https://linkfinderai.com/business-contact-list">business contact list</a>.</p>
""" + links(("find-business-owner-email", "Business owner's email"), ("company-email-finder", "Company email finder"), ("b2b-lead-lists", "B2B lead lists")),

    "linkedin-post-likers-export.html": """
<h2>Turn engagement into a lead list</h2>
<p>The people who react to posts about your topic are your warmest prospects. Export them here, add their work emails with the <a href="https://linkfinderai.com/bulk-linkedin-email-finder">bulk email finder</a>, and follow up. <a href="https://linkfinderai.com/how-to-generate-leads-on-linkedin">How to generate leads on LinkedIn</a> covers the full playbook, and the free <a href="https://linkfinderai.com/linkedin-post-formatter">LinkedIn post formatter</a> helps your own posts earn those reactions.</p>
""" + links(("scrape-linkedin-followers", "Exporting LinkedIn followers"), ("linkedin-post-formatter", "LinkedIn post formatter"), ("how-to-generate-leads-on-linkedin", "Generate leads on LinkedIn")),

    "enrich-sales-navigator-export.html": """
<h2>Getting the list out of Sales Navigator</h2>
<p>Sales Navigator has no export button. <a href="https://linkfinderai.com/export-sales-navigator-leads">How to export Sales Navigator leads</a> compares the options, and <a href="https://linkfinderai.com/sales-navigator-scraper">Sales Navigator scrapers</a> explains the account risk of cookie-based tools. If you are weighing whether a seat is worth it at all, see <a href="https://linkfinderai.com/linkedin-sales-navigator-cost">what Sales Navigator costs</a>.</p>
""" + links(("export-sales-navigator-leads", "Export Sales Navigator leads"), ("linkedin-sales-navigator-api", "Sales Navigator API"), ("linkedin-lead-extractor", "LinkedIn lead extractor")),

    "for-sales-teams.html": """
<h2>Guides for building your pipeline</h2>
<p>Where leads come from and how to turn them into a list you can contact: <a href="https://linkfinderai.com/lead-sourcing">lead sourcing</a>, <a href="https://linkfinderai.com/b2b-lead-lists">B2B lead lists</a> and the <a href="https://linkfinderai.com/lead-prospecting-tools">types of prospecting tools</a>.</p>
""" + links(("linkedin-lead-extractor", "LinkedIn lead extractor"), ("business-contact-list", "Business contact lists"), ("export-sales-navigator-leads", "Export Sales Navigator leads")),

    "resources/index.html": """
<h2>Guides: finding emails and building lead lists</h2>
<h3>Find an email</h3>
""" + links(("email-finder", "Email finder"), ("how-to-find-someones-email", "How to find someone's email"), ("find-email-by-name", "Find an email by name"),
            ("find-business-email", "Find a business email"), ("company-email-finder", "Company email finder"), ("find-business-owner-email", "Business owner's email"),
            ("reverse-email-lookup", "Reverse email lookup"), ("scrape-emails-from-linkedin", "Scrape emails from LinkedIn"), ("linkedin-email-address-format", "LinkedIn email format")) + """
<h3>Sales Navigator</h3>
""" + links(("export-sales-navigator-leads", "Export Sales Navigator leads"), ("sales-navigator-scraper", "Sales Navigator scrapers"),
            ("linkedin-sales-navigator-api", "Sales Navigator API"), ("linkedin-sales-navigator-cost", "Sales Navigator cost")) + """
<h3>Lead lists and prospecting</h3>
""" + links(("linkedin-lead-extractor", "LinkedIn lead extractor"), ("export-linkedin-search-results", "Export LinkedIn search results"), ("b2b-lead-lists", "B2B lead lists"),
            ("business-contact-list", "Business contact lists"), ("lead-sourcing", "Lead sourcing"), ("lead-prospecting-tools", "Lead prospecting tools"),
            ("how-to-generate-leads-on-linkedin", "Generate leads on LinkedIn"), ("scrape-linkedin-followers", "Export LinkedIn followers")) + """
<h3>Social networks and free tools</h3>
""" + links(("linkedin-post-formatter", "LinkedIn post formatter"), ("instagram-follower-scraper", "Instagram follower exports"), ("youtube-email-finder", "YouTube email finder"),
            ("facebook-email-finder", "Facebook email finder"), ("twitter-email-finder", "Twitter (X) email finder")),

    "best-social-media-finder.html": """
<h2>Finding the email behind a social profile</h2>
<p>Social networks rarely show email addresses. Network by network: <a href="https://linkfinderai.com/youtube-email-finder">YouTube</a>, <a href="https://linkfinderai.com/facebook-email-finder">Facebook</a>, <a href="https://linkfinderai.com/twitter-email-finder">X (Twitter)</a> and <a href="https://linkfinderai.com/instagram-email-finder">Instagram</a>. For professionals, the most reliable route is their LinkedIn profile and the <a href="https://linkfinderai.com/linkedin-email-finder">LinkedIn email finder</a>.</p>
""" + links(("youtube-email-finder", "YouTube email finder"), ("facebook-email-finder", "Facebook email finder"), ("twitter-email-finder", "Twitter email finder")),
}


def block(inner):
    return (f"{START}\n{STYLE}\n<section class=\"lf-seo26\"><div class=\"lf-inner\">{inner.strip()}\n"
            f"</div></section>\n{END}\n")


def apply(path, inner):
    t = open(path, encoding="utf-8").read()
    t = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", t, flags=re.S)
    i = t.find("<!-- CLUSTER-LINKS:START -->")
    if i < 0:
        # first real <footer> tag, skipping any that sit inside an HTML comment
        for m in re.finditer(r"<footer[\s>]", t):
            last_open = t.rfind("<!--", 0, m.start())
            if last_open < 0 or t.rfind("-->", last_open, m.start()) >= 0:
                i = m.start()
                break
    if i < 0:
        raise SystemExit(f"no insertion point in {path}")
    return t[:i] + block(inner) + t[i:]


def main():
    for rel, inner in BLOCKS.items():
        path = os.path.join(ROOT, rel)
        out = apply(path, inner)
        if CHECK:
            print("would update", rel)
            continue
        open(path, "w", encoding="utf-8").write(out)
        print("updated", rel)


if __name__ == "__main__":
    main()
