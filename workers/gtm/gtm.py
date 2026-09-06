#!/usr/bin/env python3
"""Explee finds leads -> we write the email -> Instantly gets the campaign.

One file, three steps, no framework. Run it:

    export EXPLEE_API_KEY=... INSTANTLY_API_KEY=... OPENROUTER_API_KEY=...
    export LINKFINDER_API_KEY=...   # optional: a second look at the no-email ones

    python3 gtm.py \
      --find "founders and heads of sales at B2B training companies in France" \
      --offer "We run your outbound end to end. You pay per meeting held." \
      --problem "Prospecting stops whenever the team is delivering." \
      --limit 5

That is a dry run: it prints the emails and stops. Add --apply to create the
Instantly campaign (paused — arming it is still a click in Instantly).

Everything it prints is what actually happened. When a response does not have
the field this expects, it prints the raw JSON and stops, because guessing is
how you spend credits on nothing.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

EXPLEE = "https://api.explee.com"
INSTANTLY = "https://api.instantly.ai/api/v2"


# --------------------------------------------------------------------- http

def call(url, key_header, key, body=None, method=None, timeout=95, soft=False):
    """One HTTP call. Prints and exits on failure rather than raising upward.

    soft=True returns {"_error": "..."} instead of exiting — for the calls that
    are a bonus rather than the run, so a 402 on one of them does not throw
    away leads already paid for."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"))
    req.add_header(key_header, key)
    req.add_header("Accept", "application/json")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:600]
        msg = f"\n{method or 'POST'} {url}\n  HTTP {e.code}: {detail}"
        if soft:
            return {"_error": f"HTTP {e.code}: {detail[:200]}"}
        sys.exit(msg)
    except urllib.error.URLError as e:
        if soft:
            return {"_error": f"network: {e.reason}"}
        sys.exit(f"\n{url}\n  network: {e.reason}")


def need(env):
    v = os.environ.get(env)
    if not v:
        sys.exit(f"{env} is not set.")
    return v


def field(obj, *names, default=None):
    """First key that exists. Explee's response field names are not published,
    so try the plausible spellings and say what was actually there."""
    for n in names:
        if isinstance(obj, dict) and obj.get(n) is not None:
            return obj[n]
    if default is not None:
        return default
    sys.exit(f"\nNone of {names} in this payload. It has: "
             f"{sorted(obj) if isinstance(obj, dict) else type(obj).__name__}\n"
             f"{json.dumps(obj, indent=2)[:1500]}")


# ------------------------------------------------------- 1. Explee: find

def find_leads(query, role, limit, preset):
    key = need("EXPLEE_API_KEY")

    balance = float(field(call(f"{EXPLEE}/public/api/v1/billing/balance", "X-API-Key", key,
                               method="GET"), "remain", "balance", default=0))
    print(f"  Explee balance: {balance:.0f} credits (${balance/100:.2f})")
    if balance <= 0:
        sys.exit("  Balance must be positive — Explee 402s every request at or below zero.")

    body = {
        "people_filters": {"job_titles": [t.strip() for t in role.split(",") if t.strip()]},
        "company_filters": {"definition": query},
        "max_contacts": limit,
        "preset": preset,
    }
    print(f"  searching: {role} at \"{query}\"")
    started = call(f"{EXPLEE}/public/api/v1/find-and-enrich", "X-API-Key", key, body)
    task = field(started, "task_id", "id")

    for _ in range(120):
        time.sleep(5)
        got = call(f"{EXPLEE}/public/api/v1/find-and-enrich/{task}", "X-API-Key", key, method="GET")
        meta = field(got, "meta", default={})
        status = str(field(meta, "status", default="pending")).lower()
        # Wait for the array, not for the word. Explee reports "pending" with
        # contacts null well past progress_pct 99 and eta_seconds 0 — the
        # search is done there but the per-contact enrichment is not, and the
        # array only appears when the whole task closes.
        if isinstance(got.get("contacts"), list) or status == "completed":
            contacts = got.get("contacts") or []
            spent = field(meta, "credits_charged", default=0)
            with_email = sum(1 for c in contacts if c.get("email"))
            print(f"  found {len(contacts)}, {with_email} with an email ({spent} credits)")
            return contacts
        if status == "failed":
            sys.exit(f"  Explee job failed: {field(meta, 'error', default='?')}")
        prog = field(meta, "progress", default={})
        if prog:
            print(f"  … {json.dumps(prog)[:80]}")
    sys.exit("  timed out after 10 minutes")


