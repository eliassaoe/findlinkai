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
    (HERE / "data" / "plan360.json").write_text(json.dumps(plan, indent=1))
    (HERE / "data" / "rejected.json").write_text(json.dumps(REJECTED, indent=1, ensure_ascii=False))
    print(len(plan), "videos;", len(REJECTED), "values rejected")


if __name__ == "__main__":
    main()
