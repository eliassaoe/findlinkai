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
Six gates, in this order, and any one of them stops a send:

  1. the lead's note says "booked" or "stop"            (typed in the Explee inbox)
  2. the lead is in the sheet / --booked, if configured (optional, same meaning)
  3. `can_reply` is false on the thread                 (Explee's own compliance gate)
  4. three replies already sent to their last message   (the API's own cap)
  5. the classifier returned a silent bucket            (no, out of office, unknown)
  6. the note already carries our marker for that exact message  (idempotency)

THE NOTE IS THE WHOLE INTERFACE
-------------------------------
Every lead in AutoGTM has a team-shared note, in the Lead info panel of the
inbox - the page you already read replies on. This loop reads it and writes it:

  * You type `booked` (or `rdv`, `stop`, `ne pas relancer`) in it -> the loop
    leaves that person alone from the next run on. No sheet, no CSV, no paste.
  * The loop writes one plain line back after every action - "relance 1 envoyée
    le 6 sept." - so what it did is visible on the lead, where you look anyway.

A Google Sheet is still supported (`sheet` in the project file) for teams who
want a list view, but nothing depends on it any more.

Every run also writes reports/latest.md - every replied lead, what they said,
what happened, what is next - and the workflow commits it, so the state of the
loop is one file in the repo rather than a log in the Actions tab.

MAX_SENDS_PER_RUN exists because a classifier bug should cost you twenty five
emails, not an inbox.

"""

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import followups as fu
from explee import Explee, ExpleeError, ShapeError, first_of
from sheet import Sheet, SheetError
import state

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
REPORTS = HERE / "reports"
SHEET_KEYS = ("email", "last_reply", "followups_sent", "next_action")
# What a human types in the note to take a lead out of the loop. Matched on the
# human part of the note only - never on what this script wrote itself.
BOOKED_WORDS = re.compile(r"\b(booked|book[ée]|rdv|rendez[- ]vous|meeting (set|booked)|"
                          r"call (set|booked)|r[ée]serv[ée]|sign[ée]|client|won)\b", re.I)
STOP_WORDS = re.compile(r"\b(stop|ne pas relancer|pas de relance|laisser tomber|"
                        r"do not (contact|chase|follow)|no follow[- ]?up|leave (him|her|them)|"
                        r"unsubscribe|d[ée]sabonn[ée]?)\b", re.I)
STATUS_LINE = {
    "fr": "Suivi LinkFinder — {date} : {what}. Écrire « booked » ou « stop » dans cette "
          "note pour arrêter.",
    "en": "LinkFinder follow-up — {date}: {what}. Type \"booked\" or \"stop\" in this "
          "note to end it.",
}
WHAT = {
    "fr": {"sent": "{bucket} envoyé", "queued": "reporté au {due}", "nudge": "relance envoyée"},
    "en": {"sent": "{bucket} sent", "queued": "parked until {due}", "nudge": "nudge sent"},
}
ENTRY = re.compile(r"^(?P<at>\S+)\s+bucket=(?P<bucket>\S+)\s+msg=(?P<msg>\S+)"
                   r"\s+action=(?P<action>\S+)(?:\s+due=(?P<due>\S+))?")


# --- the shared note, used as the ledger -------------------------------------
def human_part(note):
    """The note without our block - what a person typed."""
    human = note or ""
    if MARK_OPEN in human:
        head, rest = human.split(MARK_OPEN, 1)
        human = head + (rest.split(MARK_CLOSE, 1)[1] if MARK_CLOSE in rest else "")
    return human.strip()


def human_flag(note):
    """'booked' / 'stop' / None, from what a human typed into the lead's note."""
    text = human_part(note)
    if not text:
        return None
    if STOP_WORDS.search(text):
        return "stop"
    if BOOKED_WORDS.search(text):
        return "booked"
    return None


def status_line(entries, language="en"):
    """One readable sentence about the last thing we did, for the person reading the note."""
    if not entries:
        return ""
    last = entries[-1]
    lang = language if language in STATUS_LINE else "en"
    date = last["at"][:10]
    if last["action"] == "queued":
        what = WHAT[lang]["queued"].format(due=last.get("due", "?"))
    elif last["bucket"] == "nudge":
        what = WHAT[lang]["nudge"]
    else:
        what = WHAT[lang]["sent"].format(bucket=last["bucket"].replace("_", " "))
    return STATUS_LINE[lang].format(date=date, what=what)


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


def write_marker(note, entries, language="en"):
    """Put the entries back, leaving the human part of the note untouched."""
    human = human_part(note)
    lines = [status_line(entries, language)] if entries else []
    for entry in entries[-20:]:
        line = "{at} bucket={bucket} msg={msg} action={action}".format(**entry)
        if entry.get("due"):
            line += " due={}".format(entry["due"])
        lines.append(line)
    block = "{}\n{}\n{}".format(MARK_OPEN, "\n".join(lines), MARK_CLOSE)
    return (human + "\n\n" + block).strip()


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
    for key in ("ts", "sent_at", "created_at", "timestamp", "date", "at", "time"):
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
                 "text": first_of(m, "body_text", "body", "text", "message", "content",
                                  default=""),
                 "at": message_time(m)}
                for m in raw]
    return messages, bool(first_of(thread, "can_reply", default=False))


