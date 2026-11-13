"""Turns data/lookups.json (real LinkFinder AI results) into the 360-video plan:
for each industry in data/industries.json, 6 shorts + 2 long tutorials, plus
the generic searched-keyword videos in GENERIC. Every value is checked first
(check()); a value that fails is never filmed and is written to
data/rejected.json so the n8n workflow can be fixed (owner rule, 13 Nov).

    python3 video_factory/tools/gen360.py            # writes scenarios/v360-*.json + data/plan360.json
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "tools"))
import seo_shorts as S  # noqa: E402
from company_bulk import write as write_long  # noqa: E402

IND = {k: v for k, v in json.loads((HERE / "data" / "industries.json").read_text()).items() if not k.startswith("_")}
LK = json.loads((HERE / "data" / "lookups.json").read_text()) if (HERE / "data" / "lookups.json").exists() else []

FREE = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com"}
BAD_BOX = ("privacy", "ir@", "investor", "billing", "careers", "jobs", "recruit", "legal", "abuse", "noreply", "no-reply", "dpo", "gdpr", "admin@", "press", "media@", "unsubscribe")


def dom(url):
    m = re.sub(r"^https?://", "", str(url).strip().lower()).split("/")[0]
    return m[4:] if m.startswith("www.") else m


STOP = {"the", "and", "company", "companies", "group", "inc", "llc", "services", "service", "of", "for", "us", "usa", "co",
        # industry words: a domain carrying only these is someone else's site (Root Insurance -> autoinsurance.com)
        "insurance", "solar", "dental", "plumbing", "mortgage", "roofing", "law", "construction", "fitness", "pest", "control",
        "senior", "living", "hotels", "resorts", "animal", "hospitals", "hospital", "pet", "health", "healthcare", "realty",
        "motors", "automotive", "home", "homes", "cleaning", "systems", "building", "solutions", "landscape", "tree", "expert",
        "heating", "air", "conditioning", "cooling", "injury", "attorneys", "firm", "capital", "partners", "digital",
        "marketing", "advertising", "consulting", "media", "sciences", "pharmaceuticals", "electric", "works", "freight",
        "line", "national", "express", "professionals", "employment", "care", "centers", "veterinary", "associates",
        "research", "children", "clubs", "america", "american", "world", "retirement", "communities", "training", "supply",
        "remodeling", "independent", "wholesale", "united", "pro", "rescue"}


def matches(company, text):
    """The value must carry the company's name: a word of it, or its initials."""
    t = re.sub(r"[^a-z0-9]", "", text.lower())
    words = [w for w in re.findall(r"[a-z0-9]+", company.lower().replace("'", "")) if w not in STOP]
    if any(len(w) >= 3 and w in t for w in words):
        return True
    ini = "".join(w[0] for w in words)
    return len(ini) >= 2 and ini in t or (len(words) == 1 and words[0] in t)


def check(op, company, v):
    """None if the value is fine to film, else the reason it is not."""
    if v in (None, "", "Not found") or not isinstance(v, str):
        return "empty"
    v = v.strip()
    if op == "company_name_to_website":
        d = dom(v)
        if not re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", d):
            return "not a domain"
        if re.match(r"^[a-z]{2}\.", d) or d.endswith((".ca", ".co.uk", ".com.au", ".de", ".fr", ".in")):
            return "country site"
        if any(x in d for x in ("linkedin.", "facebook.", "wikipedia.", "yelp.", "bloomberg.", "crunchbase.")):
            return "not the company site"
        if not matches(company, d.rsplit(".", 1)[0]):
            return "domain does not carry the company name"
    elif op == "company_name_to_phone":
        digits = re.sub(r"\D", "", v)
        if v.startswith("+") and not v.startswith("+1"):
            return "non-US number"
        if digits.startswith("1"):
            digits = digits[1:]
        if len(digits) != 10:
            return "not a 10-digit US number"
        if digits[3:6] == "555":
            return "fake 555 number"
    elif op == "company_name_to_linkedin_url":
        if "linkedin.com/company/" not in v and "linkedin.com/school/" not in v:
            return "not a company page"
        slug = v.rstrip("/").split("/")[-1]
        if not slug.isdigit() and not matches(company, slug):
            return "page slug does not carry the company name"
    elif op == "company_name_to_email":
        if "@" not in v:
            return "not an email"
        local, d = v.lower().split("@", 1)
        if d in FREE:
            return "free-mail address"
        if any(b in v.lower() for b in BAD_BOX):
            return "wrong inbox (privacy, IR, billing, careers…)"
        if "." in local and len(local) > 6 and local not in ("customer.service", "customer.care"):
            return "looks like a named person's address"
        site = best("company_name_to_website", company)
        if site and dom(site).split(".")[-2] not in d:
            return f"domain does not match the website ({dom(site)})"
    return None


