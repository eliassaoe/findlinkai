"""The 500-idea plan (owner, 13 Nov 2026): 5 videos a day = 3 long + 2 shorts,
about 1,000 videos. Every idea is a searched YouTube phrase (vidIQ keyword
research, 13 Nov 2026) and works as a long video AND a short.

Long  = the flagship format (tools/best_series.py: result first, slow step-by-step
        on one company, the same lookup on a CSV, Sheets / API / History).
Short = the same main lookup, one company, ~25 s.

Four families, 500 ideas:
  head        searched tool / how-to phrases (volume from vidIQ where it is measured)
  alt         "<competitor> alternative" searches (buyers comparing tools)
  industry    "<industry> email list / leads / LinkedIn / websites"  (50 new + 40 old industries)
  clients     "how to find clients for <service>" (freelancers and agencies)

Company-level data only (no person's email or phone on screen). Every value is a
real LinkFinder AI result from data/lookups.json, checked by gen360.check().

    python3 video_factory/tools/ideas500.py            # writes data/ideas500.json + scenarios
    python3 video_factory/tools/ideas500.py --plan     # only data/ideas500.json
"""
import collections
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "tools"))
import gen360 as G  # noqa: E402
import best_series as B  # noqa: E402

# keyword, measured volume/mo ("" = under vidIQ's 750 floor), title, kind, action ("how to ...")
HEAD = [
    ("cold email", "265K", "Cold Email: Where to Get the Email Addresses (Free)", "email", "get email addresses for cold email"),
    ("linkedin outreach", "109K", "LinkedIn Outreach: Find the Right Company Pages First", "linkedin", "find the LinkedIn pages to reach out to"),
    ("cold email outreach", "97K", "Cold Email Outreach: How to Get the Emails First", "email", "get the emails for cold email outreach"),
    ("ai lead generation", "80K", "AI Lead Generation: Real Company Emails in Seconds", "email", "generate leads with AI"),
    ("linkedin lead generation", "37K", "LinkedIn Lead Generation: Company Pages in Bulk", "linkedin", "generate leads from LinkedIn company pages"),
    ("how to generate leads", "34K", "How to Generate Leads for Free (Step by Step)", "phone", "generate leads for free"),
    ("cold email lead generation", "28K", "Cold Email Lead Generation: Build the Lead List Free", "email", "build a cold email lead list"),
    ("how to cold call", "28K", "How to Cold Call: Get the Right Phone Numbers First", "phone", "get the right numbers before you cold call"),
    ("lead generation tutorial for beginners", "26K", "Lead Generation Tutorial for Beginners (Free Tool)", "phone", "do lead generation as a beginner"),
    ("how to get leads", "19K", "How to Get Leads With Emails (Step by Step)", "email", "get leads with emails"),
    ("cold calls", "18K", "Cold Calls: Where to Get Business Phone Numbers", "phone", "get business phone numbers for cold calls"),
    ("email extractor", "15K", "Email Extractor: Company Emails From a List of Names", "email", "extract company emails from a list of names"),
    ("b2b lead generation tutorial", "44K", "B2B Lead Generation Tutorial: Phone Numbers in Bulk", "phone", "do B2B lead generation with phone numbers"),
    ("how to get linkedin profile url", "12K", "How to Get a Company's LinkedIn URL (Fast)", "linkedin", "get a company's LinkedIn URL"),
    ("hunter io", "11K", "Hunter.io vs LinkFinder AI: Who Finds the Real Inbox?", "email", "find a company's real inbox, not a guess"),
    ("how to find email address", "5.1K", "How to Find the Email Address of Any Company (Free)", "email", "find the email address of any company"),
    ("how to scrape emails for free", "5.1K", "How to Scrape Emails for Free (No Code, Bulk)", "email", "scrape emails for free without code"),
    ("sales navigator lead generation", "5.1K", "Sales Navigator Alternative for Company Leads (Free)", "linkedin", "find company leads without Sales Navigator"),
    ("bulk email scraper", "4.8K", "Bulk Email Scraper: Company Emails From a CSV (Free)", "email", "scrape company emails in bulk"),
    ("lead research", "4.8K", "Lead Research: A Company's Website, Phone and Email", "email", "research a lead in under a minute"),
    ("givemeleads", "4.6K", "GiveMeLeads Alternative: Free Company Leads With Emails", "email", "get company leads with emails"),
    ("how to automate lead generation", "4.4K", "How to Automate Lead Generation (Bulk CSV, No Code)", "email", "automate lead generation without code"),
    ("free email finder tool", "4.4K", "Free Email Finder Tool: Any Company's Email (2026)", "email", "find any company's email for free"),
    ("find linkedin email address", "4.4K", "Find a Company's Email Starting From LinkedIn", "email", "go from a LinkedIn company page to an email"),
    ("email finder tool free", "4.3K", "Email Finder Tool Free: Real Inboxes, No Guessing", "email", "find real company inboxes free"),
    ("how to find emails for email marketing", "4.2K", "How to Find Emails for Email Marketing (B2B)", "email", "find emails for B2B email marketing"),
    ("b2b data api", "3.8K", "B2B Data API: Company Emails in One Call", "email", "get company emails from an API"),
    ("apify linkedin scraper", "3.5K", "Apify LinkedIn Scraper Alternative (No Setup)", "linkedin", "scrape LinkedIn company pages with no setup"),
    ("evaboot alternative", "3.5K", "Evaboot Alternative: LinkedIn Company Pages in Bulk", "linkedin", "export LinkedIn company pages in bulk"),
    ("how to scrape linkedin", "3.4K", "How to Scrape LinkedIn Company Pages (No Code)", "linkedin", "scrape LinkedIn company pages without code"),
    ("how to find emails for cold emailing", "", "How to Find Emails for Cold Emailing (Real Inboxes)", "email", "find emails for cold emailing"),
    ("how to find business owners email addresses", "", "How to Find Business Owners' Email Addresses (Free)", "email", "find business email addresses for free"),
    ("how to find corporate email addresses", "", "How to Find Corporate Email Addresses in Bulk", "email", "find corporate email addresses in bulk"),
    ("find company email address", "", "Find a Company Email Address From Its Name", "email", "find a company email from its name"),
    ("find b2b emails", "", "How to Find B2B Emails Without Guessing", "email", "find B2B emails without guessing"),
    ("find verified emails", "", "How to Find Verified Business Emails (Free)", "email", "find verified business emails"),
    ("business email finder", "", "Business Email Finder: Free and in Bulk", "email", "find business emails in bulk"),
    ("b2b email finder", "", "B2B Email Finder That Doesn't Guess (Free)", "email", "find B2B emails that aren't guesses"),
    ("email lookup", "", "Free Email Lookup for Any Company", "email", "look up any company's email"),
    ("mass email scraper", "", "Mass Email Scraper for Company Lists (No Code)", "email", "scrape emails for a whole company list"),
    ("how to find emails free", "", "How to Find Emails Free: Company Inboxes in Seconds", "email", "find company emails free"),
    ("find email by company name", "", "Find Email by Company Name (Free Tool)", "email", "find an email by company name"),
    ("email list building", "", "Email List Building for B2B (Free Tool)", "email", "build a B2B email list"),
    ("buy email lists", "", "Don't Buy Email Lists: Build One Free Instead", "email", "build an email list instead of buying one"),
    ("contact database", "", "Build a Contact Database: Company Emails in Bulk", "email", "build a company contact database"),
    ("prospect list", "", "How to Build a Prospect List With Emails", "email", "build a prospect list with emails"),
    ("csv enrichment", "", "Enrich a CSV of Companies With Emails", "email", "enrich a CSV of companies with emails"),
    ("excel company emails", "", "Find Company Emails From an Excel List", "email", "find company emails from an Excel list"),
    ("data enrichment tools", "", "Data Enrichment Tools: Enrich a Company List Free", "email", "enrich a company list"),
    ("lead generation virtual assistant", "", "Lead Generation for Virtual Assistants: Emails Fast", "email", "do lead generation tasks as a virtual assistant"),
    ("fiverr lead generation", "", "Fiverr Lead Generation Gig: Build the List in Minutes", "email", "deliver a lead generation gig fast"),
    ("upwork lead generation", "", "Upwork Lead Generation Jobs: Done in Minutes", "email", "finish Upwork lead generation jobs fast"),
    ("lead generation freelancing", "", "Lead Generation Freelancing: Build Client Lists Faster", "phone", "build lead lists for clients faster"),
    ("crm enrichment", "", "CRM Enrichment: Fill In Missing Company Phone Numbers", "phone", "fill missing phone numbers in your CRM"),
    ("phone number look up tools", "", "Phone Number Lookup Tool for Businesses (Free)", "phone", "look up any business's phone number"),
    ("find contact info", "", "How to Find Contact Info for Any Company", "phone", "find any company's contact info"),
    ("b2b database", "", "Build a B2B Database From Company Names (Free)", "phone", "build a B2B database from company names"),
    ("how to find phone numbers online", "", "How to Find Business Phone Numbers Online", "phone", "find business phone numbers online"),
    ("lead list", "", "How to Build a Lead List From Scratch (Free)", "phone", "build a lead list from scratch"),
    ("sdr tools", "", "Free SDR Tool: Company Phone Numbers in Bulk", "phone", "get phone numbers for your SDR team"),
    ("outbound sales", "", "Outbound Sales: Build Your Call List Free", "phone", "build an outbound call list"),
    ("cold calling leads", "", "Where to Get Cold Calling Leads (Free)", "phone", "get cold calling leads"),
    ("business phone number finder", "", "Business Phone Number Finder: Main Line, Not a Fax", "phone", "find a business's main phone line"),
    ("linkedin company scraper", "", "LinkedIn Company Scraper: Name to Page in Bulk", "linkedin", "scrape LinkedIn company pages from names"),
    ("linkedin data extractor", "", "LinkedIn Data Extractor for Company Lists", "linkedin", "extract LinkedIn company pages for a list"),
    ("export linkedin leads", "", "Export LinkedIn Company Leads to CSV", "linkedin", "export LinkedIn company leads to a CSV"),
    ("linkedin company page", "", "Find Any LinkedIn Company Page From a Name", "linkedin", "find any LinkedIn company page"),
    ("company data enrichment", "", "Company Data Enrichment: LinkedIn Page, Website, Phone", "linkedin", "enrich company data in one pass"),
    ("web scraping", "28K", "Web Scraping Without Code: Company Websites in Bulk", "website", "scrape company websites without code"),
    ("data extraction", "4.5K", "Data Extraction: Company Websites From a List", "website", "extract company websites from a list"),
    ("automated data collection", "4.6K", "Automated Data Collection for Lead Lists", "website", "collect lead data automatically"),
    ("enrich company list", "", "Enrich a Company List With Websites (Free)", "website", "enrich a company list with websites"),
    ("find company website", "", "Find a Company's Official Website (Not a Directory)", "website", "find a company's official website"),
    # "leads" phrases (vidIQ matching_terms "leads", 13 Nov 2026)
    ("how to scrape leads from search", "79K", "How to Scrape Leads From Search (No Code)", "email", "scrape leads from search without code"),
    ("get more leads for your business", "13K", "How to Get More Leads for Your Business (Free List)", "phone", "get more leads for your business"),
    ("business leads", "12K", "Business Leads: Company Emails in Bulk (Free)", "email", "get business leads with emails"),
    ("how to get leads for your business", "9.5K", "How to Get Leads for Your Business With Emails", "email", "get leads for your business"),
    ("how to generate the leads for crm", "9.6K", "How to Generate Leads for Your CRM (Bulk CSV)", "email", "generate leads straight into your CRM"),
    ("how to sell leads to clients", "8.4K", "How to Build Lead Lists You Can Sell to Clients", "phone", "build lead lists you can sell"),
    ("how to find clients on linkedin for free", "", "How to Find Clients on LinkedIn for Free (Company Pages)", "linkedin", "find clients on LinkedIn for free"),
    ("how to find clients for b2b", "", "How to Find B2B Clients: Company Emails in Bulk", "email", "find B2B clients"),
    ("database of clients in your niche", "", "How to Build a Database of Clients in Your Niche", "email", "build a client database for your niche"),
    ("how to find clients for any service", "5.1K", "How to Find Clients for Any Service (Free Lead List)", "phone", "find clients for any service"),
]
# industry-specific "leads" phrases with measured volume: (keyword, volume, title, kind, industry)
HEAD_IND = [
    ("how to generate leads in real estate", "13K", "How to Generate Real Estate Leads (Property Managers' Numbers)", "phone", "property-management"),
    ("contractors leads", "9.4K", "Contractor Leads: Company Phone Numbers in Bulk", "phone", "electrical"),
    ("how to get home service leads", "8.9K", "How to Get Home Service Leads (Phone Numbers)", "phone", "home-services"),
    ("coaching leads", "13K", "Coaching Leads: Companies to Pitch, With Emails", "email", "staffing"),
    ("how to get ai to get list of leads for landscaping", "9K", "How to Get a List of Landscaping Leads With AI", "phone", "landscaping"),
    ("how to find leads for video editing", "9.9K", "How to Find Leads for Video Editing (Brands With Emails)", "email", "creator-tools"),
    ("plumbing leads", "9.6K", "Plumbing Leads: Build a Plumbing Company Email List", "email", "plumbing"),
    ("insurance leads", "9.6K", "Insurance Leads: Company LinkedIn Pages in Bulk", "linkedin", "insurance"),
    ("how to generate quality leads for real estate", "9.3K", "Real Estate Leads: Investor Company Emails (Free)", "email", "real-estate-investing"),
    ("how to generate leads for my home service business", "9.5K", "Leads for a Home Service Business: Pool Company Numbers", "phone", "pools"),
]

