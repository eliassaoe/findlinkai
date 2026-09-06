#!/usr/bin/env python3
"""The runner. Dry by default; sending needs --apply.

    python3 run.py source   --campaign c.json --limit 50      # search + qualify + draft
    python3 run.py send     --campaign c.json --apply         # push drafts to Instantly
    python3 run.py replies  --campaign c.json                 # classify inbound, draft answers
    python3 run.py learn    --campaign c.json                 # mine patterns from bookings
    python3 run.py capacity                                   # what can actually send today

Same posture as workers/explee-autogtm: **a dry run prints exactly what it would
do and changes nothing.** That directory's README makes the case and this follows
it — the schedule runs dry until a variable is flipped, so the first live send is
a decision someone made, not a deploy that happened.

Campaign config is a JSON file for now (see example-campaign.json). The UI in
ui/index.html writes the same shape into Supabase; store.py is the bridge and is
the one piece not yet written.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

import copywriter
import instantly as instantly_mod
import learning
import linkfinder
import pipeline
from explee_search import LeadSearch
from models import Campaign, Lead, Pattern, Project, Prompt


def load_any(args) -> tuple[Project, Campaign, dict[str, Prompt], str, object]:
    """Config from Supabase when --db is set, else from a JSON file.

    Returns (project, campaign, prompts, campaign_id, store_or_None). With --db
    the console is the source of truth: what you edit in the UI is what the agent
    uses on the next run.
    """
    if getattr(args, "db", False):
        import store as store_mod
        st = store_mod.Store()
        project, campaign, prompts, campaign_id = st.load(args.campaign, getattr(args, "project", "") or "")
        return project, campaign, prompts, campaign_id, st
    project, campaign, prompts = load_config(args.campaign)
    return project, campaign, prompts, "", None


def _fit(cls, data: dict, label: str):
    """Build a dataclass from JSON, dropping keys it does not have.

    The console exports more than the runner reads, and it will keep growing. An
    unknown key is a note, never a crash — a config file should not be able to
    stop a run.
    """
    from dataclasses import fields

    known = {f.name for f in fields(cls)}
    extra = sorted(set(data) - known)
    if extra:
        print(f"note: ignoring unknown {label} field(s): {', '.join(extra)}")
    return cls(**{
        k: (tuple(v) if isinstance(v, list) else ("" if v is None else v))
        for k, v in data.items() if k in known
    })


def load_config(path: str) -> tuple[Project, Campaign, dict[str, Prompt]]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    project = _fit(Project, raw["project"], "project")
    campaign = _fit(Campaign, raw["campaign"], "campaign")
    prompts = {p["stage"]: _fit(Prompt, p, "prompt") for p in raw.get("prompts", [])}
    for stage in ("first_email", "follow_up", "reply"):
        prompts.setdefault(stage, Prompt(stage=stage))
    return project, campaign, prompts


def anthropic_client():
    """Anthropic direct, or OpenRouter's Anthropic Skin. See llm.py."""
    import llm
    return llm.client()


# ---------------------------------------------------------------- commands