GREETING = re.compile(r"^\s*(?:hi|hello|hey|dear|bonjour|salut|hallo)\s*,?\s+"
                      r"(?P<name>[A-Z][\w'\-]+)\s*[,.!:\-]", re.I | re.M)


def persona_name(messages, fallback):
    """The name Explee's mailbox signs as, read off the thread.

    Explee sends every campaign email from an invented persona - "Pete" at
    p@getliftember.com - and a reply through the API goes out from that same
    mailbox. A follow-up signed "Eliasse" under "Pete"'s address reads as two
    people, so the nudge signs as the persona. The lead's own greeting is the
    most reliable source ("Hi Pete,"); failing that, the last short line of our
    first email; failing that, the configured sender.
    """
    for msg in messages:
        if msg["direction"] == "in":
            match = GREETING.search(msg.get("text") or "")
            if match:
                return match.group("name").strip()
            break
    for msg in messages:
        if msg["direction"] == "out":
            lines = [l.strip() for l in (msg.get("text") or "").strip().splitlines() if l.strip()]
            if lines and 1 <= len(lines[-1].split()) <= 3 and len(lines[-1]) <= 30 \
                    and lines[-1][0].isupper() and not lines[-1].endswith(("?", ".", "!")):
                return lines[-1]
            break
    return fallback


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

    # Gate 1: the note, then the sheet. Checked before anything else, every run.
    flag = human_flag(note)
    if flag:
        return dict(context, action="skip", reason="{} - written in the note".format(flag),
                    who=who, next_action="none - {} in the note".format(flag))
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
    persona = persona_name(messages, cfg.get("copy", {}).get("sender", ""))

    # "Une autre fois", "circle back in Q1": parked to its own date whoever spoke
    # last - a soft no is not a two-day nudge. The dated queue below fires it.
    if bucket in fu.QUEUED and not any(e["msg"] == key and e["action"] == "queued"
                                        for e in entries):
        when = fu.re_engage_date(text, now)
        entries.append({"at": now.strftime("%Y-%m-%dT%H:%MZ"), "bucket": bucket,
                        "msg": key, "action": "queued", "due": when.isoformat()})
        return dict(context, action="queue", bucket=bucket, why=why, who=who,
                    due=when.isoformat(), note=write_marker(note, entries, language),
                    next_action="re-engage on {}".format(when.isoformat()))
    # A question, or a phone number to call: a person does this, never a template.
    # (a question Explee already answered, then silence, is nudged like any other)
    if bucket in fu.NEEDS_HUMAN and (replies_sent == 0 or bucket == "call_me") \
            and not any(e["msg"] == key for e in entries):
        ask = ("CALL THEM - the number is in the reply" if bucket == "call_me"
               else "ANSWER THIS ONE YOURSELF in the inbox")
        return dict(context, action="skip", bucket=bucket, who=who,
                    reason="{} - needs a person, not a template".format(bucket),
                    next_action=ask)

    # --- they spoke last: answer them ---------------------------------------
    if replies_sent == 0:
        if any(e["msg"] == key and e["action"] in ("sent", "queued") for e in entries):
            return {"action": "skip", "reason": "already handled (note marker)", "who": who}
        # Explee's own auto-reply answers a fresh reply within minutes when it is
        # on. Then the job here is only the nudge, later. It gets a day: a reply
        # still unanswered after that is one the auto-reply will not handle.
        if cfg.get("auto_reply"):
            last_at = messages[last].get("at")
            if last_at is None or (now - last_at).total_seconds() < 86400:
                return dict(context, action="skip", bucket=bucket, who=who,
                            reason="fresh reply - Explee's auto-reply answers first",
                            next_action="waiting for Explee's auto-reply")
        return dict(context, **_send(who, bucket, why, key, entries, note, cfg, now,
                                     language, persona))

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
                                     queued[-1]["msg"], entries, note, cfg, now, language,
                                     persona))

    wait = NUDGE_AFTER_DAYS[min(replies_sent, len(NUDGE_AFTER_DAYS)) - 1]
    if waited < wait:
        return dict(context, action="skip", who=who,
                    reason="nudge {} due in {:.1f}d".format(replies_sent, wait - waited),
                    next_action=(now + dt.timedelta(days=wait - waited)).date().isoformat())
    kind = "nudge_last" if replies_sent >= MAX_REPLIES_PER_INBOUND - 1 else "nudge"
    return dict(context, **_send(who, kind, "no answer for {:.0f}d after our reply {}".format(
        waited, replies_sent), key, entries, note, cfg, now, language, persona))


