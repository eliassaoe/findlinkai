"""YouTube Shorts aimed at what people actually search (owner, 13 Nov 2026:
"des use cases, des find this from that, du YouTube SEO, pas du viral").

Every short = one searched keyword (vidIQ keyword research, volume noted in
`keyword`), title built on it, the real app doing that exact job.
Two shapes, both cut from a long scenario's UI steps:
  single  pick the lookup, type one input, the result
  bulk    pick the lookup, upload a CSV, rows fill in, N out of N
Values are real LinkFinder AI results (byInput).

    python3 video_factory/tools/seo_shorts.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
SC = HERE / "scenarios"
CTA = "Link in the description to try it free."


def load(slug):
    return json.loads((SC / f"{slug}.json").read_text())


def split(base):
    S = base["steps"]
    ti = next(i for i, s in enumerate(S) if any("type" in d for d in s["do"]))
    wi = next(i for i, s in enumerate(S) if any("waitText" in d for d in s["do"]))
    ui = next(i for i, s in enumerate(S) if any(d.get("click", {}).get("text") == "Upload CSV (bulk)" for d in s["do"]))
    ei = next(i for i, s in enumerate(S) if any("scroll" in d for d in s["do"]))
    return S[:ti], S[ti:wi + 1], S[ui:ei + 1]


def cp(x):
    return json.loads(json.dumps(x))


def write(slug, spec, steps, by, extra=None):
    base = load(spec["base"])
    for i, s in enumerate(steps):
        s["id"] = f"s{i + 2:02d}"
    steps[-1]["tail"] = 1.5
    out = {
        "slug": slug, "format": "short", "title": spec["title"], "keyword": spec["keyword"],
        "payoff": spec["hook"], "shortCaption": spec["caption"],
        "mocks": {**{k: v for k, v in base["mocks"].items() if k != "byInput"}, "byInput": by,
                  "_source": spec.get("source", base["mocks"].get("_source", ""))},
        "setup": base.get("setup", []), "steps": steps,
        "tags": spec["tags"] + ["LinkFinder AI", "shorts"],
        "description": f"{spec['hook']}\n\nTry LinkFinder AI free: {spec['page']}?utm_source=youtube&utm_medium=short&utm_campaign={slug}\n\nThe values on screen are real LinkFinder AI results.\n#shorts",
        "thumb": {"style": "white", "top": spec["caption"][:22]},
        "cover": "", "coverSub": "", "outro": "", "outroHeadline": "", "outroSub": "",
    }
    if extra:
        out.update(extra)
    (SC / f"{slug}.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")


def single(slug, spec):
    base = load(spec["base"])
    pick, run, _ = split(base)
    steps = []
    for s, say in zip(pick, spec["pick_say"]):
        s = cp(s); s["narration"] = say; steps.append(s)
    for s in cp(run):
        for d in s["do"]:
            if "type" in d:
                sel = d["type"]["selector"]
                d["type"]["value"] = spec["inputs"].get(sel, d["type"]["value"])
            if "waitText" in d:
                d["waitText"] = spec["wait"]
            if "hover" in d and "text" in d["hover"]:
                d["hover"]["text"] = spec["wait"]
        steps.append(s)
    says = spec["run_say"]
    for s, say in zip(steps[len(pick):], says):
        s["narration"] = say
    steps[-1]["narration"] += " " + CTA
    write(slug, spec, steps, spec["by"])


def bulk(slug, spec):
    base = load(spec["base"])
    pick, _, blk = split(base)
    by = spec["by"]
    reuse = by == base["mocks"]["byInput"]  # the long video's own list: keep its CSV
    if reuse:
        csvname = next(d["upload"]["file"] for s in blk for d in s["do"] if "upload" in d)
        n = len((HERE / "assets" / csvname).read_text().strip().splitlines()) - 1
    else:
        n = len(by)
        csv = HERE / "assets" / f"{slug}.csv"
        csv.write_text("company_name\n" + "\n".join(by) + "\n")
        csvname = csv.name
    steps = []
    for s, say in zip(pick, spec["pick_say"]):
        s = cp(s); s["narration"] = say; steps.append(s)
    blk = cp(blk)
    blk[0]["do"] = [d for d in blk[0]["do"] if "scrollBy" not in d]
    for s in blk:
        for d in s["do"]:
            if "upload" in d:
                d["upload"]["file"] = csvname
            if d.get("click", {}).get("name", "").startswith("Process "):
                d["click"]["name"] = f"Process {n} items"
            if "waitText" in d:
                d["waitText"] = spec["last"]
    say = ["Switch to Upload CSV.", spec.get("drop", "Drop in your list. One column of company names."),
           "You see every row before anything runs.", f"Process {n} items.", spec["fill"],
           f"{n} out of {n} found. Export to CSV. " + CTA]
    for s, x in zip(blk, say):
        s["narration"] = x
    steps += blk
    write(slug, spec, steps, by, {"payoffScrollTo": {"selector": "th:has-text('Status')"}, "payoffOffset": 250})


PHONE_PICK = ["Pick Phone number.", "Choose company name."]
WEB_PICK = ["Pick Company website."]
LI_PICK = ["Pick LinkedIn profile.", "Name plus company."]
MAIL_PICK = ["Open More searches.", "Pick company contact email."]
LIPAGE_BASE = "company-linkedin-pages-bulk"

DTC_EMAILS = {"Allbirds": "office@allbirds.com", "Glossier": "info@glossier.com", "Bombas": "sales@bombas.com",
              "Warby Parker": "info@warbyparker.com", "Gymshark": "contact@gymshark.com"}
SAAS_EMAILS = {"Zendesk": "support@zendesk.com", "Asana": "sales@asana.com", "Mailchimp": "hello@mailchimp.com",
               "Stripe": "sales@stripe.com", "Atlassian": "sales@atlassian.com", "Shopify": "info@shopify.com", "Zoom": "info@zoom.us"}
PM_PHONES = {"Greystar": "843.579.9400", "FirstService Residential": "704.527.2314", "Asset Living": "+1 713 7825800",
             "Lincoln Property Company": "214.740.3300", "Bozzuto": "(202) 966-8665"}

SPECS = [
    ("seo-cold-email-leads", bulk, dict(
        keyword="how to find cold email leads (11.8K/mo, comp 12)", base="company-contact-emails-bulk",
        title="How to Find Cold Email Leads (Company Emails in Bulk)",
        hook="Here's how to find cold email leads: a list of companies in, a contact email for each one out.",
        caption="FIND COLD EMAIL LEADS", pick_say=MAIL_PICK, by=SAAS_EMAILS, last="info@zoom.us",
        fill="Each company gets its contact inbox: sales, support, hello.",
        tags=["how to find cold email leads", "cold email leads", "find company emails", "cold email"],
        page="https://linkfinderai.com/company-email-finder")),
    ("seo-b2b-email-list", bulk, dict(
        keyword="how to build a b2b email list (9.5K/mo, comp 27)", base="company-contact-emails-bulk",
        title="How to Build a B2B Email List From Company Names",
        hook="How to build a B2B email list in thirty seconds, starting from nothing but company names.",
        caption="BUILD A B2B EMAIL LIST", pick_say=MAIL_PICK, by=DTC_EMAILS, last="contact@gymshark.com",
        fill="The emails come in row by row.",
        tags=["how to build a b2b email list", "b2b email list", "build an email list", "email list building"],
        page="https://linkfinderai.com/company-email-finder")),
    ("seo-shop-email", single, dict(
        keyword="how to find an email of a shop through google (5.2K/mo, comp 10)", base="company-contact-emails-bulk",
        title="How to Find the Email of Any Shop or Brand (No Google Digging)",
        hook="Need a shop's email? Skip the Google digging. Type the brand, get the inbox.",
        caption="FIND A SHOP'S EMAIL", pick_say=MAIL_PICK, inputs={"input[placeholder*='Tesla']": "Glossier"},
        wait="info@glossier.com", by={"Glossier": "info@glossier.com"},
        run_say=["Type the brand. Glossier.", "Enrich.", "There's the inbox: info at glossier dot com."],
        tags=["how to find email of a shop", "find brand email", "find business email", "how to find brand email"],
        page="https://linkfinderai.com/company-email-finder")),
    ("seo-property-management-leads", bulk, dict(
        keyword="how to find property management companies leads (5.1K/mo, comp 16)", base="company-phone-numbers-bulk",
        title="How to Find Property Management Company Leads (Phone Numbers)",
        hook="How to find property management company leads, with a phone number for each one.",
        caption="PROPERTY MANAGEMENT LEADS", pick_say=PHONE_PICK, by=PM_PHONES, last="966-8665",
        fill="Greystar, Lincoln Property, Asset Living: each gets its office line.",
        tags=["property management leads", "how to find property management companies leads", "property management cold calling", "real estate leads"],
        page="https://linkfinderai.com/company-phone-finder",
        source="Real results of find_company_phone (LinkFinder AI), 13 Nov 2026; RPM Living returned a fake 555 number and was left out (logged)")),
    ("seo-cold-calling-numbers", single, dict(
        keyword="how to find phone number for cold calling", base="company-phone-numbers-bulk",
        title="How to Find Company Phone Numbers for Cold Calling",
        hook="Here's how I find a company's phone number for cold calling, from just its name.",
        caption="PHONE NUMBERS FOR COLD CALLING", pick_say=PHONE_PICK, inputs={"input[placeholder*='Tesla']": "Greystar"},
        wait="579.9400", by={"Greystar": "843.579.9400"},
        run_say=["Type the company. Greystar.", "Enrich.", "Their main line: 843 579 9400. One credit."],
        tags=["phone number for cold calling", "cold calling", "find company phone number", "b2b phone numbers"],
        page="https://linkfinderai.com/company-phone-finder")),
    ("seo-real-estate-leads", bulk, dict(
        keyword="how to find email real estate client / real estate leads (5.2K/mo, comp 11)", base="real-estate-brokerage-phone-numbers",
        title="How to Find Real Estate Leads in Bulk (Brokerage Phone Numbers)",
        hook="How to find real estate leads in bulk: every brokerage on your list, with its phone number.",
        caption="REAL ESTATE LEADS IN BULK", pick_say=PHONE_PICK,
        by=load("real-estate-brokerage-phone-numbers")["mocks"]["byInput"], last=None,
        fill="Each brokerage gets its office number.",
        tags=["how to find real estate leads", "real estate leads", "real estate brokerage phone numbers", "real estate cold calling"],
        page="https://linkfinderai.com/company-phone-finder")),
    ("seo-company-name-to-domain", bulk, dict(
        keyword="company name to domain (comp 11) / find website from company name", base="company-websites-from-list",
        title="Company Name to Domain: Find Websites From a List of Names",
        hook="Company name to domain, for a whole list at once. Here's how.",
        caption="COMPANY NAME TO DOMAIN", pick_say=WEB_PICK, by=load("company-websites-from-list")["mocks"]["byInput"],
        last="atlassian.com", fill="The domains fill in, row by row.",
        tags=["company name to domain", "find website from company name", "company domain finder", "find company domain"],
        page="https://linkfinderai.com/company-url-finder")),
    ("seo-website-from-company-name", single, dict(
        keyword="how to find website from company name (comp 23)", base="company-websites-from-list",
        title="How to Find a Website From a Company Name",
        hook="Only have a company name? Here's how to get its official website.",
        caption="WEBSITE FROM COMPANY NAME", pick_say=WEB_PICK, inputs={"input[placeholder*='Tesla']": "Bombas"},
        wait="bombas.com", by={"Bombas": "bombas.com"},
        run_say=["Type the name. Bombas.", "Enrich.", "Official site: bombas dot com. One credit."],
        tags=["how to find website from company name", "find company website", "company website finder"],
        page="https://linkfinderai.com/company-url-finder")),
    ("seo-dtc-brand-leads", bulk, dict(
        keyword="how to find dtc brands leads (8K/mo, comp 14)", base="ecommerce-brand-websites",
        title="How to Find DTC Brand Leads (Websites in Bulk)",
        hook="How to find DTC brand leads: drop in the brand names, get every website back.",
        caption="FIND DTC BRAND LEADS", pick_say=WEB_PICK, by=load("ecommerce-brand-websites")["mocks"]["byInput"],
        last=None, fill="Warby Parker, Glossier, Bombas: the domains fill in.",
        tags=["how to find dtc brands leads", "dtc brands", "ecommerce leads", "find brand websites"],
        page="https://linkfinderai.com/company-url-finder")),
    ("seo-leads-from-linkedin", bulk, dict(
        keyword="how to find leads from linkedin (5.2K/mo, comp 11)", base="startup-founder-linkedin-profiles",
        title="How to Find Leads From LinkedIn (Profiles in Bulk From Names)",
        hook="How to find leads from LinkedIn without searching one by one: names in, profiles out.",
        caption="FIND LEADS FROM LINKEDIN", pick_say=LI_PICK, by=load("startup-founder-linkedin-profiles")["mocks"]["byInput"],
        last=None, drop="Drop in your list: names and companies.", fill="Each lead gets their LinkedIn profile.",
        tags=["how to find leads from linkedin", "linkedin leads", "linkedin lead generation", "find linkedin profiles"],
        page="https://linkfinderai.com/linkedin-url-finder", csv_cols=None)),
    ("seo-find-someone-on-linkedin", single, dict(
        keyword="how to find someone on linkedin", base="linkedin-profiles-from-names",
        title="How to Find Someone on LinkedIn With Just a Name and Company",
        hook="How to find someone on LinkedIn when all you have is a name and a company.",
        caption="FIND SOMEONE ON LINKEDIN", pick_say=LI_PICK,
        inputs={"input[placeholder*='Sarah Johnson']": "Jensen Huang", "input[placeholder='e.g., Salesforce']": "Nvidia"},
        wait="jenhsunhuang", by={"Jensen Huang · Nvidia": "https://www.linkedin.com/in/jenhsunhuang", "Jensen Huang": "https://www.linkedin.com/in/jenhsunhuang"},
        run_say=["Type the name.", "Then the company.", "Enrich.", "There's the profile. One credit."],
        tags=["how to find someone on linkedin", "find linkedin profile by name", "linkedin search", "linkedin profile finder"],
        page="https://linkfinderai.com/linkedin-url-finder")),
    ("seo-b2b-leads-linkedin-pages", bulk, dict(
        keyword="how to find b2b leads (5.9K/mo, +99%, comp 11)", base=LIPAGE_BASE,
        title="How to Find B2B Leads: Every Company's LinkedIn Page in Bulk",
        hook="How to find B2B leads fast: a list of companies in, every LinkedIn page out.",
        caption="FIND B2B LEADS", pick_say=["Open More searches.", "Pick company LinkedIn page."],
        by=load(LIPAGE_BASE)["mocks"]["byInput"], last=None, fill="The LinkedIn pages come in, row by row.",
        tags=["how to find b2b leads", "b2b leads", "b2b lead generation", "linkedin company pages"],
        page="https://linkfinderai.com/company-linkedin-finder")),
]


def main():
    for slug, fn, spec in SPECS:
        if fn is bulk and spec.get("last") is None:
            src = load(spec["base"])
            spec["last"] = next(d["waitText"] for s in src["steps"] for d in s["do"] if "waitText" in d and s["id"] != src["steps"][0]["id"]
                                and any(x.get("click", {}).get("text") == "Upload CSV (bulk)" for t in src["steps"] for x in t["do"]))
            # the bulk wait of the long scenario is its LAST waitText
            spec["last"] = [d["waitText"] for s in src["steps"] for d in s["do"] if "waitText" in d][-1]
            if spec["base"] in ("startup-founder-linkedin-profiles",):
                spec["csv_cols"] = None
        fn(slug, spec)
        print(slug)


if __name__ == "__main__":
    main()