# Competitors not already covered by the best series. kind varies so the demo differs.
ALT = [("Snov.io", "email"), ("Kaspr", "phone"), ("Seamless.AI", "phone"), ("UpLead", "email"), ("Findymail", "email"),
       ("Prospeo", "email"), ("Dropcontact", "email"), ("Anymailfinder", "email"), ("Voila Norbert", "email"), ("Skrapp", "email"),
       ("GetProspect", "email"), ("ContactOut", "email"), ("SignalHire", "phone"), ("LeadIQ", "phone"), ("Cognism", "phone"),
       ("Datanyze", "phone"), ("Swordfish AI", "phone"), ("AeroLeads", "email"), ("PhantomBuster", "linkedin"), ("Lemlist", "email"),
       ("Saleshandy", "email"), ("Clay", "linkedin"), ("RocketReach", "phone"), ("ZoomInfo", "email"), ("Lusha", "email"),
       ("Clearbit", "website"), ("Apollo", "phone"), ("Hunter", "phone"), ("Instantly lead finder", "email"), ("Waalaxy", "linkedin"),
       ("Dux-Soup", "linkedin"), ("Coldlytics", "email"), ("Wiza", "email"), ("Lead411", "phone"), ("D7 Lead Finder", "email"),
       ("Tomba", "email"), ("Nymeria", "email"), ("Enrow", "email"), ("Icypeas", "email"), ("LeadMagic", "email"), ("Datagma", "phone"),
       ("Crunchbase", "linkedin"), ("Owler", "website"), ("BuiltWith", "website"), ("Leadfeeder", "linkedin"), ("Kendo", "email")]