def _send(who, bucket, why, key, entries, note, cfg, now, language="en", persona=None):
    slots = [fu.say_slot(s, language)
             for s in fu.two_slots(now, cfg.get("timezone", "UTC"),
                                   tuple(cfg.get("slot_hours", fu.SLOT_HOURS)))]
    ctx = dict(cfg.get("copy", {}), slots=slots, **who)
    if cfg.get("booking_url"):
        ctx["booking_url"] = cfg["booking_url"]
    if persona:
        ctx["sender"] = persona
    message = fu.compose(bucket, ctx, language)
    entries = entries + [{"at": now.strftime("%Y-%m-%dT%H:%MZ"), "bucket": bucket,
                          "msg": key, "action": "sent"}]
    return {"action": "send", "bucket": bucket, "why": why, "who": who,
            "message": message, "note": write_marker(note, entries, language),
            "next_action": "sent {} today".format(bucket)}


# --- the run -----------------------------------------------------------------
def booking_link(api, campaign_id, cfg):
    """The campaign's own target_url (its Calendly), or the project's booking_url."""
    try:
        definition = api.campaign(campaign_id)
        link = str(first_of(definition, "target_url", default="") or "").strip()
    except (ExpleeError, ShapeError, AttributeError):
        link = ""
    return link or str(cfg.get("booking_url") or cfg.get("copy", {}).get("booking_url")
                       or "").strip()


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
        try:
            replied = api.inbox_all(cid, tab="replied")
        except (ShapeError, ExpleeError) as err:
            tally["error: inbox unreadable"] = tally.get("error: inbox unreadable", 0) + 1
            print("  !! inbox: {}".format(err), file=out)
            continue
        ccfg = dict(cfg, booking_url=booking_link(api, cid, cfg))
        print("  follow-ups carry {}".format(
            "the booking link " + ccfg["booking_url"] if ccfg["booking_url"]
            else "two proposed slots (no target_url on this campaign)"), file=out)
        for row in replied:
            pid = first_of(row, "person_id", "id", "lead_id")
            try:
                thread = api.thread(cid, pid)
                note = api.get_note(cid, pid)
                plan = decide(row, thread, note, ccfg, booked, calendar_views, now)
            except (ShapeError, ExpleeError) as err:
                tally["error"] = tally.get("error", 0) + 1
                print("  !! {}: {}".format(pid, err), file=out)
                continue

            label = (plan["bucket"] if plan["action"] in ("send", "queue")
                     else "skip: " + plan.get("reason", "?").split(" - ")[0])
            who = plan.get("who", {})
            if who.get("email"):
                updates.append({"email": who["email"],
                                "first_name": who.get("first_name") or "",
                                "company": who.get("company") or "",
                                "campaign": first_of(campaign, "name", default=cid),
                                "campaign_id": cid, "person_id": pid,
                                "last_reply": (plan.get("last_reply") or "")[:300],
                                "followups_sent": plan.get("replies_sent", 0),
                                "action": plan["action"], "bucket": plan.get("bucket", ""),
                                "next_action": plan.get("next_action", ""),
                                "sent": False})
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
            if updates:
                updates[-1]["sent"] = True
    return tally, sends


