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
import csv
import datetime as dt
import hashlib
import json
import re
import re
import sys
from pathlib import Path

import followups as fu
from explee import Explee, ExpleeError, ShapeError, first_of
from sheet import Sheet, SheetError

HERE = Path(__file__).resolve().parent
PROJECTS = HERE / "projects"
INBOX_URL = "https://explee.com/app-auto-gtm/p/{}/inbox"

TEMPLATE = {
    "name": "",
    "project_id": 0,
    "language": "fr",
    "timezone": "Europe/Paris",
    "slot_hours": [10, 15],
    "sheet": {"webapp_url": "", "token": "", "csv_url": ""},
    "copy": {
        "sender": "Your name\nYour company",
        "offer": "One line: what you do and what it costs them to find out.",
        "proof": "",
        "topic": "the thing you sell",
        "answer": "Short answer: yes.",
    },
}
MAX_SENDS_PER_RUN = 25
MAX_REPLIES_PER_INBOUND = 3   # the API's own cap: 3 replies per message they sent
NUDGE_AFTER_DAYS = (2, 5)     # reply #2 goes 2 days after ours, #3 five days after
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


def message_time(msg):
    """When it was sent, if the payload says. None is a normal answer."""
    for key in ("sent_at", "created_at", "timestamp", "date", "at", "time"):
        value = msg.get(key)
        if isinstance(value, str) and value.strip():
            try:
                return dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
            except ValueError:
                continue
    return None