ALT_TITLE = {  # vidIQ score_title 13 Nov: "X Alternative: How to Find Company Emails Free" 82 (the "(2026)" form scored 79)
    "email": "{c} Alternative: How to Find Company Emails Free", "phone": "{c} Alternative: How to Find Company Phone Numbers Free",
    "linkedin": "{c} Alternative: How to Find LinkedIn Company Pages Free", "website": "{c} Alternative: How to Find Company Websites Free"}

# 40 industries already in plan360 got 6 shorts + email/phone longs: add the two missing longs.
OLD_IND_LONGS = [("linkedin", "How to Find {L} Companies on LinkedIn (Bulk)", "{l} companies on linkedin"),
                 ("website", "{L} Company Websites From a List of Names", "{l} company websites")]
# The 50 industries added 13 Nov: four longs each.
NEW_IND_LONGS = [("email", "{L} Email List: How to Build One Free", "{l} email list"),
                 ("phone", "{L} Leads: Every Company's Phone Number", "{kw}"),
                 ("linkedin", "How to Find {L} Companies on LinkedIn", "{l} companies on linkedin"),
                 ("website", "{L} Company Websites in Bulk (From Names)", "{l} company websites")]

# how to find clients for <service>: the service sells to <industry>; the lookup that service needs.
CLIENTS = [
    ("web design", "restaurants", "email"), ("social media marketing", "beauty", "email"), ("SEO", "law-firms", "email"),
    ("bookkeeping", "construction", "phone"), ("video editing", "creator-tools", "email"), ("graphic design", "beverage", "email"),
    ("copywriting", "saas", "email"), ("virtual assistant", "real-estate-investing", "email"), ("commercial cleaning", "coworking", "phone"),
    ("IT support", "law-firms", "phone"), ("payroll services", "restaurants", "phone"), ("recruiting agency", "ai-startups", "linkedin"),
    ("software development", "fintech", "email"), ("app development", "fitness", "email"), ("photography", "hotels", "email"),
    ("event planning", "consulting", "email"), ("catering", "coworking", "email"), ("HVAC maintenance", "self-storage", "phone"),
    ("commercial pest control", "restaurants", "phone"), ("commercial landscaping", "property-management", "phone"),
    ("business insurance", "construction", "phone"), ("merchant services", "restaurants", "phone"), ("translation services", "ecommerce", "email"),
    ("UGC creators", "beauty", "email"), ("influencer marketing", "fashion", "email"), ("podcast production", "saas", "email"),
    ("email marketing agency", "shopify", "email"), ("PPC agency", "personal-injury", "email"), ("lead generation agency", "roofing", "phone"),
    ("cold calling agency", "solar", "phone"), ("appointment setting", "hvac", "phone"), ("CRM consulting", "staffing", "email"),
    ("data entry", "logistics", "email"), ("web development", "dental", "email"), ("AI automation agency", "dental", "phone"),
    ("n8n automation", "accounting", "email"), ("drone photography", "home-builders", "email"),
    ("3D rendering", "architecture", "email"), ("interior design", "hotels", "phone"), ("staffing agency", "manufacturing", "phone"),
    ("freight brokers", "manufacturing", "phone"), ("truck dispatching", "trucking", "phone"), ("packaging", "beverage", "email"),
    ("wholesale", "jewelry", "email"), ("affiliate marketing", "online-courses", "email"), ("YouTube sponsorships", "devtools", "email"),
    ("B2B SaaS sales", "hr-software", "linkedin"), ("fractional CFO", "ai-startups", "email"), ("medical billing", "clinics", "phone"),
    ("managed IT", "dental", "linkedin"), ("solar installers", "home-builders", "phone"), ("security guard services", "property-management", "phone"),
    ("signage", "fitness", "phone"), ("commercial printing", "marketing-agency", "email"), ("Shopify development", "fashion", "email"),
    ("bookkeeping for ecommerce", "shopify", "email"), ("HR consulting", "restaurants", "email"),
    ("tax preparation", "landscaping", "phone"), ("logo design", "breweries", "email"),
    ("thumbnail design", "creator-tools", "email"), ("clipping", "online-courses", "email"), ("local SEO", "dental", "phone"),
    ("AI voice agents", "med-spas", "phone"), ("UGC ads", "beverage", "email"), ("ecommerce website development", "ecommerce", "email"),
    ("cybersecurity companies", "fintech", "linkedin"), ("digital marketing agency", "personal-injury", "phone"),
    ("AI real estate staging", "home-builders", "email"), ("growth ops", "saas", "linkedin"), ("AI ads", "fashion", "email"),
    ("AI video", "online-courses", "phone"), ("gaming video editing", "gaming", "email"), ("animation", "edtech", "email"),
    ("Google Ads", "dental", "email"), ("Meta ads agency", "med-spas", "email"), ("guest posting", "marketing-saas", "email"),
    ("creative agency", "outdoor-gear", "email"), ("filmmaking", "wineries", "email"),
]