def cmd_capacity(args) -> int:
    """What can actually send today, and does every credential work.

    This is the safest possible first real run: every call here is read-only and
    free. It is the cheapest way to find out whether the keys are right and
    whether the response shapes match what this code expects — both of which are
    unverified until someone runs exactly this.
    """
    problems = []

    # Explee first: it 402s every request, free tier included, at or below zero,
    # so a negative balance means nothing else in the system can run either.
    try:
        from explee_search import LeadSearch
        balance = LeadSearch().balance()
        print(f"Explee balance     : {balance:.2f}")
        if balance <= 0:
            problems.append(
                f"Explee balance is {balance:.2f}. Every request 402s at or below "
                "zero, free tier included. Top up before anything else."
            )
    except SystemExit as err:
        problems.append(f"Explee: {err}")
    except Exception as err:
        problems.append(f"Explee: {type(err).__name__}: {err}")

    # The model provider, and — the part no documentation settles — whether
    # structured outputs and the web_search server tool actually work here.
    try:
        import llm
        cap = llm.probe()
        print(f"LLM provider       : {cap['provider']} ({cap['model']})")
        print(f"  structured JSON  : {'yes' if cap['structured_outputs'] else 'NO'}")
        print(f"  web search tool  : {'yes' if cap['web_search'] else 'no'}")
        for note in cap["notes"]:
            problems.append(note)
        if cap["reachable"] and not cap["structured_outputs"]:
            problems.append(
                "Structured outputs are not working. Every agent here parses JSON "
                "from the reply, so this must be fixed before a real run."
            )
    except SystemExit as err:
        problems.append(f"LLM: {err}")
    except Exception as err:
        problems.append(f"LLM: {type(err).__name__}: {err}")

    try:
        api = instantly_mod.Instantly()
        ready, blocked = api.sendable_accounts()
    except SystemExit as err:
        print(f"Instantly          : {err}")
        for p in problems:
            print(f"\n  ! {p}")
        return 1
    except Exception as err:
        print(f"Instantly          : {type(err).__name__}: {err}")
        for p in problems:
            print(f"\n  ! {p}")
        return 1
    print(f"sendable mailboxes : {len(ready)}")
    print(f"blocked mailboxes  : {len(blocked)}")
    for a in blocked:
        print(
            f"  - {a.get('email')}: status={a.get('status')} "
            f"warmup={a.get('stat_warmup_score')}"
        )
    cap = sum(int(a.get("daily_limit") or 0) for a in ready)
    print(f"daily capacity     : {cap} emails")

    if not ready:
        problems.append(
            "No mailbox can send. All nine read status=-1 on 2026-09-06 "
            "(docs/own-gtm-agent-plan.md); this is the first blocker to clear."
        )

    if problems:
        print("\nBlockers:")
        for p in problems:
            print(f"  ! {p}")
        return 1

    print("\nEverything checks out. Next: source --limit 5 to try the pipeline small.")
    return 0


