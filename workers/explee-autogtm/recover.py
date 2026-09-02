#!/usr/bin/env python3
"""Action 1: answer the positive replies that never booked.

    python3 recover.py                          # show what would send, send nothing
    python3 recover.py --apply                  # actually reply
    python3 recover.py --campaign 8123 --apply
    python3 recover.py --booked booked.json --calendar-views opened.json --apply

WHAT LEAKS, AND WHY THIS IS THE CHEAP LEVER
-------------------------------------------
A lead who replied has already been paid for at full price - the search, the
enrichment, the send, the sequence. They said something interested and then the
thread stopped. Re-working them costs one more email. The plan's arithmetic: ~55
positive replies a month, 10 book, 45 leak; recovering a fifth of those roughly
doubles the calls for about $10 of sends, which is the difference between $50 a
call and something near $27.

HOW IT DECIDES NOT TO SEND
--------------------------
Five gates, in this order, and any one of them stops a send:

  1. `can_reply` is false on the thread                (Explee's own compliance gate)
  2. the lead is in --booked                           (they already have a call)
  3. someone already answered the lead's last message  (a human got there first)
  4. the note already carries our marker for that exact message  (idempotency)
  5. the classifier returned a silent bucket           (no, out of office, unknown)

Gate 3 and gate 4 are the ones that stop this becoming a bot that argues with
your prospects. The marker is written into the lead's shared note, not only into
local state, because the note is what a teammate sees in the app and it survives
this script being run from a different machine with an empty state file.

MAX_SENDS_PER_RUN exists because a classifier bug should cost you twenty five
emails, not an inbox.
"""

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path

import followups as fu
from explee import Explee, ExpleeError, ShapeError, first_of

HERE = Path(__file__).resolve().parent
MAX_SENDS_PER_RUN = 25
MARK_OPEN, MARK_CLOSE = "[explee-recovery]", "[/explee-recovery]"
ENTRY = re.compile(r"^(?P<at>\S+)\s+bucket=(?P<bucket>\S+)\s+msg=(?P<msg>\S+)"
                   r"\s+action=(?P<action>\S+)(?:\s+due=(?P<due>\S+))?")


# --- the shared note, used as the ledger -------------------------------------
def read_marker(note):
    """Our entries out of a note that may also contain whatever a human typed."""
    if not note or MARK_OPEN not in note:
        return []
    block = note.split(MARK_OPEN, 1)[1].split(MARK_CLOSE, 1)[0]
    out = []
    for line in block.strip().splitlines():
        match = ENTRY.match(line.strip())
        if match:
            out.append({k: v for k, v in match.groupdict().items() if v})
    return out


def write_marker(note, entries):
    """Put the entries back, leaving the human part of the note untouched."""
    human = note or ""
    if MARK_OPEN in human:
        head, rest = human.split(MARK_OPEN, 1)
        human = head + (rest.split(MARK_CLOSE, 1)[1] if MARK_CLOSE in rest else "")
    lines = []
    for entry in entries[-20:]:
        line = "{at} bucket={bucket} msg={msg} action={action}".format(**entry)
        if entry.get("due"):
            line += " due={}".format(entry["due"])
        lines.append(line)
    block = "{}\n{}\n{}".format(MARK_OPEN, "\n".join(lines), MARK_CLOSE)
    return (human.strip() + "\n\n" + block).strip()


# --- reading a thread without knowing its exact schema -----------------------
INBOUND_WORDS = ("inbound", "received", "reply", "lead", "from_lead", "them", "in")
OUTBOUND_WORDS = ("outbound", "sent", "us", "me", "out", "campaign")


def message_direction(msg):
    for key in ("direction", "type", "sender", "from_type", "author"):
        value = msg.get(key)
        if isinstance(value, str):
            low = value.strip().lower()
            if low in INBOUND_WORDS:
                return "in"
            if low in OUTBOUND_WORDS:
                return "out"
    for key in ("is_reply", "from_lead", "is_inbound", "incoming"):
        if isinstance(msg.get(key), bool):
            return "in" if msg[key] else "out"
    raise ShapeError("cannot tell who sent this message. Keys: {}. Add the spelling to "
                     "INBOUND_WORDS/OUTBOUND_WORDS in recover.py.".format(sorted(msg)))