# ------------------------------------- 1b. LinkFinder: the ones Explee missed

LINKFINDER = "https://api.linkfinderai.com"


def linkfinder_email(key, lead):
    """One lookup. "" is "looked, found nothing" — still charged. None is "the
    call did not complete", which is the signal to stop rather than retry."""
    auth = ("Authorization", f"Bearer {key}")
    if lead.get("linkedin_url") or lead.get("linkedin"):
        op = "linkedin_profile_to_email"
        arg = lead.get("linkedin_url") or lead.get("linkedin")
    else:
        # Space-joined name and company, the format app.html builds.
        parts = [lead.get("full_name") or lead.get("name") or "",
                 lead.get("company_name") or lead.get("company") or ""]
        arg = " ".join(p.strip() for p in parts if p and p.strip())
        op = "lead_full_name_to_email"
        if len(arg.split()) < 2:
            return None                       # nothing to look anything up by

    got = call(LINKFINDER, *auth, {"type": op, "input_data": arg}, soft=True)
    if got.get("_error"):
        print(f"    ! LinkFinder: {got['_error']}")
        return None

    # Any endpoint can hand back a job instead of a result if the lookup runs
    # past ~27s, so this is not only the always-async one.
    job = got.get("job_id")
    if job:
        poll = got.get("poll_url") or f"{LINKFINDER}/status/{job}"
        for _ in range(6):
            time.sleep(10)
            got = call(poll, *auth, method="GET", soft=True)
            if got.get("_error"):
                return None
            state = str(got.get("status", "")).lower()
            if state in ("failed", "error"):
                return ""
            if got.get("result") is not None or state in ("done", "success", "completed"):
                break
        else:
            return None

    res = got.get("result")
    if isinstance(res, dict):
        res = res.get("email")
    return res.strip() if isinstance(res, str) else ""


def fill_missing_emails(leads, cap):
    """Explee charges only for emails it finds, so some contacts come back
    without one. LinkFinder charges EITHER WAY — 10 credits from a LinkedIn
    URL, 7 from name and company — which is why this takes a cap."""
    missing = [l for l in leads if not l.get("email")]
    if not missing:
        return 0
    key = os.environ.get("LINKFINDER_API_KEY")
    if not key or cap <= 0:
        why = "no LINKFINDER_API_KEY" if not key else "--linkfinder-max 0"
        print(f"  {len(missing)} without an email, {why} — left alone")
        return 0

    print(f"  {len(missing)} without an email; LinkFinder gets {min(cap, len(missing))} "
          f"of them (10 credits per LinkedIn URL, 7 per name, found or not)")
    found = spent = 0
    for i, lead in enumerate(missing[:cap]):
        if i:
            time.sleep(1.1)          # roughly one per second per key, or 429
        name = lead.get("full_name") or lead.get("name") or "?"
        got = linkfinder_email(key, lead)
        if got is None:
            print(f"    {name}: stopping here")
            break
        spent += 10 if (lead.get("linkedin_url") or lead.get("linkedin")) else 7
        if got:
            lead["email"] = got
            found += 1
            print(f"    {name}: {got}")
        else:
            print(f"    {name}: nothing found")
    print(f"  LinkFinder found {found} ({spent} credits)")
    return found


# ------------------------------------------------------- 2. write the email