def cmd_source(args) -> int:
    project, campaign, prompts, campaign_id, st = load_any(args)
    client = anthropic_client()
    patterns = st.patterns(campaign_id, "first_email") if st else []
    suppression = st.suppression() if st else frozenset()
    if patterns:
        print(f"{len(patterns)} learned patterns in play")

    if args.leads:
        rows = json.loads(Path(args.leads).read_text(encoding="utf-8"))
        leads = [LeadSearch.to_lead(r) for r in rows]
        print(f"loaded {len(leads)} leads from {args.leads}")
    else:
        search = LeadSearch()
        ok, cost = search.affordable(args.limit)
        if not ok:
            print(
                f"Explee balance is below the {cost:.0f} credits this batch needs. "
                "Every request 402s at or below zero, free tier included."
            )
            return 1
        leads = search.search(campaign, limit=args.limit)
        print(f"Explee returned {len(leads)} leads (~{cost:.0f} credits)")

    # Who resolves the address. Mirrors the Keys panel in the console.
    choice = args.resolver if args.resolver else ("linkfinder" if args.resolve else "none")
    if choice == "linkfinder":
        resolver = linkfinder.make_resolver(linkfinder.LinkFinder())
    elif choice.startswith("explee"):
        from explee_search import LeadSearch, make_resolver as explee_resolver
        resolver = explee_resolver(LeadSearch(), preset=choice.split("_", 1)[1])
    else:
        resolver = pipeline.no_resolver
    print(f"email resolution   : {choice}")

    drafts, report = pipeline.run(
        client, project, campaign, prompts["first_email"], leads,
        patterns=patterns, resolver=resolver, research=args.research,
        daily_cap=args.cap or project.daily_cap,
        require_verified=not args.allow_unverified,
        suppression=suppression,
    )
    print(report.line())

    if st and drafts:
        print(f"saved {st.save_drafts(campaign_id, drafts)} leads and drafts to Supabase")

    out = Path(args.out)
    out.write_text(
        json.dumps(
            [
                {
                    "lead": asdict(d.lead),
                    "fit_score": d.verdict.fit_score,
                    "fit_reason": d.verdict.fit_reason,
                    "observation": d.verdict.observation,
                    "observation_source": d.verdict.observation_source,
                    "subject": d.draft.subject,
                    "body": d.draft.body,
                    "language": d.draft.language,
                    "confidence": d.draft.confidence,
                }
                for d in drafts
            ],
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"wrote {len(drafts)} drafts to {out}")

    for d in drafts[: args.show]:
        print("\n" + "=" * 66)
        print(f"{d.lead.full_name} <{d.lead.email}> — {d.verdict.fit_score}/10")
        print(f"observed: {d.verdict.observation}  [{d.verdict.observation_source}]")
        print(f"Subject: {d.draft.subject}")
        print(d.draft.body)
    return 0


def cmd_send(args) -> int:
    project, campaign, prompts, campaign_id, st = load_any(args)
    drafts = json.loads(Path(args.drafts).read_text(encoding="utf-8"))
    if not drafts:
        print("no drafts to send")
        return 0

    api = instantly_mod.Instantly()
    ready, _ = api.sendable_accounts()
    if not ready:
        print("no sendable mailboxes — run `capacity` first")
        return 1
    cap = sum(int(a.get("daily_limit") or 0) for a in ready)
    if len(drafts) > cap:
        print(f"{len(drafts)} drafts exceeds today's capacity of {cap}; trimming")
        drafts = drafts[:cap]

    if not args.apply:
        print(f"DRY RUN — would create campaign {campaign.name!r} with {len(drafts)} leads")
        print(f"  mailboxes: {', '.join(a['email'] for a in ready)}")
        print(f"  first subject: {drafts[0]['subject']!r}")
        print("  campaign would be created PAUSED; arming is a separate --activate run")
        print("\nRe-run with --apply to create it.")
        return 0

    # If the console has an Instantly campaign id set, add leads to that one
    # rather than making a new campaign every run.
    target = args.instantly_campaign_id or campaign.instantly_campaign_id or (
        st.select("gtm_campaigns", id=campaign_id)[0].get("instantly_campaign_id")
        if st and campaign_id else None
    )
    if target:
        print(f"using existing Instantly campaign {target}")
    else:
        first = drafts[0]
        created = api.create_campaign(
            name=f"{project.name} — {campaign.name}",
            steps=[{"day": 0, "subject": first["subject"], "body": first["body"]}],
            sending_emails=[a["email"] for a in ready],
            daily_limit=min(15, cap),
        )
        target = created.get("id")
        print(f"created PAUSED campaign {target}")
        if st and campaign_id:
            st.update("gtm_campaigns", {"instantly_campaign_id": target}, id=campaign_id)
            print("  saved that id back to the console")

    api.add_leads(
        target,
        [
            {
                "email": d["lead"]["email"],
                "first_name": d["lead"].get("first_name"),
                "company": d["lead"].get("company"),
                "linkedin_url": d["lead"].get("linkedin_url"),
                "title": d["lead"].get("title"),
                "verified": True,  # pipeline.run already gated on this
            }
            for d in drafts
        ],
    )
    print(f"added {len(drafts)} leads to {target}.")
    print(f"Arm it with: python3 run.py arm --campaign-id {target} --apply")
    return 0


def cmd_arm(args) -> int:
    api = instantly_mod.Instantly()
    if not args.apply:
        print(f"DRY RUN — would activate campaign {args.campaign_id}. Re-run with --apply.")
        return 0
    api.activate(args.campaign_id)
    print(f"campaign {args.campaign_id} is live")
    return 0


def cmd_replies(args) -> int:
    project, campaign, prompts, campaign_id, st = load_any(args)
    client = anthropic_client()
    api = instantly_mod.Instantly()

    inbound = api.replies(campaign_id=args.campaign_id)
    print(f"{len(inbound)} inbound messages")
    answered = 0
    for msg in inbound:
        body = msg.get("body", {}).get("text") or msg.get("body_text") or ""
        if not body.strip():
            continue
        label = learning.classify_reply(client, body)
        who = msg.get("lead_email", "?")
        print(f"  {who}: {label['sentiment']} (reply={label['wants_reply']}) — {label['reason'][:70]}")
        if not label["wants_reply"]:
            continue

        lead = Lead(email=who, full_name=msg.get("lead_name", ""))
        draft = copywriter.write(
            client, project, campaign, prompts["reply"], lead, "reply",
            thread=__import__("models").Thread(inbound=(body,)),
        )
        answered += 1
        print(f"    draft: {draft.body[:120]}")
        if args.apply:
            api.send_reply(msg["id"], draft.body)
            print("    sent")
    print(f"{answered} replies drafted{' and sent' if args.apply else ' (dry run)'}")
    return 0


def cmd_learn(args) -> int:
    """Mine patterns from booked conversations.

    Needs an outcomes source. Until store.py lands this reads two JSON files so
    the loop is runnable and testable before the DB exists.
    """
    client = anthropic_client()
    won = json.loads(Path(args.won).read_text(encoding="utf-8"))
    lost = json.loads(Path(args.lost).read_text(encoding="utf-8"))
    patterns = learning.mine_patterns(client, args.stage, won, lost)
    if not patterns:
        print(
            f"no patterns: {len(won)} booked examples "
            f"(need {learning.MIN_WINS_TO_MINE}), {len(lost)} lost. "
            "An empty result early on is correct, not a failure."
        )
        return 0
    for p in patterns:
        print(f"[{p.kind}] {p.pattern}  ({p.wins}W/{p.losses}L)")
    Path(args.out).write_text(
        json.dumps([asdict(p) for p in patterns], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {len(patterns)} patterns to {args.out}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("capacity", help="what can actually send today").set_defaults(fn=cmd_capacity)

    s = sub.add_parser("source", help="search, qualify and draft")
    s.add_argument("--campaign", required=True)
    s.add_argument("--leads", help="JSON file of rows, instead of hitting Explee")
    s.add_argument("--limit", type=int, default=50)
    s.add_argument("--cap", type=int, default=0)
    s.add_argument("--out", default="drafts.json")
    s.add_argument("--show", type=int, default=3)
    s.add_argument("--research", action="store_true", help="let the qualifier read their site")
    s.add_argument("--resolve", action="store_true", help="shorthand for --resolver linkfinder")
    s.add_argument("--resolver", default="",
                   choices=["", "linkfinder", "explee_premium", "explee_basic", "none"],
                   help="who finds the email. linkfinder is ours (no marginal cost); "
                        "explee charges only when it finds one (5cr premium / 1.5cr basic)")
    s.add_argument("--allow-unverified", action="store_true", help="dangerous; see README")
    s.set_defaults(fn=cmd_source)

    s = sub.add_parser("send", help="push drafts to Instantly (creates PAUSED)")
    s.add_argument("--campaign", required=True)
    s.add_argument("--drafts", default="drafts.json")
    s.add_argument("--instantly-campaign-id", default="",
                   help="add to this campaign instead of creating one")
    s.add_argument("--apply", action="store_true")
    s.set_defaults(fn=cmd_send)

    s = sub.add_parser("arm", help="activate a paused campaign")
    s.add_argument("--campaign-id", required=True)
    s.add_argument("--apply", action="store_true")
    s.set_defaults(fn=cmd_arm)

    s = sub.add_parser("replies", help="classify inbound and draft answers")
    s.add_argument("--campaign", required=True)
    s.add_argument("--campaign-id")
    s.add_argument("--apply", action="store_true")
    s.set_defaults(fn=cmd_replies)

    s = sub.add_parser("learn", help="mine patterns from bookings")
    s.add_argument("--campaign", required=True)
    s.add_argument("--won", required=True)
    s.add_argument("--lost", required=True)
    s.add_argument("--stage", default="first_email")
    s.add_argument("--out", default="patterns.json")
    s.set_defaults(fn=cmd_learn)

    for sp in (sub.choices[k] for k in ("source", "send", "replies", "learn")):
        sp.add_argument("--db", action="store_true",
                        help="load config from Supabase (the console) instead of a JSON file")
        sp.add_argument("--project", default="", help="with --db, disambiguate a campaign name")

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