_idx = {}
for r in LK:
    _idx[(r["type"], r["input"])] = r.get("result")


def best(op, company):
    v = _idx.get((op, company))
    if isinstance(v, dict):
        v = v.get("result") or next((x for x in v.values() if isinstance(x, str)), None)
    return v


REJECTED = []


def good(op, companies):
    out = {}
    for c in companies:
        v = best(op, c)
        why = check(op, c, v)
        if why is None:
            out[c] = v.strip()
        elif why != "empty" or (op, c) in _idx:
            REJECTED.append({"type": op, "input": c, "value": v, "why": why})
    return out


OPS = {
    "phone": dict(op="company_name_to_phone", base="company-phone-numbers-bulk", pick=S.PHONE_PICK, word="phone numbers",
                  page="company-phone-finder", wait=lambda v: v.strip()[-8:], say=lambda v: " ".join(re.sub(r"\D", "", v)[-10:]),
                  long_pick=[{"say": "Click Phone number.", "click": {"text": "Phone number", "exact": True}},
                             {"say": "Choose Company name, main line. It costs one credit per company.", "click": {"text": "Company name (main line)"}}]),
    "email": dict(op="company_name_to_email", base="company-contact-emails-bulk", pick=S.MAIL_PICK, word="contact emails",
                  page="company-email-finder", wait=lambda v: v, say=lambda v: v.replace("@", " at ").replace(".", " dot "),
                  long_pick=[{"say": "Click More searches.", "click": {"text": "More searches"}},
                             {"say": "Pick a company's contact email, from its name. It costs five credits per company.", "click": {"text": "A company's contact email, from its name"}}]),
    "website": dict(op="company_name_to_website", base="company-websites-from-list", pick=S.WEB_PICK, word="websites",
                    page="company-url-finder", wait=lambda v: dom(v), say=lambda v: dom(v).replace(".", " dot "),
                    long_pick=[{"say": "Click Company website. It costs one credit per company.", "click": {"text": "Company website", "exact": True}}]),
    "linkedin": dict(op="company_name_to_linkedin_url", base="company-linkedin-pages-bulk", pick=["Open More searches.", "Pick company LinkedIn page."],
                     word="LinkedIn pages", page="linkedin-company-scraper", wait=lambda v: v.rstrip("/").split("/")[-1], say=lambda v: "their LinkedIn company page",
                     long_pick=[{"say": "Click More searches.", "click": {"text": "More searches"}},
                                {"say": "Pick a company's LinkedIn page, from its name. One credit per company.", "click": {"text": "A company's LinkedIn page, from its name"}}]),
}