CRAFT = """You write one cold email to one person. Four moves, nothing else:

1. An observation — one concrete thing about them or their company, from the
   lead record below. Not a compliment, not "I came across your profile".
2. The consequence — why that likely creates the problem the offer addresses.
3. What you do — concrete and operational, in the order it happens.
4. One ask — a question they can answer in a line. Ask for a reply, not a call.

Under 90 words. Write in the language of their country; if unclear, English.
Write it as a native speaker writes business email, not translated English.

You may state as fact only what is in THE OFFER. You may refer to what the lead
record says, framed as something you noticed. Never invent metrics, clients,
mutual connections or events. If the record is thin, write a shorter email.

Never: "I hope this finds you well", "I wanted to reach out", "I came across",
"Quick question", "simply", "just", "easily", "leverage", "solution". No
compliments on their website or growth. No second ask, no P.S.

Subject: lowercase, four words or fewer, looks like a person wrote it.

Reply with JSON only: {"subject": "...", "body": "..."}"""


def write_email(lead, offer, problem, extra):
    provider_key = os.environ.get("OPENROUTER_API_KEY")
    try:
        import anthropic
    except ImportError:
        sys.exit("pip install anthropic")

    if provider_key:
        client = anthropic.Anthropic(api_key=provider_key, base_url="https://openrouter.ai/api")
        model = os.environ.get("LLM_MODEL", "anthropic/claude-opus-5")
    else:
        need("ANTHROPIC_API_KEY")
        client = anthropic.Anthropic()
        model = os.environ.get("LLM_MODEL", "claude-opus-5")

    record = {k: v for k, v in {
        "name": lead.get("full_name") or lead.get("name"),
        "first_name": lead.get("first_name"),
        "title": lead.get("job_title") or lead.get("title"),
        "company": lead.get("company_name") or lead.get("company"),
        "domain": lead.get("company_domain") or lead.get("domain"),
        "location": lead.get("location") or lead.get("country"),
        "linkedin": lead.get("linkedin_url"),
    }.items() if v}

    prompt = (
        f"THE OFFER (the only thing you may state as fact)\n{offer}\n\n"
        f"THE PROBLEM THEY LIKELY HAVE\n{problem}\n\n"
        + (f"ALSO\n{extra}\n\n" if extra else "")
        + f"LEAD RECORD\n{json.dumps(record, ensure_ascii=False, indent=2)}"
    )

    r = client.messages.create(
        model=model, max_tokens=1500,
        system=[{"type": "text", "text": CRAFT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": prompt}],
    )
    if getattr(r, "stop_reason", "") == "refusal":
        return None
    text = next((b.text for b in r.content if b.type == "text"), "").strip()
    if text.startswith("```"):
        text = text.split("```")[1].removeprefix("json").strip()
    try:
        out = json.loads(text)
        return {"subject": out["subject"], "body": out["body"]}
    except Exception:
        print(f"    ! model did not return JSON: {text[:200]}")
        return None


# ------------------------------------------------- 3. Instantly: campaign

def html(t):
    return t.replace("\r\n", "\n").replace("\n", "<br>")


def push_to_instantly(name, drafted, campaign_id=None):
    key = need("INSTANTLY_API_KEY")
    auth = ("Authorization", f"Bearer {key}")

    accounts = call(f"{INSTANTLY}/accounts?limit=100", *auth, method="GET")
    items = accounts.get("items", accounts if isinstance(accounts, list) else [])
    ready = [a for a in items if a.get("status") == 1]
    print(f"  mailboxes: {len(ready)} sendable of {len(items)}")
    if not ready:
        for a in items[:3]:
            print(f"    {a.get('email')}: status={a.get('status')} warmup={a.get('stat_warmup_score')}")
        sys.exit("  No mailbox can send. Fix that in Instantly before pushing a campaign.")

    if not campaign_id:
        first = drafted[0]["email"]
        created = call(f"{INSTANTLY}/campaigns", *auth, {
            "name": name,
            "email_list": [a["email"] for a in ready],
            "daily_limit": min(15, sum(int(a.get("daily_limit") or 0) for a in ready)),
            "email_gap": 5,
            "stop_on_reply": True,
            "stop_on_auto_reply": True,
            "link_tracking": False,   # a wrapped link hurts placement
            "open_tracking": False,   # so does a pixel
            "text_only": True,
            # One step. Per-lead bodies ride along as variables below.
            "sequences": [{"steps": [{"type": "email", "delay": 0, "variants": [
                {"subject": "{{subject}}", "body": "{{body}}"}]}]}],
        })
        campaign_id = created.get("id")
        print(f"  created campaign {campaign_id} (PAUSED)")
    else:
        print(f"  using campaign {campaign_id}")

    leads = []
    for d in drafted:
        lead = d["lead"]
        leads.append({
            "email": d["email"],
            "first_name": lead.get("first_name") or (lead.get("full_name") or "").split(" ")[0],
            "last_name": " ".join((lead.get("full_name") or "").split(" ")[1:]),
            "company_name": lead.get("company_name") or lead.get("company") or "",
            # Instantly substitutes these into the sequence, so every lead gets
            # its own email out of one campaign.
            "custom_variables": {"subject": d["subject"], "body": html(d["body"])},
        })
    call(f"{INSTANTLY}/leads/list", *auth,
         {"campaign_id": campaign_id, "leads": leads,
          "skip_if_in_campaign": True, "skip_if_in_workspace": True})
    print(f"  added {len(leads)} leads")
    print(f"\n  Campaign is PAUSED. Start it in Instantly when the copy looks right.")
    return campaign_id


# ------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--find", required=True, help="what kind of company, in plain English")
    ap.add_argument("--role", default="Founder, CEO, Head of Sales", help="job titles, comma separated")
    ap.add_argument("--offer", required=True, help="what you sell — the ONLY facts the email may assert")
    ap.add_argument("--problem", default="", help="the problem they likely have")
    ap.add_argument("--extra", default="", help="anything else the writer should know")
    ap.add_argument("--limit", type=int, default=5, help="how many leads with an email")
    ap.add_argument("--preset", default="premium", choices=["basic", "premium"],
                    help="premium ~$0.05/found email at ~78%%; basic ~$0.015 at ~50%%")
    ap.add_argument("--linkfinder-max", type=int, default=10,
                    help="how many no-email leads LinkFinder gets a second look at "
                         "(charged found or not; 0 disables)")
    ap.add_argument("--name", default="", help="Instantly campaign name")
    ap.add_argument("--campaign-id", default="", help="add to this campaign instead of creating one")
    ap.add_argument("--apply", action="store_true", help="actually create the campaign in Instantly")
    a = ap.parse_args()

    print("\n1. FIND — Explee")
    leads = find_leads(a.find, a.role, a.limit, a.preset)
    if not leads:
        sys.exit("  Nothing came back. Try a broader --find or different --role.")

    print("\n1b. RESOLVE — LinkFinder AI")
    fill_missing_emails(leads, a.linkfinder_max)

    print("\n2. WRITE")
    drafted = []
    for i, lead in enumerate(leads, 1):
        email = lead.get("email")
        name = lead.get("full_name") or lead.get("name") or "?"
        if not email:
            print(f"  {i}. {name}: no email, skipped")
            continue
        d = write_email(lead, a.offer, a.problem, a.extra)
        if not d:
            print(f"  {i}. {name}: could not write, skipped")
            continue
        drafted.append({**d, "email": email, "lead": lead})
        print(f"\n  {i}. {name} <{email}>  {lead.get('company_name') or lead.get('company') or ''}")
        print(f"     Subject: {d['subject']}")
        for line in d["body"].splitlines():
            print(f"     {line}")

    if not drafted:
        sys.exit("\nNothing to send.")

    print(f"\n3. INSTANTLY")
    if not a.apply:
        print(f"  DRY RUN — would create \"{a.name or a.find[:40]}\" with {len(drafted)} leads.")
        print("  Re-run with --apply to create it (it will be paused).")
        return 0
    push_to_instantly(a.name or a.find[:40], drafted, a.campaign_id or None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
