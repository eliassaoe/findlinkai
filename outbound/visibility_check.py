#!/usr/bin/env python3
"""
Runs the free AI visibility check the AEO campaign promises, and writes the
report you send back.

    company + domain + category
        -> the buying questions a real buyer would ask
        -> asked across several models
        -> who got named, in what order, and where they placed
        -> a report you can paste into a reply

WHY THIS FILE EXISTS
--------------------
The AEO campaign's whole offer is "I'll run the buying questions for your
category through ChatGPT, Perplexity, Gemini and Claude and send you back
exactly what came out." That is a promise to do a specific piece of work.
If a reply comes in and there is nothing that does it, the campaign is
writing cheques the business cannot cash.

WHAT IT WILL NOT DO
-------------------
It does not score, grade, or predict. It reports what the models said, with
the raw text kept alongside the parsed list so you can show your working.
Nobody can currently measure a lift in AI visibility honestly -- the
tracking is too young and too unstable -- so this tool deliberately has no
"AI visibility score" to wave around. The finding IS the deliverable: you
were named third, or you were not named at all.

COST
----
A few cents per prospect. QUESTIONS x MODELS calls, short completions.

SECRETS
-------
    OPENROUTER_API_KEY      or --provider openai with OPENAI_API_KEY
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request

OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions"
OPENAI_API = "https://api.openai.com/v1/chat/completions"

# Several models, because "what the AI says" is not one answer. A prospect
# named by one and missed by three is the interesting case, and averaging
# that away would hide the finding.
DEFAULT_MODELS = [
    "openai/gpt-4o-mini",
    "anthropic/claude-3.5-haiku",
    "google/gemini-flash-1.5",
    "perplexity/sonar",
]

# The questions a buyer actually types. Not "what is X" -- that returns an
# encyclopaedia entry and names nobody.
QUESTION_TEMPLATES = [
    "What are the best {category} tools?",
    "What is the best {category} software for a small B2B SaaS company?",
    "Which {category} tool should I buy in 2026?",
    "What are the top alternatives to the leading {category} tools?",
]

ASK = """You are answering a buyer's question, exactly as you normally would.

Question: "{question}"