# 6 shorts per industry: title templates use searched phrasings
SHORTS = [
    ("phone", "bulk", "How to Find {L} Leads With Phone Numbers (Bulk)", "{L} leads with a phone number for every company, in bulk.", "{U} LEADS + PHONES"),
    ("email", "bulk", "How to Build a {L} Email List (Free Tool)", "How to build a {l} email list from nothing but company names.", "{U} EMAIL LIST"),
    ("website", "bulk", "How to Find {L} Company Websites in Bulk", "Every {l} company on your list, with its website, in seconds.", "{U} WEBSITES"),
    ("linkedin", "bulk", "How to Find {L} Companies on LinkedIn (Bulk)", "Find the LinkedIn page of every {l} company on your list.", "{U} ON LINKEDIN"),
    ("email", "single", "How to Find the Email of Any {L} Company", "Need to email a {l} company? Type the name, get the inbox.", "{U} COMPANY EMAIL"),
    ("phone", "single", "How to Get a {L} Company's Phone Number", "Here's how to get a {l} company's phone number from its name.", "{U} PHONE NUMBER"),
]
LONGS = [
    ("email", "Find {L} Leads and Their Emails With LinkFinder AI", "find {l} leads and their contact emails"),
    ("phone", "Find {L} Company Phone Numbers With LinkFinder AI", "find {l} company phone numbers in bulk"),
]