def thread_view(thread):
    """-> (messages oldest-first as {direction, text}, can_reply)."""
    raw = first_of(thread, "messages", "emails", "thread", "conversation", default=[])
    messages = [{"direction": message_direction(m),
                 "text": first_of(m, "body", "text", "message", "content", default="")}
                for m in raw]
    return messages, bool(first_of(thread, "can_reply", default=False))


def person_fields(row, thread):
    """first name / company / email, from whichever of the two payloads has them."""
    def look(*keys):
        for source in (row, thread, first_of(thread, "person", "lead", "contact", default={})):
            if isinstance(source, dict):
                value = first_of(source, *keys, default=None)
                if value:
                    return value
        return None
    full = look("full_name", "name")
    return {
        "first_name": look("first_name", "firstname") or (full.split()[0] if full else None),
        "company": look("company_name", "company", "company_domain"),
        "email": (look("email", "email_address") or "").lower(),
    }


# --- one lead ----------------------------------------------------------------
def decide(row, thread, note, cfg, booked, calendar_views, now):
    """Pure: what should happen to this lead. No network, no sending."""
    who = person_fields(row, thread)
    messages, can_reply = thread_view(thread)
    inbound = [i for i, m in enumerate(messages) if m["direction"] == "in"]
    if not inbound:
        return {"action": "skip", "reason": "no reply from this lead", "who": who}

    last = inbound[-1]
    text = messages[last]["text"]
    key = hashlib.sha1((text or "").strip().lower().encode()).hexdigest()[:6]
    entries = read_marker(note)

    due = [e for e in entries
           if e["action"] == "queued" and e.get("due", "9999") <= now.date().isoformat()
           and not any(f["action"] == "sent" and f["bucket"] == "re_engage"
                       and f["msg"] == e["msg"] for f in entries)]

    if any(m["direction"] == "out" for m in messages[last + 1:]):
        # Somebody already answered. A queued re-engage that came due is still ours.
        if due and can_reply:
            return _send(who, "re_engage", "re-engage due {}".format(due[-1]["due"]),
                         due[-1]["msg"], entries, note, cfg, now)
        return {"action": "skip", "reason": "already answered", "who": who}
    if who["email"] in booked:
        return {"action": "skip", "reason": "already booked a call", "who": who}
    if any(e["msg"] == key and e["action"] in ("sent", "queued") for e in entries):
        return {"action": "skip", "reason": "already handled (note marker)", "who": who}

    bucket, why = fu.classify(text, opened_calendar=who["email"] in calendar_views)
    if bucket in fu.SILENT:
        return {"action": "skip", "reason": "{} - {}".format(bucket, why),
                "bucket": bucket, "who": who}
    if bucket in fu.QUEUED:
        when = fu.re_engage_date(text, now)
        entries.append({"at": now.strftime("%Y-%m-%dT%H:%MZ"), "bucket": bucket,
                        "msg": key, "action": "queued", "due": when.isoformat()})
        return {"action": "queue", "bucket": bucket, "why": why, "who": who,
                "due": when.isoformat(), "note": write_marker(note, entries)}
    if not can_reply:
        return {"action": "skip", "reason": "can_reply is false", "bucket": bucket, "who": who}
    return _send(who, bucket, why, key, entries, note, cfg, now)


def _send(who, bucket, why, key, entries, note, cfg, now):
    slots = [fu.say_slot(s) for s in fu.two_slots(now, cfg.get("timezone", "UTC"),
                                                  tuple(cfg.get("slot_hours", fu.SLOT_HOURS)))]
    ctx = dict(cfg.get("copy", {}), slots=slots, **who)
    message = fu.compose(bucket, ctx)
    entries = entries + [{"at": now.strftime("%Y-%m-%dT%H:%MZ"), "bucket": bucket,
                          "msg": key, "action": "sent"}]
    return {"action": "send", "bucket": bucket, "why": why, "who": who,
            "message": message, "note": write_marker(note, entries)}