NAMEK = B.NAME
SAYK = B.say
LONG_REL = ["video-factory-3", "video-factory-4"]
SHORT_REL = "video-factory-5"


CLIENT_VOL = {"video editing": "79K", "copywriting": "14K", "social media marketing": "9K", "web development": "7.9K",
              "web design": "7.8K", "SEO": "6.5K", "graphic design": "6.5K", "app development": "5.4K", "thumbnail design": "12.6K",
              "clipping": "8.8K", "local SEO": "5.8K", "AI voice agents": "5.1K", "UGC ads": "5K", "ecommerce website development": "5K",
              "cybersecurity companies": "4.1K", "photography": "4.1K", "digital marketing agency": "8.9K", "AI real estate staging": "28K",
              "growth ops": "6.2K", "AI ads": "4.6K", "AI video": "4.4K", "gaming video editing": "4K"}


SMALL = {"a", "an", "the", "for", "of", "on", "in", "to", "and", "or", "from", "with", "vs", "by", "at"}


def title_case(t):
    """YouTube title case: every word capitalised except small words; AI, B2B, LinkedIn kept as written."""
    w = t.split(" ")
    return " ".join(x if (k and x.lower() in SMALL) or not x[:1].islower() else x[0].upper() + x[1:] for k, x in enumerate(w))