def thread_view(thread):
    """-> (messages oldest-first as {direction, text, at}, can_reply)."""
    raw = first_of(thread, "messages", "emails", "thread", "conversation", default=[])
    messages = [{"direction": message_direction(m),
                 "text": first_of(m, "body", "text", "message", "content", default=""),
                 "at": message_time(m)}
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
def last_outbound_at(messages, entries, now):
    """When we last wrote. The thread's own timestamp first, our note marker second."""
    for msg in reversed(messages):
        if msg["direction"] == "out" and msg.get("at"):
            return msg["at"]
    for entry in reversed(entries):
        if entry["action"] == "sent":
            try:
                return dt.datetime.strptime(entry["at"], "%Y-%m-%dT%H:%MZ").replace(
                    tzinfo=dt.timezone.utc)
            except ValueError:
                continue
    return None


def decide(row, thread, note, cfg, booked, calendar_views, now):
    """Pure: what should happen to this lead. No network, no sending.

    Two situations, and they are different jobs:

      they spoke last  -> answer it (classify, propose two times)
      we spoke last    -> they went quiet. Nudge, on a schedule, up to the cap.

    The second is the win-back the plan is about, and the one Explee does not do:
    "once a lead replies, the automated sequence is over for them for good".
    """
    who = person_fields(row, thread)
    messages, can_reply = thread_view(thread)
    inbound = [i for i, m in enumerate(messages) if m["direction"] == "in"]
    if not inbound:
        return {"action": "skip", "reason": "no reply from this lead", "who": who}

    last = inbound[-1]
    text = messages[last]["text"]
    key = hashlib.sha1((text or "").strip().lower().encode()).hexdigest()[:6]
    entries = read_marker(note)
    replies_sent = len(messages[last + 1:])          # everything we sent since they wrote
    language = cfg.get("language", "en")
    context = {"last_reply": (text or "").strip().replace("\n", " ")[:300],
               "replies_sent": replies_sent}

    # Gate 1: the sheet. Checked before anything else, every single run.
    if who["email"] and who["email"] in booked:
        return dict(context, action="skip", reason="booked or stopped in the sheet", who=who,
                    next_action="none - marked in the sheet")
    # Gate 2: Explee's compliance gate.
    if not can_reply:
        return dict(context, action="skip", reason="can_reply is false", who=who,
                    next_action="none - Explee will not accept a reply")
    # Gate 3: the API allows at most three replies per message they sent.
    if replies_sent >= MAX_REPLIES_PER_INBOUND:
        return dict(context, action="skip", who=who,
                    reason="reply cap ({}) reached on this message".format(
                        MAX_REPLIES_PER_INBOUND),
                    next_action="none - {} follow-ups sent, that is the limit".format(
                        MAX_REPLIES_PER_INBOUND))

    bucket, why = fu.classify(text, opened_calendar=who["email"] in calendar_views)
    if bucket in fu.SILENT:
        return dict(context, action="skip", reason="{} - {}".format(bucket, why),
                    bucket=bucket, who=who, next_action="none - {}".format(bucket))

    # --- they spoke last: answer them ---------------------------------------
    if replies_sent == 0:
        if any(e["msg"] == key and e["action"] in ("sent", "queued") for e in entries):
            return {"action": "skip", "reason": "already handled (note marker)", "who": who}
        if bucket in fu.QUEUED:
            when = fu.re_engage_date(text, now)
            entries.append({"at": now.strftime("%Y-%m-%dT%H:%MZ"), "bucket": bucket,
                            "msg": key, "action": "queued", "due": when.isoformat()})
            return dict(context, action="queue", bucket=bucket, why=why, who=who,
                        due=when.isoformat(), note=write_marker(note, entries),
                        next_action="re-engage on {}".format(when.isoformat()))
        return dict(context, **_send(who, bucket, why, key, entries, note, cfg, now,
                                     language))

    # --- we spoke last: they went quiet -------------------------------------
    wrote_at = last_outbound_at(messages, entries, now)
    if wrote_at is None:
        return {"action": "skip", "reason": "no timestamp on our last message, cannot "
                                            "schedule a nudge safely", "who": who}
    waited = (now - wrote_at).total_seconds() / 86400.0

    # "recontactez-moi en janvier" is not a two-day nudge. A queued lead waits for
    # its own date and then gets the re-engage message instead.
    queued = [e for e in entries if e["action"] == "queued" and e.get("due")]
    if queued:
        due = queued[-1]["due"]
        if now.date().isoformat() < due:
            return dict(context, action="skip", reason="queued until {}".format(due),
                        who=who, next_action="re-engage on {}".format(due))
        return dict(context, **_send(who, "re_engage", "re-engage due {}".format(due),
                                     queued[-1]["msg"], entries, note, cfg, now, language))

    wait = NUDGE_AFTER_DAYS[min(replies_sent, len(NUDGE_AFTER_DAYS)) - 1]
    if waited < wait:
        return dict(context, action="skip", who=who,
                    reason="nudge {} due in {:.1f}d".format(replies_sent, wait - waited),
                    next_action=(now + dt.timedelta(days=wait - waited)).date().isoformat())
    return dict(context, **_send(who, "nudge", "no answer for {:.0f}d after our reply {}".format(
        waited, replies_sent), key, entries, note, cfg, now, language))


def _send(who, bucket, why, key, entries, note, cfg, now, language="en"):
    slots = [fu.say_slot(s, language)
             for s in fu.two_slots(now, cfg.get("timezone", "UTC"),
                                   tuple(cfg.get("slot_hours", fu.SLOT_HOURS)))]
    ctx = dict(cfg.get("copy", {}), slots=slots, **who)
    message = fu.compose(bucket, ctx, language)
    entries = entries + [{"at": now.strftime("%Y-%m-%dT%H:%MZ"), "bucket": bucket,
                          "msg": key, "action": "sent"}]
    return {"action": "send", "bucket": bucket, "why": why, "who": who,
            "message": message, "note": write_marker(note, entries),
            "next_action": "sent {} today".format(bucket)}


# --- the run -----------------------------------------------------------------
def load_emails(path):
    if not path:
        return set()
    raw = Path(path).read_text().strip()
    values = json.loads(raw) if raw.startswith(("[", "{")) else raw.splitlines()
    if isinstance(values, dict):
        values = values.get("emails", [])
    return {str(v).strip().lower() for v in values if str(v).strip()}


def run(api, cfg, campaigns, booked, calendar_views, now, apply_, cap, out=sys.stdout,
        updates=None):
    tally, sends = {}, 0
    updates = updates if updates is not None else []
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
            if plan.get("who", {}).get("email"):
                updates.append({"email": plan["who"]["email"],
                                "last_reply": (plan.get("last_reply") or "")[:300],
                                "followups_sent": plan.get("replies_sent", 0),
                                "next_action": plan.get("next_action", "")})
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


def sync_hot_leads(api, sheet, campaigns, project_id=None, out=sys.stdout):
    """Every hot lead into the sheet. The Apps Script drops ones already there."""
    rows = []
    for campaign in campaigns:
        cid = first_of(campaign, "id", "campaign_id")
        for lead in api.hot_leads(campaign_id=cid, limit=100):
            email = str(first_of(lead, "email", "email_address", default="")).strip().lower()
            if not email:
                continue
            rows.append({
                "email": email,
                "first_name": first_of(lead, "first_name", "firstname", default=""),
                "company": first_of(lead, "company_name", "company", "company_domain",
                                    default=""),
                "job_title": first_of(lead, "job_title", "title", default=""),
                "campaign": first_of(campaign, "name", default=cid),
                "campaign_id": cid,
                "person_id": first_of(lead, "person_id", "id", default=""),
                "replied_at": first_of(lead, "became_hot_at", "created_at", default=""),
                "inbox": INBOX_URL.format(project_id) if project_id else "",
                "booked": "", "stop": "",
            })
    if not rows:
        print("no hot leads to sync", file=out)
        return 0
    added = sheet.append(rows)
    if added is None:
        path = HERE / "hot-leads-to-paste.csv"
        with open(path, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        print("read-only sheet: {} hot leads written to {} - paste them in".format(
            len(rows), path.name), file=out)
        return 0
    print("{} hot leads seen, {} new rows added to the sheet".format(len(rows), added), file=out)
    return added


def run_project(api, cfg, args, now, out=sys.stdout):
    """One Explee project: sync the sheet, read it, follow up, write state back."""
    name = cfg.get("name") or cfg.get("project_id") or "project"
    project_id = args.project or cfg.get("project_id")
    print("\n=== {} (project {})".format(name, project_id), file=out)

    campaigns = ([{"id": c} for c in args.campaign] if args.campaign
                 else api.campaigns(project_id=project_id))
    if not campaigns:
        print("  no campaigns", file=out)
        return 0

    sheet_cfg = cfg.get("sheet", {})
    csv_url = args.sheet_csv or sheet_cfg.get("csv_url")
    webapp = args.sheet_webapp or sheet_cfg.get("webapp_url")
    token = args.sheet_token or sheet_cfg.get("token")

    if csv_url or webapp:
        sheet = Sheet(csv_url or None, webapp or None, token)
        if not args.no_sync:
            sync_hot_leads(api, sheet, campaigns, project_id, out=out)
        booked, stopped = sheet.exclusions()
        print("  sheet: {} booked, {} stopped".format(len(booked), len(stopped)), file=out)
        excluded = booked | stopped
    elif args.booked:
        sheet, excluded = None, load_emails(args.booked)
    else:
        raise SystemExit("{}: no sheet configured. Add sheet.csv_url or sheet.webapp_url to "
                         "its project file, or pass --sheet-csv.".format(name))

    updates = []
    tally, sends = run(api, cfg, campaigns, excluded, load_emails(args.calendar_views),
                       now, args.apply, args.limit, out=out, updates=updates)
    if sheet and args.apply and updates:
        written = sheet.update(updates)
        if written:
            print("  {} rows refreshed in the sheet".format(written), file=out)

    print("  " + ("sent {}".format(sends) if args.apply else "DRY RUN - nothing sent"), file=out)
    for label, count in sorted(tally.items(), key=lambda kv: -kv[1]):
        print("    {:<40} {}".format(label, count), file=out)
    return sends


def scaffold(name):
    """A new customer project, ready to fill in."""
    PROJECTS.mkdir(exist_ok=True)
    path = PROJECTS / "{}.json".format(re.sub(r"[^a-z0-9_-]+", "-", name.lower()))
    if path.exists():
        raise SystemExit("{} already exists".format(path))
    path.write_text(json.dumps(dict(TEMPLATE, name=name), indent=2, ensure_ascii=False) + "\n")
    print("""{} written.

Now, once per project:
  1. project_id  - the number in the Explee URL: /app-auto-gtm/p/<HERE>
  2. copy        - sender, offer, topic. This is what the follow-ups say.
  3. language    - "fr" or "en"; it switches the templates and the dates.
  4. A Google Sheet with an `email` column and a `booked` column (add `stop` for
     leads to leave alone for any other reason). Either publish it to the web as
     CSV and put that in sheet.csv_url, or deploy sheet-bridge.gs and put its
     /exec url and token in sheet.webapp_url / sheet.token.

Then it runs with every other project:
  python3 recover.py --all            # dry run, all projects
  python3 recover.py --all --apply    # send
""".format(path))
    return 0


def load_project_files(args):
    if args.project_file:
        return [Path(p) for p in args.project_file]
    if args.all:
        found = sorted(PROJECTS.glob("*.json"))
        if not found:
            raise SystemExit("no project files in {}/. Make one: "
                             "python3 recover.py --init <name>".format(PROJECTS.name))
        return found
    return [Path(args.config)]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default=str(HERE / "config.json"))
    ap.add_argument("--project-file", action="append",
                    help="a projects/<name>.json; repeatable")
    ap.add_argument("--all", action="store_true", help="every project in projects/")
    ap.add_argument("--init", metavar="NAME", help="scaffold a new customer project and exit")
    ap.add_argument("--campaign", type=int, action="append",
                    help="campaign id; repeatable. Default: every campaign in the project.")
    ap.add_argument("--project", type=int)
    ap.add_argument("--sheet-csv", help="published-to-web CSV url of the hot-leads sheet")
    ap.add_argument("--sheet-webapp", help="Apps Script /exec url (read AND append)")
    ap.add_argument("--sheet-token", help="the token set in sheet-bridge.gs")
    ap.add_argument("--no-sync", action="store_true",
                    help="do not push new hot leads into the sheet")
    ap.add_argument("--booked", help="offline fallback: JSON list or one email per line")
    ap.add_argument("--calendar-views", help="emails that opened the scheduler and did not book")
    ap.add_argument("--limit", type=int, default=MAX_SENDS_PER_RUN)
    ap.add_argument("--apply", action="store_true", help="actually send. Off by default.")
    args = ap.parse_args(argv)

    if args.init:
        return scaffold(args.init)

    api = Explee()
    balance = api.balance()
    if balance <= 0:
        raise SystemExit("balance is {} credits - every request needs a positive balance, "
                         "free ones included. Top up at https://explee.com/billing".format(
                             balance))

    now = dt.datetime.now(dt.timezone.utc)
    total = 0
    for path in load_project_files(args):
        cfg = json.loads(path.read_text())
        cfg.setdefault("name", path.stem)
        total += run_project(api, cfg, args, now)

    print("\n" + ("sent {} in total".format(total) if args.apply
                  else "DRY RUN - nothing sent. Add --apply."))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SheetError as exc:
        print("{}\nNothing was sent.".format(exc), file=sys.stderr)
        sys.exit(1)