# --- the report: one file that says what the loop did and what is next --------
def collect_hot_leads(api, campaigns, project_id=None):
    rows = []
    for campaign in campaigns:
        cid = first_of(campaign, "id", "campaign_id")
        for lead in api.hot_leads(campaign_id=cid, limit=100):
            email = str(first_of(lead, "email", "email_address", default="")).strip().lower()
            if not email:
                continue
            full = str(first_of(lead, "name", "full_name", default="") or "")
            rows.append({
                "email": email,
                "first_name": first_of(lead, "first_name", "firstname", default="")
                or (full.split()[0] if full.split() else ""),
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
    return rows


def render_report(name, project_id, now, apply_, tally, sends, rows, hot, sheet_note=""):
    """Markdown: what happened this run, lead by lead, and what to do about it."""
    def cell(text, width=70):
        text = str(text or "").replace("|", "/").replace("\n", " ").strip()
        return text if len(text) <= width else text[:width - 1] + "…"

    inbox = INBOX_URL.format(project_id) if project_id else ""
    out = ["# Explee follow-ups — {} — {}".format(name, now.strftime("%Y-%m-%d %H:%M UTC")),
           "",
           "**{}**".format("SENT {} email{}".format(sends, "" if sends == 1 else "s")
                           if apply_ else "DRY RUN — nothing was sent; the emails below are "
                                          "what the next armed run sends"),
           ""]
    if sheet_note:
        out += [sheet_note, ""]
    out += ["To take someone out of the loop: open the lead in the [inbox]({}), write "
            "`booked` or `stop` in the note. Next run it stops.".format(inbox or "#"), ""]
    if tally:
        out += ["| outcome | leads |", "|---|---|"]
        out += ["| {} | {} |".format(cell(k, 50), v)
                for k, v in sorted(tally.items(), key=lambda kv: -kv[1])]
        out.append("")

    acted = [r for r in rows if r["action"] in ("send", "queue")]
    if acted:
        out += ["## This run", "", "| who | campaign | they said | what happened |",
                "|---|---|---|---|"]
        for r in acted:
            what = ("sent " if r["sent"] else "would send " if r["action"] == "send"
                    else "parked: ") + (r["bucket"] or "")
            out.append("| {} ({}) | {} | {} | {} |".format(
                cell(r["first_name"] or r["email"], 24), cell(r["company"], 24),
                cell(r["campaign"], 28), cell(r["last_reply"], 90), cell(what, 40)))
        out.append("")

    waiting = [r for r in rows if r["action"] == "skip"]
    if waiting:
        out += ["## Everyone else who replied", "",
                "| who | campaign | they said | status |", "|---|---|---|---|"]
        for r in waiting:
            out.append("| {} ({}) | {} | {} | {} |".format(
                cell(r["first_name"] or r["email"], 24), cell(r["company"], 24),
                cell(r["campaign"], 28), cell(r["last_reply"], 90),
                cell(r["next_action"], 44)))
        out.append("")

    if hot:
        in_loop = {r["email"] for r in rows}
        out += ["## Hot leads Explee flagged ({})".format(len(hot)), "",
                "| who | title | campaign | went hot | in the loop |", "|---|---|---|---|---|"]
        for h in hot:
            out.append("| {} ({}) | {} | {} | {} | {} |".format(
                cell(h["first_name"] or h["email"], 24), cell(h["company"], 24),
                cell(h["job_title"], 30), cell(h["campaign"], 28),
                cell(str(h["replied_at"])[:10], 12),
                "yes" if h["email"] in in_loop else "no reply thread yet"))
        out.append("")
    return "\n".join(out)


def write_report(text, now, project="project"):
    """reports/<project>/latest.md and a dated copy. One folder per project."""
    folder = REPORTS / state.slug(project)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "latest.md").write_text(text)
    dated = folder / "{}.md".format(now.strftime("%Y-%m-%d"))
    dated.write_text(text)
    return dated


def sync_hot_leads(api, sheet, campaigns, project_id=None, out=sys.stdout, rows=None):
    """Every hot lead into the sheet. The Apps Script drops ones already there."""
    rows = collect_hot_leads(api, campaigns, project_id) if rows is None else rows
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
    token = args.sheet_token or os.environ.get("SHEET_TOKEN") or sheet_cfg.get("token")

    hot = collect_hot_leads(api, campaigns, project_id)
    print("  {} hot leads flagged by Explee".format(len(hot)), file=out)
    if project_id and "auto_reply" not in cfg:
        try:
            cfg["auto_reply"] = bool(first_of(api.autopilot(project_id), "auto_reply_enabled",
                                              default=False))
        except (ExpleeError, ShapeError) as err:
            print("  !! autopilot settings unreadable ({}); assuming no auto-reply".format(err),
                  file=out)
            cfg["auto_reply"] = False
    print("  Explee auto-reply is {}".format("ON - fresh replies are left to it" if cfg.get(
        "auto_reply") else "OFF - fresh replies get answered here"), file=out)
    sheet, excluded, sheet_note = None, set(), ""
    if csv_url or webapp:
        # A sheet that is configured but unreadable stops the run: someone may have
        # marked a booking in it this week, and an empty set would mail them.
        sheet = Sheet(csv_url or None, webapp or None, token)
        if not args.no_sync:
            sync_hot_leads(api, sheet, campaigns, project_id, out=out, rows=hot)
        booked, stopped = sheet.exclusions()
        print("  sheet: {} booked, {} stopped".format(len(booked), len(stopped)), file=out)
        excluded = booked | stopped
        sheet_note = "Also read: the sheet ({} booked, {} stopped).".format(
            len(booked), len(stopped))
    elif args.booked:
        excluded = load_emails(args.booked)
    else:
        print("  booked / stop: read from each lead's note in the Explee inbox", file=out)

    updates = []
    tally, sends = run(api, cfg, campaigns, excluded, load_emails(args.calendar_views),
                       now, args.apply, args.limit, out=out, updates=updates)
    if sheet and args.apply and updates:
        written = sheet.update([{k: u[k] for k in SHEET_KEYS} for u in updates])
        if written:
            print("  {} rows refreshed in the sheet".format(written), file=out)

    print("  " + ("sent {}".format(sends) if args.apply else "DRY RUN - nothing sent"), file=out)
    for label, count in sorted(tally.items(), key=lambda kv: -kv[1]):
        print("    {:<40} {}".format(label, count), file=out)
    path = write_report(render_report(name, project_id, now, args.apply, tally, sends,
                                      updates, hot, sheet_note), now, name)
    print("  report -> reports/{}/{} (and latest.md)".format(path.parent.name, path.name),
          file=out)
    would = sum(1 for u in updates if u["action"] == "send")
    state.record("followups",
                 "{} replied leads read, {} hot; {}".format(
                     len(updates), len(hot),
                     "sent {}".format(sends) if args.apply else "would send {}".format(would)),
                 args.apply, section="followups", now=now, project=name,
                 payload={"project": name, "project_id": project_id, "rows": updates,
                          "hot": hot, "tally": tally, "sends": sends, "sheet": sheet_note},
                 balance=getattr(api, "last_balance", None))
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
  4. Nothing else. Booked / stop is typed into the lead's note in the Explee
     inbox. (A Google Sheet is optional: sheet.csv_url or sheet.webapp_url;
     a web-app token goes in the SHEET_TOKEN environment variable, never here.)

Commit the file - GitHub Actions runs every project it finds in projects/:
  git add projects/ && git commit -m "AutoGTM: add <name>"
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
        state.record("followups", "balance is {} credits - nothing ran".format(balance),
                     args.apply, balance=balance)
        raise SystemExit("balance is {} credits - every request needs a positive balance, "
                         "free ones included. Top up at https://explee.com/billing".format(
                             balance))
    api.last_balance = balance

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