# --- the run -----------------------------------------------------------------
def load_emails(path):
    if not path:
        return set()
    raw = Path(path).read_text().strip()
    values = json.loads(raw) if raw.startswith(("[", "{")) else raw.splitlines()
    if isinstance(values, dict):
        values = values.get("emails", [])
    return {str(v).strip().lower() for v in values if str(v).strip()}


def run(api, cfg, campaigns, booked, calendar_views, now, apply_, cap, out=sys.stdout):
    tally, sends = {}, 0
    for campaign in campaigns:
        cid = first_of(campaign, "id", "campaign_id")
        print("\n== {} ({})".format(first_of(campaign, "name", default=cid), cid), file=out)
        for row in api.inbox_all(cid, tab="replied"):
            pid = first_of(row, "person_id", "id", "lead_id")
            try:
                thread = api.thread(cid, pid)
                note = api.get_note(cid, pid)
                plan = decide(row, thread, note, cfg, booked, calendar_views, now)
            except (ShapeError, ExpleeError) as err:
                tally["error"] = tally.get("error", 0) + 1
                print("  !! {}: {}".format(pid, err), file=out)
                continue

            label = (plan["bucket"] if plan["action"] in ("send", "queue")
                     else "skip: " + plan.get("reason", "?").split(" - ")[0])
            tally[label] = tally.get(label, 0) + 1
            if plan["action"] == "skip":
                continue

            who = plan["who"]
            print("  -> {} <{}> [{}] {}".format(
                who["first_name"] or pid, who["email"] or "no email",
                plan["bucket"], plan.get("why", "")), file=out)

            if plan["action"] == "queue":
                print("     queued for {}".format(plan["due"]), file=out)
                if apply_:
                    api.set_note(cid, pid, plan["note"])
                continue

            if sends >= cap:
                print("     NOT SENT: hit the {}-per-run cap".format(cap), file=out)
                continue
            print("     " + plan["message"].replace("\n", "\n     "), file=out)
            if not apply_:
                continue
            try:
                api.reply(cid, pid, plan["message"])
            except ExpleeError as err:
                print("     NOT SENT: {} {}".format(err.status, err.body[:120]), file=out)
                tally["refused"] = tally.get("refused", 0) + 1
                continue
            sends += 1
            api.set_note(cid, pid, plan["note"])
    return tally, sends


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default=str(HERE / "config.json"))
    ap.add_argument("--campaign", type=int, action="append",
                    help="campaign id; repeatable. Default: every campaign in the project.")
    ap.add_argument("--project", type=int)
    ap.add_argument("--booked", help="JSON list (or one per line) of emails that booked a call")
    ap.add_argument("--calendar-views", help="emails that opened the scheduler and did not book")
    ap.add_argument("--limit", type=int, default=MAX_SENDS_PER_RUN)
    ap.add_argument("--apply", action="store_true", help="actually send. Off by default.")
    args = ap.parse_args(argv)

    cfg = json.loads(Path(args.config).read_text())
    api = Explee()
    balance = api.balance()
    if balance <= 0:
        raise SystemExit("balance is {} credits - every request needs a positive "
                         "balance. Top up at https://explee.com/billing".format(balance))

    campaigns = ([{"id": c} for c in args.campaign] if args.campaign
                 else api.campaigns(project_id=args.project or cfg.get("project_id")))
    if not campaigns:
        raise SystemExit("no campaigns to scan")

    now = dt.datetime.now(dt.timezone.utc)
    tally, sends = run(api, cfg, campaigns, load_emails(args.booked),
                       load_emails(args.calendar_views), now, args.apply, args.limit)

    print("\n" + ("sent {}".format(sends) if args.apply
                  else "DRY RUN - nothing sent. Add --apply."))
    for name, count in sorted(tally.items(), key=lambda kv: -kv[1]):
        print("  {:<22} {}".format(name, count))
    return 0


if __name__ == "__main__":
    sys.exit(main())