def an(word):
    return "an" if word[:1].lower() in "aeiou" else "a"


def ideas():
    out = []
    for kw, vol, title, kind, action in HEAD:
        out.append(dict(family="head", keyword=kw, volume=vol, title=title, kind=kind, action=action))
    for kw, vol, title, kind, ind in HEAD_IND:
        out.append(dict(family="head", industry=ind, keyword=kw, volume=vol, title=title, kind=kind,
                        action=(kw[7:] if kw.startswith("how to ") else f"get {kw}")))
    for c, kind in ALT:
        out.append(dict(family="alt", keyword=f"{c.lower()} alternative", volume="", title=ALT_TITLE[kind].format(c=c),
                        kind=kind, action=f"get company {NAMEK[kind]}s without {c}"))
    old = list(G.IND)[:40]
    new = list(G.IND)[40:]
    for ind in new:
        L, l, kw = G.IND[ind]["label"], G.IND[ind]["label"].lower(), G.IND[ind]["kw"]
        for kind, t, k in NEW_IND_LONGS:
            out.append(dict(family="industry", industry=ind, keyword=k.format(l=l, kw=kw), volume="", title=t.format(L=L, l=l),
                            kind=kind, action=f"find {l} companies' {NAMEK[kind]}s"))
    for ind in old:
        L, l = G.IND[ind]["label"], G.IND[ind]["label"].lower()
        for kind, t, k in OLD_IND_LONGS:
            out.append(dict(family="industry", industry=ind, keyword=k.format(l=l), volume="", title=t.format(L=L, l=l),
                            kind=kind, action=f"find {l} companies' {NAMEK[kind]}s"))
    for svc, ind, kind in CLIENTS:
        L = G.IND[ind]["label"].lower()
        out.append(dict(family="clients", industry=ind, keyword=f"how to find clients for {svc.lower()}", volume=CLIENT_VOL.get(svc, ""),
                        title=f"How to Find Clients for {svc[0].upper() + svc[1:]} (Free Lead List)", kind=kind,
                        action=f"find clients for {svc if svc.isupper() or svc[:2].isupper() else svc.lower()}",
                        pitch=f"{L} companies"))
    for i, x in enumerate(out):
        x["title"] = G.re.sub(r"\b(Company|Companies) (Company|Companies)\b", r"\2", title_case(x["title"]))
        x["slug"] = "i5-" + G.re.sub(r"[^a-z0-9]+", "-", x["title"].lower()).strip("-")[:60].rstrip("-")
    seen = collections.Counter(x["slug"] for x in out)
    assert all(n == 1 for n in seen.values()), [s for s, n in seen.items() if n > 1]
    return out