# Searched keywords that are not one industry (vidIQ, 13 Nov 2026). Each mixes two
# industries' companies so the footage is never the same list as an industry video.
# (slug, title, keyword (volume/mo), kind, shape, industry A, industry B, caption, hook)
GENERIC = [
    ("g-scrape-leads", "How to Scrape Leads Without Coding (Emails in Bulk)", "how to scrape leads (25.8K)", "email", "long", "saas", "fintech", "", "scrape leads without writing a line of code"),
    ("g-how-to-find-leads", "How to Find Leads: Company Names to Phone Numbers", "how to find leads (24.3K)", "phone", "long", "logistics", "construction", "", "find leads with a phone number for every company"),
    ("g-b2b-leads", "B2B Leads: Get the Email of Every Company on Your List", "b2b leads (30K, +89%)", "email", "bulk", "cybersecurity", "hr-software", "B2B LEADS IN BULK", "B2B leads: a contact email for every company on your list."),
    ("g-unlimited-leads", "How to Get Unlimited Leads From a List of Company Names", "unlimited leads (16K)", "website", "long", "hr-software", "edtech", "", "turn a list of company names into leads"),
    ("g-business-leads", "How to Get Business Leads With Phone Numbers", "business leads (12K)", "phone", "bulk", "staffing", "accounting", "BUSINESS LEADS", "Business leads with a phone number for each one, in bulk."),
    ("g-scrape-leads-linkedin-pages", "Scrape Leads From LinkedIn Company Pages (No Code)", "scrape leads (9.6K, +97%)", "linkedin", "bulk", "construction", "manufacturing", "SCRAPE LEADS", "Scrape leads from LinkedIn company pages without code."),
    ("g-scrape-leads-from-linkedin", "How to Scrape Leads From LinkedIn Without Sales Navigator", "how to scrape leads from linkedin (7.2K, +90%)", "linkedin", "long", "staffing", "biotech", "", "scrape leads from LinkedIn without Sales Navigator"),
    ("g-scrape-linkedin-for-leads", "How to Scrape LinkedIn for Leads (Company Pages in Bulk)", "how to scrape linkedin for leads (5.2K)", "linkedin", "bulk", "ai-startups", "fintech", "SCRAPE LINKEDIN FOR LEADS", "How to scrape LinkedIn for leads: company pages, in bulk."),
    ("g-clients-from-linkedin", "How to Get Clients From LinkedIn: Find Every Company Page", "how to get clients from linkedin (23K)", "linkedin", "long", "marketing-agency", "saas", "", "get clients from LinkedIn by finding every target company's page"),
    ("g-linkedin-lead-generation", "LinkedIn Lead Generation: Build a Company List in Minutes", "linkedin lead generation (40K)", "linkedin", "bulk", "biotech", "cybersecurity", "LINKEDIN LEAD GENERATION", "LinkedIn lead generation, the fast way: names in, company pages out."),
    ("g-b2b-lead-generation", "B2B Lead Generation: From Company Names to Contact Emails", "b2b lead generation (46K)", "email", "long", "manufacturing", "logistics", "", "do B2B lead generation from a plain list of company names"),
    ("g-cold-email-lead-gen", "Cold Email Lead Generation: Get Contact Emails in Bulk", "cold email lead generation (25K)", "email", "bulk", "beauty", "furniture", "COLD EMAIL LEAD GEN", "Cold email lead generation: the inbox of every company on your list."),
    ("g-email-lead-generation", "Email Lead Generation: Turn Company Names Into Emails", "email lead generation (14.8K)", "email", "bulk", "furniture", "travel", "EMAIL LEAD GENERATION", "Email lead generation from nothing but company names."),
    ("g-build-email-list", "How to Build an Email List of Businesses (Fast)", "how to build an email list (24K, +98%)", "email", "bulk", "travel", "edtech", "BUILD AN EMAIL LIST", "How to build an email list of businesses in about thirty seconds."),
    ("g-email-extractor", "Email Extractor: Get Company Emails From Just Their Names", "email extractor (14.6K)", "email", "bulk", "edtech", "nonprofits", "EMAIL EXTRACTOR", "An email extractor that only needs the company name."),
    ("g-scrape-emails-free", "How to Scrape Emails for Free (Company Inboxes in Bulk)", "how to scrape emails for free (5K)", "email", "bulk", "nonprofits", "crypto", "SCRAPE EMAILS FREE", "How to scrape company emails with a free account."),
    ("g-scrape-email-from-google", "How to Get a Company's Email Without Searching Google", "how to scrape email from google (7.2K, +98%)", "email", "single", "restaurants", None, "SKIP THE GOOGLE SEARCH", "Stop digging through Google for a company's email. Type the name instead."),
    ("g-email-hunter", "Email Hunter Alternative: Find Company Emails in Bulk", "email hunter (4.7K)", "email", "bulk", "crypto", "telehealth", "EMAIL HUNTER ALTERNATIVE", "An email hunter alternative that works from company names."),
    ("g-free-email-finder", "Free Email Finder Tool: Find Any Company's Email", "free email finder tool (4.4K)", "email", "single", "telehealth", None, "FREE EMAIL FINDER", "A free email finder: type a company, get its inbox."),
    ("g-find-email-address", "How to Find an Email Address for Any Business", "how to find email address (5.1K)", "email", "single", "home-builders", None, "FIND AN EMAIL ADDRESS", "How to find the email address of any business, from its name."),
    ("g-cold-calling-b2b", "Cold Calling B2B: Build Your Call List in 30 Seconds", "cold calling b2b (9.8K, +89%)", "phone", "bulk", "accounting", "home-builders", "B2B COLD CALLING LIST", "Cold calling B2B? Build the call list in thirty seconds."),
    ("g-b2b-prospecting", "B2B Prospecting: Build a Call List From Company Names", "b2b prospecting (9.3K)", "phone", "long", "pest-control", "cleaning", "", "build a B2B prospecting call list from company names"),
    ("g-web-dev-clients", "How to Find Clients for Web Development (Their Websites in Bulk)", "how to find clients for web development (7.9K, +90%)", "website", "bulk", "restaurants", "fitness", "WEB DEV CLIENTS", "How to find web development clients: start with their websites."),
    ("g-web-design-clients", "How to Find Website Design Clients (Fast Method)", "how to find website design clients (7K)", "website", "bulk", "dental", "veterinary", "WEB DESIGN CLIENTS", "Find website design clients: every business on your list, with its site."),
    ("g-seo-clients", "How to Find SEO Clients: Get Their Websites in Bulk", "how to find seo clients (5K)", "website", "bulk", "personal-injury", "senior-living", "FIND SEO CLIENTS", "How to find SEO clients and their websites in one go."),
    ("g-copywriting-clients", "How to Find Clients for Copywriting (Brand Emails)", "how to find clients for copywriting (11.3K)", "email", "bulk", "ai-startups", "beauty", "COPYWRITING CLIENTS", "How to find copywriting clients and the email to pitch them."),
    ("g-video-editing-clients", "How to Find Clients for Video Editing (Get Their Emails)", "how to find clients for video editing (77K, +98%)", "email", "long", "media", "beauty", "", "find clients for video editing and the email to reach them"),
    ("g-video-editing-clients-short", "Video Editing Clients: Find Brands to Pitch in Bulk", "how to find video editing clients (23K)", "linkedin", "bulk", "media", "shopify", "VIDEO EDITING CLIENTS", "Find brands to pitch your video editing to, in bulk."),
    ("g-clients-to-outreach", "How to Find Clients to Outreach (Emails in Bulk)", "how to find clients to outreach (8.3K)", "email", "bulk", "fintech", "saas", "CLIENTS TO OUTREACH", "How to find clients to outreach, with an email for each."),
    ("g-import-export-clients", "How to Find Import Export Clients (Company Emails)", "how to find import export clients (5.1K)", "email", "bulk", "logistics", "manufacturing", "IMPORT EXPORT CLIENTS", "How to find import and export clients and their contact emails."),
    ("g-us-software-clients", "How to Find US Clients for a Software Development Agency", "how to find us clients for software dev agency (5.2K)", "linkedin", "bulk", "manufacturing", "home-builders", "US SOFTWARE CLIENTS", "Find US clients for your software agency: their LinkedIn pages, in bulk."),
    ("g-app-dev-clients", "How to Find Clients for App Development (Contact Emails)", "how to find clients for app development (5.4K)", "email", "bulk", "fitness", "restaurants", "APP DEV CLIENTS", "How to find app development clients and the email to reach them."),
    ("g-smm-clients", "How to Find Clients for Social Media Management", "how to find clients for social media management (9K, +92%)", "linkedin", "bulk", "restaurants", "beauty", "SMM CLIENTS", "Find social media management clients: brands and their LinkedIn pages."),
    ("g-home-service-leads", "How to Get Home Service Leads (Phone Numbers)", "how to get home service leads (8.9K)", "phone", "long", "hvac", "plumbing", "", "get home service leads with phone numbers"),
    ("g-real-estate-leads", "How to Generate Leads in Real Estate (Builder Phone Numbers)", "how to generate leads in real estate (13K)", "phone", "bulk", "home-builders", "proptech", "REAL ESTATE LEADS", "Real estate leads: every builder and brokerage with its phone number."),
    ("g-ugc-clients", "How to Find Clients for UGC Ads (Brands on LinkedIn)", "how to find clients for ugc ads (5K)", "linkedin", "bulk", "furniture", "shopify", "UGC CLIENTS", "Find UGC ad clients: the brands and their LinkedIn pages."),
    ("g-thumbnail-clients", "How to Find Thumbnail Clients (Media Brands in Bulk)", "how to find thumbnail clients (17.6K)", "website", "bulk", "media", "edtech", "THUMBNAIL CLIENTS", "Find thumbnail design clients: media brands and their websites."),
    ("g-local-seo-clients", "How to Find Clients for Local SEO (Websites in Bulk)", "how to find clients for local seo (5.8K)", "website", "bulk", "cleaning", "pest-control", "LOCAL SEO CLIENTS", "How to find local SEO clients and check their websites."),
    ("g-ai-voice-agent-clients", "How to Find Clients for AI Voice Agents (Phone Numbers)", "how to find clients for ai voice agents (5K)", "phone", "bulk", "auto-dealers", "senior-living", "AI VOICE AGENT CLIENTS", "Find clients for your AI voice agents: businesses that answer the phone."),
    ("g-shopify-clients", "How to Find Shopify Clients and Their Emails", "how to find shopify clients (9.5K, +96%)", "email", "bulk", "shopify", "beauty", "SHOPIFY CLIENTS", "How to find Shopify clients and the email to reach them."),
    ("g-leads-linkedin-search", "How to Find Leads With LinkedIn Search (Faster Way)", "how to find leads with linkedin search (8.2K)", "linkedin", "bulk", "hotels", "travel", "LINKEDIN SEARCH LEADS", "Find leads faster than LinkedIn search: company pages in bulk."),
    ("g-linkedin-leads-ai", "How to Find LinkedIn Leads With AI (Company Pages in Bulk)", "how to find linkedin leads with ai (6.7K)", "linkedin", "bulk", "ai-startups", "edtech", "LINKEDIN LEADS WITH AI", "Find LinkedIn leads with AI: the page of every company on your list."),
    ("g-coaching-leads", "How to Get Coaching Leads (Company Emails in Bulk)", "coaching leads (13K)", "email", "bulk", "fitness", "hr-software", "COACHING LEADS", "Coaching leads: companies and the email to reach them."),
    ("g-website-dev-leads", "How to Get Leads for Website Development", "how to get leads for website development (13K)", "website", "bulk", "plumbing", "roofing", "WEBSITE DEV LEADS", "Leads for website development: check every business's site in bulk."),
    ("g-home-service-business-leads", "How to Generate Leads for a Home Service Business", "how to generate leads for my home service business (9.5K)", "phone", "bulk", "cleaning", "landscaping", "HOME SERVICE LEADS", "Home service leads with a phone number for each business."),
    ("g-sell-leads", "How to Sell Leads to Clients: Build the List First", "how to sell leads to clients (8.4K)", "email", "bulk", "mortgage", "insurance", "SELL LEADS", "Want to sell leads? Build the list first: companies and their emails."),
    ("g-10k-leads", "How to Get 10K Leads From Company Names (Websites)", "10k leads (8.7K)", "website", "long", "manufacturing", "biotech", "", "turn thousands of company names into leads with websites"),
    ("g-unlimited-leads-free", "How to Get Unlimited Leads for Free (LinkedIn Pages)", "how to get unlimited leads for free (8.4K)", "linkedin", "bulk", "veterinary", "dental", "UNLIMITED LEADS FREE", "Unlimited leads for free: start with the LinkedIn page of every company."),
    ("g-more-leads-business", "Get More Leads for Your Business: Build a Call List", "get more leads for your business (9.4K)", "phone", "bulk", "fitness", "restaurants", "MORE LEADS", "Get more leads for your business with a ready call list."),
    ("g-leads-for-your-business", "How to Get Leads for Your Business (Emails in Bulk)", "how to get leads for your business (9.5K)", "email", "bulk", "senior-living", "veterinary", "LEADS FOR YOUR BUSINESS", "How to get leads for your business, with an email for each."),
    ("g-right-clients-outreach", "How to Find the Right Clients to Outreach on LinkedIn", "how to find the right clients to outreach (8.8K)", "linkedin", "bulk", "cybersecurity", "saas", "RIGHT CLIENTS TO OUTREACH", "Find the right clients to outreach: their LinkedIn pages, in bulk."),
    ("g-high-ticket-clients", "How to Find High Ticket Clients (Contact Emails)", "how to find high ticket clients (7.8K)", "email", "long", "biotech", "fintech", "", "find high ticket clients and the email to reach them"),
    ("g-web-dev-clients-usa", "How to Find Website Development Clients in the USA", "how to find website development clients usa (6.6K)", "website", "bulk", "auto-dealers", "home-builders", "US WEB DEV CLIENTS", "Find US website development clients and their sites in bulk."),
    ("g-graphic-design-clients", "How to Find Clients for Graphic Design (Brand Websites)", "how to find clients for graphic design (6.5K)", "website", "bulk", "beauty", "furniture", "GRAPHIC DESIGN CLIENTS", "Find graphic design clients: brands and their websites."),
    ("g-growth-ops-clients", "How to Find Clients for Growth Ops (LinkedIn Pages)", "how to find clients for growth ops (6.2K)", "linkedin", "bulk", "saas", "hr-software", "GROWTH OPS CLIENTS", "Find growth ops clients: SaaS companies and their LinkedIn pages."),
    ("g-ecom-web-dev-clients", "How to Find E-commerce Clients for Website Development", "how to find e-commerce clients for website development (5K)", "website", "bulk", "shopify", "furniture", "E-COMMERCE CLIENTS", "Find e-commerce clients for your web development services."),
    ("g-clients-any-service", "How to Find Clients for Any Service (Call List in Seconds)", "how to find clients for any service (5.1K)", "phone", "bulk", "dental", "pest-control", "CLIENTS FOR ANY SERVICE", "Find clients for any service: a call list in seconds."),
    ("g-freelance-seo-clients", "How to Find Freelance Clients for SEO", "how to find freelance clients for seo (6.5K)", "website", "bulk", "senior-living", "landscaping", "FREELANCE SEO CLIENTS", "Find freelance SEO clients and audit their sites."),
    ("g-linkedin-client-hunting", "LinkedIn Client Hunting: Find Every Target Company Page", "linkedin client hunting (32K)", "linkedin", "long", "logistics", "proptech", "", "do LinkedIn client hunting: find every target company page"),
    ("g-client-hunting-linkedin-short", "Client Hunting on LinkedIn in 30 Seconds", "client hunting on linkedin (12.4K)", "linkedin", "bulk", "auto-dealers", "nonprofits", "CLIENT HUNTING", "Client hunting on LinkedIn: thirty seconds, a whole list."),
    ("g-lead-finder", "Lead Finder: Turn Company Names Into Leads", "lead finder (13K)", "website", "bulk", "telehealth", "crypto", "LEAD FINDER", "A lead finder that starts from company names."),
    ("g-mortgage-calling", "Calling Mortgage Leads? Get the Numbers in Bulk", "calling mortgage leads (8.3K)", "phone", "bulk", "mortgage", "proptech", "MORTGAGE CALL LIST", "Calling mortgage leads? Get every number in bulk first."),
]


