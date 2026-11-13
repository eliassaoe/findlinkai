"""The "Best X (Free & Verified)" series: the format of the channel's best video
(owner, 13 Nov 2026: "Best LinkedIn Email Finder (Free & Verified)", 317 views, 4:30).

Shape, copied from that video's transcript:
  0:00  the result first + "the best ... that's actually free" + first link
  0:20  the problem (tools that guess / wrong data)
  0:40  slow "Step one, step two" on ONE company, chaining lookups:
        website -> LinkedIn page -> phone -> the video's main lookup last
  2:40  the same main lookup on a CSV
  3:30  where else it runs (Google Sheets, API & MCP, History), close on the promise
Company-level data only (no person's email or phone on screen).

    python3 video_factory/tools/best_series.py
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "tools"))
import gen360 as G  # noqa: E402

PICK = {
    "website": [{"click": {"text": "Company website", "exact": True}}],
    "phone": [{"click": {"text": "Phone number", "exact": True}}, {"click": {"text": "Company name (main line)"}}],
    "email": [{"click": {"text": "More searches"}}, {"click": {"text": "A company's contact email, from its name"}}],
    "linkedin": [{"click": {"text": "More searches"}}, {"click": {"text": "A company's LinkedIn page, from its name"}}],
}
NAME = {"website": "company website", "phone": "phone number", "email": "contact email", "linkedin": "LinkedIn company page"}
COST = {"website": "one credit", "phone": "one credit", "email": "five credits", "linkedin": "one credit"}
SEL = "input[placeholder*='Tesla']"


def say(kind, v):
    if kind == "phone":
        d = re.sub(r"\D", "", v)[-10:]
        return f"{d[:3]}, {d[3:6]}, {d[6:]}"
    if kind == "email":
        return v.replace("@", " at ").replace(".", " dot ")
    if kind == "website":
        return G.dom(v).replace(".", " dot ")
    return "their official LinkedIn page"


def wait(kind, v):
    return G.OPS[kind]["wait"](v)


MORE = {"open": False}  # "More searches" is a toggle: click it only the first time


def picks_for(kind):
    p = PICK[kind]
    if p[0].get("click", {}).get("text") == "More searches":
        if MORE["open"]:
            return p[1:]
        MORE["open"] = True
    return p


def lookup(kind, company, v, first, slow):
    """Steps for one lookup. first=True: no Change click (start screen already showing)."""
    st = []
    pre = [] if first else [{"scrollBy": -1200}, {"click": {"text": "Change"}}]
    picks = picks_for(kind)
    if slow and len(picks) < len(PICK[kind]):
        picks = [{"pause": 0.3}] + picks
    if slow:
        st.append({"narration": f"Step one. {'Click Change, then ' if not first else ''}click {'More searches' if kind in ('email', 'linkedin') else NAME[kind].capitalize() if kind != 'phone' else 'Phone number'}.",
                   "do": pre + [picks[0]]})
        if len(picks) > 1:
            st.append({"narration": f"Step two. Pick {('a company' + chr(39) + 's ' + NAME[kind] + ', from its name') if kind in ('email', 'linkedin') else 'Company name, main line'}. It costs {COST[kind]}.",
                       "do": [picks[1]]})
        st.append({"narration": f"Step {'three' if len(picks) > 1 else 'two'}. Type the company name: {company}.",
                   "do": [{"type": {"selector": SEL, "value": company, "clear": True}}]})
        st.append({"narration": f"Step {'four' if len(picks) > 1 else 'three'}. Click Enrich Data.",
                   "do": [{"click": {"role": "button", "name": "Enrich Data"}}]})
    else:
        st.append({"narration": f"Now the {NAME[kind]}. {'Click Change. ' if not first else ''}Pick {NAME[kind]}.",
                   "do": pre + picks})
        st.append({"narration": f"Same company, {company}. Enrich.",
                   "do": [{"type": {"selector": SEL, "value": company, "clear": True}}, {"click": {"role": "button", "name": "Enrich Data"}}]})
    return st


SERIES = [
    # slug, title, main kind, company, industry for the CSV, hook word, keyword
    ("best-company-email-finder", "Best Free Email Finder (Free & Verified)", "email", "Calendly", "saas", "free email finder"),
    ("free-email-finder-tool-2026", "Free Email Finder Tool 2026 (Company Emails in Bulk)", "email", "Brooklinen", "shopify", "free email finder tool"),
    ("best-company-phone-finder", "Best Lead Generation Tool for Phone Numbers (Free)", "phone", "Lemonade", "insurance", "lead generation tools"),
    ("free-phone-number-finder-business", "Free Phone Number Finder for Businesses 2026", "phone", "Carrier", "hvac", "free phone number finder"),
    ("best-company-website-finder", "Best Company Website Finder From a Name (Free)", "website", "Policygenius", "insurance", "find website from company name"),
    ("best-linkedin-company-page-finder", "Best LinkedIn Company Page Finder (Free & Bulk)", "linkedin", "Airtable", "saas", "linkedin company page finder"),
    ("hunter-io-alternative-free", "Email Hunter Alternative (Free & Verified)", "email", "Loom", "saas", "email hunter"),
    ("apollo-alternative-company-data", "Apollo.io Alternative: Free Company Emails and Phones", "email", "Skims", "shopify", "apollo.io"),
    ("zoominfo-alternative-free", "ZoomInfo Alternative: Free Company Phone Numbers", "phone", "Sunrun", "solar", "zoominfo alternative"),
    ("clearbit-alternative-free", "Clearbit Alternative: Free Company Enrichment", "linkedin", "Figma", "saas", "clearbit alternative"),
    ("lusha-alternative-free", "Lusha Alternative: Free Company Phone Numbers", "phone", "loanDepot", "mortgage", "lusha alternative"),
    ("rocketreach-alternative-free", "RocketReach Alternative (Free Company Emails)", "email", "Lemonade", "insurance", "rocketreach alternative"),
    ("best-b2b-contact-finder", "Best B2B Lead Generation Tool (Free & Verified)", "email", "Tinuiti", "marketing-agency", "b2b lead generation"),
    ("best-bulk-email-finder", "Best Bulk Email Finder (Free CSV Upload)", "email", "Airtable", "saas", "bulk email finder"),
    ("best-domain-finder", "Best Free Domain Finder: Company Name to Domain", "website", "Carrier", "hvac", "company name to domain"),
    ("best-cold-calling-list-builder", "Sales Prospecting Tool: Free Cold Calling List", "phone", "Brooklinen", "shopify", "sales prospecting"),
    ("best-lead-enrichment-tool", "Lead Enrichment Tool 2026 (Free & Verified)", "email", "Policygenius", "insurance", "lead enrichment"),
    ("free-b2b-data-tool-2026", "Lead Finder: Best Free Company Data Tool 2026", "phone", "Calendly", "saas", "lead finder"),
]


SPOKEN = {  # what the narrator calls the tool ("This is the best ... that's actually free")
    "apollo-alternative-company-data": "Apollo alternative", "best-b2b-contact-finder": "B2B lead generation tool",
    "best-cold-calling-list-builder": "sales prospecting tool", "best-company-phone-finder": "lead generation tool for phone numbers",
    "best-company-website-finder": "company website finder", "best-domain-finder": "domain finder",
    "best-lead-enrichment-tool": "lead enrichment tool", "best-linkedin-company-page-finder": "LinkedIn company page finder",
    "free-b2b-data-tool-2026": "lead finder", "free-email-finder-tool-2026": "free email finder tool",
    "free-phone-number-finder-business": "business phone number finder", "hunter-io-alternative-free": "Email Hunter alternative",
    "best-company-email-finder": "email finder", "best-bulk-email-finder": "bulk email finder",
    "clearbit-alternative-free": "Clearbit alternative", "lusha-alternative-free": "Lusha alternative",
    "rocketreach-alternative-free": "RocketReach alternative", "zoominfo-alternative-free": "ZoomInfo alternative",
}


def build(slug, title, kind, company, ind_key, kw):
    spoken = SPOKEN.get(slug, kw)
    MORE["open"] = False
    vals = {k: G.best(G.OPS[k]["op"], company) for k in G.OPS}
    for k, v in vals.items():
        why = G.check(G.OPS[k]["op"], company, v)
        if why:
            raise SystemExit(f"{slug}: {company} {k} rejected: {why} ({v})")
    order = [k for k in ("website", "linkedin", "phone", "email") if k != kind] + [kind]
    bulk = {c: v for c, v in G.good(G.OPS[kind]["op"], G.IND[ind_key]["companies"]).items() if c != company}
    bulk = dict(list(bulk.items())[:6])
    if len(bulk) < 5:
        raise SystemExit(f"{slug}: not enough bulk rows")
    csv = HERE / "assets" / f"best-{slug}.csv"
    csv.write_text("company_name\n" + "\n".join(bulk) + "\n")
    main = vals[kind]
    steps = [{"narration": {"email": "Most email finders don't find a company's inbox. They guess one, stitching together info at, or contact at, and hoping it exists. That's why so many cold emails bounce.",
                            "phone": "Most phone finders hand you whatever number shows up first on a search page: an office in another country, a fax line, sometimes a number that doesn't exist.",
                            "website": "Searching each company by hand gives you country sites, directories and lookalike domains. Paste the wrong one into your CRM and every lookup after it is wrong too.",
                            "linkedin": "Searching LinkedIn by hand gives you franchise pages, old pages and lookalikes. The company's real page is the one every other lookup should start from."}[kind]
                           + " LinkFinder AI looks up the real value for the company you name. Here's exactly how, one click at a time.",
              "do": [{"pause": 1.0}]}]
    first = True
    for k in order:
        slow = k == kind
        st = lookup(k, company, vals[k], first, slow)
        st.append({"narration": (f"There it is: {say(k, vals[k])}. " + ("The real one, not a guess." if slow else "")).strip(),
                   "do": [{"waitText": wait(k, vals[k])}, {"hover": {"text": wait(k, vals[k])}}], "tail": 0.6})
        steps += st
        first = False
        if slow:
            main_wait_idx = len(steps) - 1
    n = len(bulk)
    steps += [
        {"narration": "Checking companies one at a time is fine for one pitch. For a whole list, click Change, pick the same lookup, and switch to Upload CSV.",
         "do": [{"scrollBy": -1200}, {"click": {"text": "Change"}}] + picks_for(kind) + [{"click": {"text": "Upload CSV (bulk)"}}]},
        {"narration": f"Select your file. One column of company names. Ours has {n}.",
         "do": [{"upload": {"role": "button", "name": "Select File", "file": csv.name}}]},
        {"narration": "You see every row before anything runs, so you know exactly what it costs.", "do": [{"pause": 0.6}]},
        {"narration": f"Click Process {n} items.", "do": [{"click": {"role": "button", "name": f"Process {n} items"}}]},
        {"narration": f"Every row gets the exact same lookup. The {NAME[kind]}s fill in one by one.",
         "do": [{"waitText": wait(kind, list(bulk.values())[-1])}], "tail": 0.4},
        {"narration": f"{n} companies in, {n} {NAME[kind]}s out, each marked Found. Export it as a CSV in one click.",
         "do": [{"scroll": {"selector": "th:has-text('Status')", "offset": 120}}, {"hover": {"role": "button", "name": "Export"}}]},
        {"narration": "Your list already lives in Google Sheets? The add-on runs the same lookups right in the column, no export, no re-import.",
         "do": [{"pause": 0.8}]},
        {"narration": "Want it in your own tools? Click API and MCP in the top menu. Same lookup, one call, the answer comes straight back.",
         "do": [{"scrollBy": -2000}, {"hover": {"text": "API & MCP"}}]},
        {"narration": "And every lookup lands in History, so you can see what you found, when, and what it cost.",
         "do": [{"hover": {"text": "History"}}], "tail": 1.0},
    ]
    for i, s in enumerate(steps):
        s["id"] = f"s{i + 2:02d}"
    payoff_at = steps[main_wait_idx]["id"]
    by = dict(bulk)
    for k in G.OPS:
        pass
    by[company] = main  # the main lookup's value for the single run
    # the other lookups of the same company use the same input: answer by type
    mocks = {"credits": 5000, "singleDelayMs": 2400, "bulkDelayMs": 650, "byInput": by, "byType": {},
             "_source": "Real results from the LinkFinder AI API (data/lookups.json), checked by tools/gen360.py"}
    for k in G.OPS:
        mocks["byType"][G.OPS[k]["op"]] = {company: vals[k]}
    utm = f"utm_source=youtube&utm_medium=video&utm_campaign={slug}"
    page = G.OPS[kind]["page"]
    sc = {
        "slug": f"best-{slug}", "title": title, "keyword": kw,  # = file name; build.py names the MP4 after it
        "coverSub": f"The real {NAME[kind]} of any company, free",
        "cover": f"In this video we are going to see the best free way to find a company's {NAME[kind]} using LinkFinder AI.",
        "payoff": f"That's {company}'s real {NAME[kind]}: {say(kind, main)}, found in about three seconds. This is the best {spoken} that's actually free. Go to the first link in the description to try it yourself.",
        "outro": f"No more guessing. The real {NAME[kind]}, for one company or a whole list. That's why this is the best {spoken} to use today. The link is in the description.",
        "outroHeadline": f"Find {NAME[kind]}s free", "outroSub": "Free account, credits included. First link in the description.",
        "mocks": mocks, "setup": [{"click": {"text": "I just need one lookup for now"}}], "steps": steps,
        "payoffScrollTo": None,
        "tags": list(dict.fromkeys([kw, title.split("(")[0].split(":")[0].strip().lower(), f"find company {NAME[kind]}", "free email finder", "lead generation", "b2b data", "LinkFinder AI"])),
        "description": (f"{title}: the real {NAME[kind]} of any company, for one company or a whole CSV.\n\n"
                        f"Try LinkFinder AI free: https://linkfinderai.com/{page}?{utm}\n"
                        f"Get a free list of 50 leads with emails: https://linkfinderai.com/free-list?{utm}\n\n"
                        f"In this video:\n0:00 The result\n- {company}: website, LinkedIn page, phone and email, step by step\n"
                        f"- The same {NAME[kind]} lookup on a CSV of {n} companies ({COST[kind]} each)\n- Google Sheets, API & MCP, History\n\n"
                        "The values on screen are real LinkFinder AI results."),
        "thumb": {"style": "white", "top": title.split("(")[0].split(":")[0].strip().upper()[:22]},
        "series": "best", "payoffAt": payoff_at,
    }
    sc.pop("payoffScrollTo")
    (HERE / "scenarios" / f"best-{slug}.json").write_text(json.dumps(sc, indent=2, ensure_ascii=False) + "\n")
    return sc


if __name__ == "__main__":
    for row in SERIES:
        try:
            build(*row)
            print("ok", row[0])
        except SystemExit as e:
            print("SKIP", e)