USED = collections.Counter()
_FULL = {}


def full_ok(c):
    if c not in _FULL:
        vals = {k: G.best(G.OPS[k]["op"], c) for k in G.OPS}
        _FULL[c] = all(v and not G.check(G.OPS[k]["op"], c, v) for k, v in vals.items())
    return _FULL[c]


def pick(idea, rr):
    """(main company, industry for the CSV). Industry ideas stay in their industry;
    head/alt ideas rotate through every industry that has a CSV for that lookup."""
    kind = idea["kind"]
    if idea.get("industry"):
        inds = [idea["industry"]]
    else:
        inds = rr[kind]
        rr[kind] = inds[1:] + inds[:1]
    for ind in inds:
        cos = [c for c in G.IND[ind]["companies"] if full_ok(c)]
        good = G.good(G.OPS[kind]["op"], G.IND[ind]["companies"])
        cos = [c for c in cos if len([x for x in good if x != c]) >= 5]
        if cos:
            c = min(cos, key=lambda c: (USED[c], G.IND[ind]["companies"].index(c)))
            USED[c] += 1
            return c, ind
    return None, None


def long_scenario(idea, company, ind, rel):
    slug = idea["slug"]
    sc = B.build(slug, idea["title"], idea["kind"], company, ind, idea["keyword"])
    (HERE / "scenarios" / f"best-{slug}.json").unlink()
    kind, nm = idea["kind"], NAMEK[idea["kind"]]
    main = sc["mocks"]["byType"][G.OPS[kind]["op"]][company]
    act = idea["action"]
    sc["series"] = "ideas500"
    sc["release"] = rel
    sc["family"] = idea["family"]
    sc["cover"] = f"In this video we are going to see how to {act} using LinkFinder AI."
    sc["coverSub"] = idea["title"].split(":")[0].split("(")[0].strip()
    sc["payoff"] = (f"That's {company}'s real {nm}: {SAYK(kind, main)}, found in about three seconds. "
                    + (f"If you sell to {idea['pitch']}, this is how your client list gets built. " if idea.get("pitch") else "")
                    + "Go to the first link in the description to try it yourself.")
    sc["outro"] = f"That's how to {act}, for one company or a whole list. Your next step: open the first link in the description and run your own list."
    sc["tags"] = list(dict.fromkeys([idea["keyword"], idea["title"].split("(")[0].split(":")[0].strip().lower(),
                                     f"find company {nm}", "lead generation", "b2b leads", "LinkFinder AI"]))
    top = idea["title"].split("(")[0].split(":")[0].strip().upper()
    sc["thumb"] = {"style": ["white", "card", "banner", "flow", "number", "sheet"][len(slug) % 6], "top": top[:24]}
    sc["description"] = sc["description"].replace(sc["description"].split("\n\n")[0], f"{idea['title']}: how to {act}, step by step, with real results.", 1)
    return sc


