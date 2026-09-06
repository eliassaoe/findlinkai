#!/usr/bin/env python3
"""Find out why Explee returns no people, in one run.

The agent sandbox cannot reach api.explee.com (the egress policy answers 403 to
CONNECT), so this has to run from your machine:

    export EXPLEE_API_KEY=sk_explee_...        # the rotated one
    python3 probe-explee.py

It prints every request and every raw response, then a verdict. Paste the whole
output. Nothing here sends email or creates anything.

Why a ladder rather than one call: "no data" has four different causes and they
need different fixes.

  A  balance            free. Everything 402s below zero, including free calls.
  C2 search/companies   the documented body: filters.definition + page_size.
  B  nl-to-filters      free. Explee converts plain English into ITS OWN filter
                        object — so we stop guessing the body and read it.
  C  search with B      the filters Explee just handed us, used verbatim.
  D  search with ours   the exact body the n8n workflow sends.
  E  control            a deliberately broad search.

C works and D does not -> our body shape is wrong, and B printed the right one.
E works and C/D do not -> the shape is fine, the ICP is too narrow.
Nothing works        -> account or endpoint level, and the status code says which.
"""

import json
import os
import ssl
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("EXPLEE_BASE", "https://api.explee.com") + "/public/api/v1"
KEY = os.environ.get("EXPLEE_API_KEY", "")
if not KEY:
    sys.exit("export EXPLEE_API_KEY first")

ICP_EN = ("owners and heads of sales at professional training companies "
          "in France, Belgium and Luxembourg that sell B2B")


def call(path, body=None):
    """Returns (status, parsed_or_text). Never raises."""
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("X-API-Key", KEY)
    req.add_header("Accept", "application/json")
    if data:
        req.add_header("Content-Type", "application/json")
    print(f"\n  {req.get_method()} {url}")
    if body is not None:
        print("  body: " + json.dumps(body, ensure_ascii=False))
    try:
        with urllib.request.urlopen(req, timeout=120, context=ssl.create_default_context()) as r:
            raw, status = r.read().decode(errors="replace"), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read().decode(errors="replace"), e.code
    except Exception as e:                                  # network, TLS, DNS
        print(f"  !! {type(e).__name__}: {e}")
        return 0, None
    print(f"  HTTP {status}")
    try:
        parsed = json.loads(raw or "{}")
    except ValueError:
        print("  raw (not JSON): " + raw[:1000])
        return status, None
    print("  " + json.dumps(parsed, indent=2, ensure_ascii=False)[:2500])
    return status, parsed


def people_in(payload):
    """Explee's array, wherever it is. Returns (key_path, list) or (None, [])."""
    if not isinstance(payload, dict):
        return None, []
    for k in ("people", "results", "items", "contacts", "data"):
        v = payload.get(k)
        if isinstance(v, list):
            return k, v
        if isinstance(v, dict):                             # one level of nesting
            for k2 in ("people", "results", "items", "contacts"):
                if isinstance(v.get(k2), list):
                    return f"{k}.{k2}", v[k2]
    return None, []


def report(label, status, payload):
    key, rows = people_in(payload)
    if status == 200 and rows:
        print(f"  -> {label}: {len(rows)} people, under \"{key}\"")
        print("     first row keys: " + ", ".join(sorted(rows[0])[:14]))
    elif status == 200:
        keys = sorted(payload) if isinstance(payload, dict) else type(payload).__name__
        print(f"  -> {label}: HTTP 200 but no array. Top-level keys: {keys}")
    else:
        print(f"  -> {label}: HTTP {status}")
    return bool(rows)


print(__doc__.split("Why a ladder")[0].strip())

print("\n" + "=" * 70 + "\nA. balance")
st, bal = call("/billing/balance")
if isinstance(bal, dict):
    amount = bal.get("remain", bal.get("balance"))
    if isinstance(amount, (int, float)):
        print(f"  -> {amount} credits (${amount / 100:.2f})")
        if amount <= 0:
            print("  -> STOP. Every request 402s at or below zero, free ones included.")

print("\n" + "=" * 70 + "\nB. nl-to-filters — Explee's own filter shape, free")
st_b, filters = call("/search/nl-to-filters", {"query": ICP_EN})

print("\n" + "=" * 70 + "\nC. search/people using exactly what B returned")
ok_c = False
if isinstance(filters, dict):
    body = {k: v for k, v in filters.items() if k not in ("query", "explanation")}
    body.setdefault("limit", 5)
    st_c, res_c = call("/search/people", body)
    ok_c = report("C", st_c, res_c)
else:
    print("  skipped: B returned nothing usable")

print("\n" + "=" * 70 + "\nC2. search/companies — the documented shape")
st_c2, res_c2 = call("/search/companies", {
    "filters": {"definition": "organisme de formation, centre de formation",
                "criteria": ["Vente B2B active"]},
    "page_size": 5,
})
ok_c2 = report("C2", st_c2, res_c2)
if ok_c2:
    _, rows = people_in(res_c2)
    dom = [r.get("domain") or r.get("website") or r.get("company_domain") for r in rows]
    print(f"     domains: {dom}")
    print("     -> these feed LinkFinder company_domain_to_employees, 1 credit each,")
    print("        emails included. That is the flow.")

print("\n" + "=" * 70 + "\nD. search/people with the body the n8n workflow sends")
st_d, res_d = call("/search/people", {
    "people_filters": {
        "job_titles": ["Dirigeant", "responsable commercial"],
        "criteria": ["Vente B2B active", "Equipe commerciale de moins de 5"],
    },
    "company_filters": {
        "definition": "organisme de formation, centre de formation in France, Belgique, Luxembourg"
    },
    "limit": 5,
})
ok_d = report("D", st_d, res_d)

print("\n" + "=" * 70 + "\nD2. search/people with page_size instead of limit")
st_d2, res_d2 = call("/search/people", {
    "people_filters": {"job_titles": ["Dirigeant"]},
    "company_filters": {"definition": "organisme de formation in France"},
    "page_size": 5,
})
ok_d2 = report("D2", st_d2, res_d2)

print("\n" + "=" * 70 + "\nE. control — deliberately broad, no criteria")
st_e, res_e = call("/search/people", {
    "people_filters": {"job_titles": ["CEO"]},
    "company_filters": {"definition": "software companies in France"},
    "limit": 3,
})
ok_e = report("E", st_e, res_e)

print("\n" + "=" * 70 + "\nVERDICT")
if ok_c2:
    print("  Company search works — that is the path the workflow now takes.")
    print("  Explee finds the companies, LinkFinder lists the people at each.")
if ok_d2 and not ok_d:
    print("  People search wants page_size, not limit. One-line fix in Config.")
if ok_d:
    print("  The workflow's body works. If n8n still shows nothing, the problem is")
    print("  in the flow, not the API — send the 'One item per lead' node output.")
elif ok_c:
    print("  Our body shape is wrong and B printed the right one. Paste section B")
    print("  and the Config node changes to match.")
elif ok_e:
    print("  The shape is fine; the ICP is too narrow. Loosen the criteria and the")
    print("  definition — start by dropping criteria entirely, then add them back.")
elif st_d == 402 or st_e == 402:
    print("  402: balance. Top up; even free-tier calls need a positive balance.")
elif st_d in (404, 405):
    print(f"  {st_d}: /search/people is not the endpoint on this account. Section B")
    print("  shows what the docs' own converter targets.")
elif st_d in (401, 403):
    print(f"  {st_d}: the key. Rotated and not updated everywhere, or wrong scope.")
else:
    print("  Nothing returned people. Paste the whole output — the status codes and")
    print("  bodies above say which of the four causes it is.")