def generic(plan):
    for slug, title, kw, kind, shape, a, b, cap, hook in GENERIC:
        o = OPS[kind]
        va = list(good(o["op"], IND[a]["companies"]).items())
        vb = list(good(o["op"], IND[b]["companies"]).items()) if b else []
        vals = dict(va[:4] + vb[:4])
        slug = "v360-" + slug
        ind = {"kw": kw.split(" (")[0], "label": IND[a]["label"]}
        if shape == "long":
            if len(vals) < 6:
                continue
            items = list(vals.items()); single, rest = items[0], dict(items[1:])
            d = write_long(slug, title, hook, o["long_pick"], single, f"In a couple of seconds you get {o['say'](single[1])}.",
                           rest, "", o["word"], o["wait"](list(rest.values())[-1]), o["page"],
                           [ind["kw"], "lead generation", "b2b leads", o["word"], "LinkFinder AI"],
                           "find the people who work at these companies", "Run your own list", single_wait=o["wait"](single[1]))
            d["keyword"] = kw
            d["mocks"]["_source"] = "Real results from the LinkFinder AI API (data/lookups.json), checked by tools/gen360.py"
            d["thumb"] = {"style": ["card", "flow", "number", "banner", "sheet"][len(slug) % 5], "top": title.split(":")[0].split("(")[0][:22].upper(),
                          "bottom": o["word"].capitalize(), "hook": "|".join(title.upper().split(":")[0].split()[:3]), "colIn": "Company", "colOut": o["word"].split()[0].capitalize()}
            (HERE / "scenarios" / f"{slug}.json").write_text(json.dumps(d, indent=2, ensure_ascii=False))
        else:
            spec = spec_common(kind, slug, title, hook, cap, ind)
            spec["keyword"] = kw
            if shape == "bulk":
                if len(vals) < 5:
                    continue
                spec.update(by=vals, last=o["wait"](list(vals.values())[-1]), fill=f"The {o['word']} fill in, row by row.")
                S.bulk(slug, spec)
            else:
                if not vals:
                    continue
                name, v = list(vals.items())[-1]
                spec.update(inputs={"input[placeholder*='Tesla']": name}, wait=o["wait"](v), by={name: v},
                            run_say=[f"Type the company. {name}.", "Enrich.", f"There it is: {o['say'](v)}."])
                S.single(slug, spec)
        plan.append({"slug": slug, "format": "long" if shape == "long" else "short", "industry": a, "kind": kind, "keyword": kw})