def short_scenario(idea, company, main):
    kind = idea["kind"]
    B.MORE["open"] = False
    st = B.lookup(kind, company, main, True, False)
    st[0]["narration"] = {"email": "Open More searches, pick company contact email.", "phone": "Pick Phone number, then company name.",
                          "website": "Pick Company website.", "linkedin": "Open More searches, pick company LinkedIn page."}[kind]
    st[1]["narration"] = f"Type {company}. Enrich."
    st.append({"narration": f"There it is: {SAYK(kind, main)}. Link in the description to try it free.",
               "do": [{"waitText": B.wait(kind, main)}, {"hover": {"text": B.wait(kind, main)}}], "tail": 1.5})
    for i, s in enumerate(st):
        s["id"] = f"s{i + 2:02d}"
    slug = idea["slug"].replace("i5-", "i5s-", 1)
    cap = idea["title"].split("(")[0].split(":")[0].strip().upper()
    utm = f"utm_source=youtube&utm_medium=short&utm_campaign={slug}"
    hook = f"How to {idea['action']}, in twenty seconds."
    return {
        "slug": slug, "format": "short", "title": idea["title"].split("(")[0].strip() + " #shorts", "keyword": idea["keyword"],
        "payoff": hook, "shortCaption": cap[:40],
        "mocks": {"credits": 5000, "singleDelayMs": 2200, "bulkDelayMs": 650, "byInput": {company: main},
                  "_source": "Real results from the LinkFinder AI API (data/lookups.json), checked by tools/gen360.py"},
        "setup": [{"click": {"text": "I just need one lookup for now"}}], "steps": st,
        "tags": [idea["keyword"], f"find company {NAMEK[kind]}", "LinkFinder AI", "shorts"],
        "description": f"{hook}\n\nTry LinkFinder AI free: https://linkfinderai.com/{G.OPS[kind]['page']}?{utm}\n\nThe values on screen are real LinkFinder AI results.\n#shorts",
        "thumb": {"style": "white", "top": cap[:22]},
        "cover": "", "coverSub": "", "outro": "", "outroHeadline": "", "outroSub": "",
        "series": "ideas500", "release": SHORT_REL,
    }