List the products you would actually recommend, most recommended first.
Reply with ONLY a JSON array of product names. No prose, no markdown fence.
Example: ["Product A","Product B","Product C"]"""


def _post(url, payload, headers, timeout=90):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **headers}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:200]}") from None
    except Exception as e:
        raise RuntimeError(f"{type(e).__name__}: {e}") from None


def ask_model(key, provider, model, question):
    url = OPENROUTER_API if provider == "openrouter" else OPENAI_API
    body = _post(url, {"model": model, "temperature": 0,
                       "messages": [{"role": "user",
                                     "content": ASK.format(question=question)}]},
                 {"Authorization": f"Bearer {key}"})
    return body["choices"][0]["message"]["content"].strip()


def parse_products(text):
    """Model output -> list of product names. Tolerates a stray fence."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("```")[1] if "```" in t[3:] else t.strip("`")
        t = t[4:] if t.lower().startswith("json") else t
    try:
        got = json.loads(t[t.index("["):t.rindex("]") + 1])
    except Exception:
        return []
    return [str(p).strip() for p in got if isinstance(p, (str, int)) and str(p).strip()]


def norm(s):
    return "".join(c for c in (s or "").lower() if c.isalnum())


def placement(products, company, domain):
    """1-based position of the prospect, or None. Same matcher as the campaign
    builder: a bare-name substring test matches 'Rec' inside 'Recurly', so
    require a real token match or the domain's own root."""
    root = norm((domain or "").split(".")[0])
    target = norm(company)
    for i, p in enumerate(products, 1):
        np = norm(p)
        if not np:
            continue
        if np == target or np == root:
            return i
        # allow "Ketch" to match "Ketch Privacy Platform", but only when the
        # candidate is long enough that the match is not an accident
        if len(target) >= 5 and (target in np or np in target):
            return i
        if len(root) >= 5 and (root in np or np in root):
            return i
    return None


def check(key, provider, models, company, domain, category, sleep):
    runs, named_in = [], 0
    for model in models:
        for tpl in QUESTION_TEMPLATES:
            q = tpl.format(category=category)
            try:
                raw = ask_model(key, provider, model, q)
            except RuntimeError as e:
                runs.append({"model": model, "question": q, "error": str(e),
                             "products": [], "place": None})
                time.sleep(sleep)
                continue
            products = parse_products(raw)
            place = placement(products, company, domain)
            if place:
                named_in += 1
            runs.append({"model": model, "question": q, "raw": raw,
                         "products": products, "place": place})
            time.sleep(sleep)
    answered = [r for r in runs if not r.get("error")]
    return {"company": company, "domain": domain, "category": category,
            "runs": runs, "answers": len(answered), "named_in": named_in}


def report(res):
    """The thing you paste into a reply. Plain text on purpose."""
    L = [f"AI visibility check — {res['company']} ({res['domain']})",
         f"Category asked about: {res['category']}", ""]
    if not res["answers"]:
        L += ["Every model call failed, so there is nothing to report yet.",
              "This is a problem on our side, not a finding about you."]
        return "\n".join(L)

    L.append(f"Asked {res['answers']} buying questions across "
             f"{len({r['model'] for r in res['runs']})} assistants.")
    L.append(f"{res['company']} was named in {res['named_in']} of {res['answers']}.")
    L.append("")

    if res["named_in"] == 0:
        L += ["Not named once.", "",
              "That is not a verdict on the product. It means the pages that",
              "answer these questions belong to somebody else.", ""]
    else:
        places = [r["place"] for r in res["runs"] if r.get("place")]
        L += [f"Best placement: #{min(places)}. Typical: #{sorted(places)[len(places)//2]}.", ""]

    L.append("What actually came back:")
    L.append("")
    for r in res["runs"]:
        if r.get("error"):
            L.append(f'  "{r["question"]}" [{r["model"]}] — call failed: {r["error"]}')
            continue
        top = ", ".join(r["products"][:5]) or "(nothing parseable)"
        mark = f"#{r['place']}" if r["place"] else "not named"
        L.append(f'  "{r["question"]}"')
        L.append(f"      {r['model']} → {mark}")
        L.append(f"      named: {top}")
    L += ["", "Raw answers kept alongside this, happy to send them.",
          "— Eliasse, LinkFinder AI"]
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--company"); ap.add_argument("--domain"); ap.add_argument("--category")
    ap.add_argument("--input", help="CSV with company,domain,category to run in bulk")
    ap.add_argument("--out-dir", default="outbound/checks")
    ap.add_argument("--provider", choices=["openrouter", "openai"], default="openrouter")
    ap.add_argument("--models", default=",".join(DEFAULT_MODELS))
    ap.add_argument("--sleep", type=float, default=1.0)
    ap.add_argument("--limit", type=int, default=10)
    args = ap.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY" if args.provider == "openrouter"
                         else "OPENAI_API_KEY")
    if not key:
        sys.exit("Set the provider key in the environment. Never in a file in this repo.")

    models = [m.strip() for m in args.models.split(",") if m.strip()]

    if args.input:
        rows = list(csv.DictReader(open(args.input)))[:args.limit]
    elif args.company and args.category:
        rows = [{"company": args.company, "domain": args.domain or "",
                 "category": args.category}]
    else:
        sys.exit("Give me --company and --category, or --input with a CSV.")

    os.makedirs(args.out_dir, exist_ok=True)
    for row in rows:
        company = (row.get("company") or row.get("company_name") or "").strip()
        category = (row.get("category") or "").strip()
        domain = (row.get("domain") or row.get("website") or "").strip()
        if not company or not category:
            print(f"  - skipped {company or domain}: needs company and category")
            continue
        print(f"  · {company} ({category})")
        res = check(key, args.provider, models, company, domain, category, args.sleep)
        slug = norm(domain or company) or "check"
        with open(os.path.join(args.out_dir, f"{slug}.txt"), "w") as f:
            f.write(report(res))
        with open(os.path.join(args.out_dir, f"{slug}.json"), "w") as f:
            json.dump(res, f, indent=1)
        print(f"    named in {res['named_in']}/{res['answers']} → "
              f"{args.out_dir}/{slug}.txt")


if __name__ == "__main__":
    main()