def spec_common(kind, slug, title, hook, caption, ind):
    o = OPS[kind]
    return dict(keyword=ind["kw"], base=o["base"], title=title, hook=hook, caption=caption, pick_say=o["pick"],
                tags=[ind["kw"], f"{ind['label'].lower()} leads", f"{ind['label'].lower()} {o['word']}", "lead generation", "b2b leads"],
                page=f"https://linkfinderai.com/{o['page']}")


def main():
    plan = []
    for key, ind in IND.items():
        L, l, U = ind["label"], ind["label"].lower(), ind["label"].upper()
        data = {k: good(OPS[k]["op"], ind["companies"]) for k in OPS}
        for kind, shape, t, h, c in SHORTS:
            vals = data[kind]
            slug = f"v360-{key}-{kind}-{shape}"
            f = dict(L=L, l=l, U=U)
            spec = spec_common(kind, slug, t.format(**f), h.format(**f), c.format(**f), ind)
            if shape == "bulk":
                if len(vals) < 5:
                    continue
                spec.update(by=vals, last=OPS[kind]["wait"](list(vals.values())[-1]),
                            fill=f"The {OPS[kind]['word']} fill in, row by row.")
                S.bulk(slug, spec)
            else:
                if not vals:
                    continue
                name, v = next(iter(vals.items()))
                w = OPS[kind]["wait"](v)
                spec.update(inputs={"input[placeholder*='Tesla']": name}, wait=w, by={name: v},
                            run_say=[f"Type the company. {name}.", "Enrich.", f"There it is: {OPS[kind]['say'](v)}."])
                S.single(slug, spec)
            plan.append({"slug": slug, "format": "short", "industry": key, "kind": kind})
        for kind, t, how in LONGS:
            vals = data[kind]
            if len(vals) < 6:
                continue
            items = list(vals.items())
            single, rest = items[0], dict(items[1:])
            slug = f"v360-{key}-{kind}-long"
            o = OPS[kind]
            csvnote = None
            d = write_long(slug, t.format(L=L, l=l), how.format(L=L, l=l), o["long_pick"],
                           (single[0], single[1]), f"In a couple of seconds you get {o['say'](single[1])}.",
                           rest, "", o["word"], o["wait"](list(rest.values())[-1]), o["page"],
                           [ind["kw"], f"{l} leads", f"{l} {o['word']}", "lead generation", "b2b leads", "LinkFinder AI"],
                           f"find the {('emails' if kind == 'phone' else 'phone numbers')} of these same companies",
                           f"Run your own {l} list", single_wait=o["wait"](single[1]))
            d["mocks"]["_source"] = "Real results from the LinkFinder AI API (data/lookups.json), checked by tools/gen360.py"
            d["thumb"] = {"style": ["banner", "card", "number", "sheet", "flow"][hash(slug) % 5], "top": f"{U} LEADS"[:22],
                          "bottom": o["word"].capitalize(), "hook": f"{U}|LEADS|{o['word'].split()[0].upper()}",
                          "colIn": "Company", "colOut": o["word"].split()[0].capitalize()}
            (HERE / "scenarios" / f"{slug}.json").write_text(json.dumps(d, indent=2, ensure_ascii=False))
            plan.append({"slug": slug, "format": "long", "industry": key, "kind": kind})
    generic(plan)
    (HERE / "data" / "plan360.json").write_text(json.dumps(plan, indent=1))
    (HERE / "data" / "rejected.json").write_text(json.dumps(REJECTED, indent=1, ensure_ascii=False))
    print(len(plan), "videos;", len(REJECTED), "values rejected")


if __name__ == "__main__":
    main()