def seed_used():
    """Companies already on screen as the main subject (best series) go to the back of the queue."""
    for row in B.SERIES:
        USED[row[3]] += 1


def main(write=True, n_shorts=120):
    seed_used()
    ids = ideas()
    rr = {k: [i for i in G.IND if len(G.good(G.OPS[k]["op"], G.IND[i]["companies"])) >= 6] for k in G.OPS}
    made, skipped = [], []
    for idea in ids:
        company, ind = pick(idea, rr)
        if not company:
            skipped.append({"slug": idea["slug"], "why": "no company with checked data yet"})
            continue
        idea.update(company=company, csvIndustry=ind)
        if write:
            rel = LONG_REL[0] if len(made) < 300 else LONG_REL[1]
            try:
                sc = long_scenario(idea, company, ind, rel)
            except SystemExit as e:
                skipped.append({"slug": idea["slug"], "why": str(e)})
                USED[company] -= 1
                continue
            (HERE / "scenarios" / f"{idea['slug']}.json").write_text(json.dumps(sc, indent=2, ensure_ascii=False) + "\n")
            idea["main"] = sc["mocks"]["byType"][G.OPS[idea["kind"]]["op"]][company]
        made.append(idea)
    # shorts: the measured-volume head ideas first, then the rest in plan order
    order = sorted(made, key=lambda x: (x["family"] != "head", not x.get("volume"), made.index(x)))
    for idea in order[:n_shorts]:
        idea["short"] = idea["slug"].replace("i5-", "i5s-", 1)
        if write:
            ss = short_scenario(idea, idea["company"], idea["main"])
            (HERE / "scenarios" / f"{ss['slug']}.json").write_text(json.dumps(ss, indent=2, ensure_ascii=False) + "\n")
    (HERE / "data" / "ideas500.json").write_text(json.dumps({"_note": __doc__.strip().splitlines()[0], "ideas": made, "skipped": skipped},
                                                            indent=1, ensure_ascii=False) + "\n")
    fam = collections.Counter(x["family"] for x in made)
    print(f"ideas {len(ids)}, made {len(made)} {dict(fam)}, skipped {len(skipped)}, shorts {sum(1 for x in made if x.get('short'))}")
    print("most used companies:", USED.most_common(5))
    return made, skipped


if __name__ == "__main__":
    main(write="--plan" not in sys.argv)
