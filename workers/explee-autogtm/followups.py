#!/usr/bin/env python3
"""Read one reply, decide which bucket it is in, write the follow-up for it.

    python3 followups.py "sounds interesting, can you send me pricing?"

WHY THE CLASSIFIER IS RULES AND NOT A MODEL
-------------------------------------------
This decides whether to send mail to a real person who is already annoyed enough
to have been cold-emailed once. A language model asked "is this a positive
reply?" says yes to almost anything, including "please stop". The rules below
are ordered so that every way of saying no - unsubscribe, not interested, out of
office, already booked - is matched and excluded BEFORE any rule that could send
something. Anything the rules do not recognise is `unknown`, which never sends
and goes to a human. A quiet miss costs one recovered call; a wrong send costs a
spam complaint on a domain that took months to warm.

THE BUCKETS ARE THE PLAN'S TABLE
--------------------------------
    "Send me info"                 -> info + two named times, never a bare link
    Warm, never opened calendar    -> drop the link, offer two specific slots
    Opened calendar, didn't book   -> one nudge (needs scheduler data, see below)
    "Not now"                      -> dated re-engage queue, fires automatically
    Wrong person                   -> ask who owns it
    Question / objection           -> answer it, then propose a time

`opened_no_book` cannot be derived from the Explee API: it exposes the
conversation, not what the lead did on your booking page. Feed it in with
--calendar-views (a JSON list of emails that opened the scheduler and did not
book, exported from Cal.com/Calendly). Without that file those leads land in
`warm` and get the same two slots, which is a softer version of the right move.

TWO NAMED TIMES, ALWAYS
-----------------------
Every sending template proposes two concrete slots in the recipient's working
hours, on two different days, at least MIN_LEAD_HOURS out. `compose` refuses to
return a message for a slot-bearing bucket that does not contain both of them,
so a template edit cannot quietly turn these back into "here's my link".
"""

import argparse
import datetime as dt
import re
import sys

try:
    from zoneinfo import ZoneInfo
except ImportError:                                   # pragma: no cover
    ZoneInfo = None

MIN_LEAD_HOURS = 18       # nobody books a slot that is in two hours
BUSINESS_DAYS = (0, 1, 2, 3, 4)
SLOT_HOURS = (10, 15)     # one mid-morning, one mid-afternoon

# Buckets that get a follow-up, and whether that follow-up carries times.
SENDING = {
    "send_info": True,
    "warm": True,
    "opened_no_book": True,
    "question": True,
    "wrong_person": False,
    "re_engage": True,          # the dated queue below, fired on a later run
}
QUEUED = ("not_now",)                       # dated, fires on a later run
SILENT = ("unsubscribe", "auto_reply", "negative", "booked", "unknown")

# Ordered. The first pattern that matches wins, so every "no" sits above every "yes".
RULES = [
    ("unsubscribe", r"\bunsubscribe\b|\bremove me\b|take me off|stop (emailing|contacting)"),
    ("auto_reply",  r"out of (the )?office|automatic(al)? repl|auto-repl|annual leave|"
                    r"on (holiday|vacation|parental leave)|away until|absent du bureau"),
    ("negative",    r"not interested|no thank|we'?re all set|already (have|use|using)|"
                    r"don'?t need|not a (good )?fit|no need|pas int[ée]ress"),
    ("booked",      r"\bbooked\b|invite accepted|accepted (the|your) invite|see you (on|then)|"
                    r"calendar invite|confirmed for|added it to my calendar"),
    ("wrong_person", r"wrong person|not the right person|i don'?t (handle|own|manage)|"
                     r"not my (area|remit)|you'?d want|better (person|contact)|"
                     r"speak (to|with) my colleague|forwarded (this )?to"),
    ("not_now",     r"not (right )?now|next (quarter|year|month)|\bq[1-4]\b|circle back|"
                    r"revisit|too early|bad timing|after (the )?summer|budget.{0,20}next|"
                    r"reach out (again )?in"),
    ("send_info",   r"send (me|over|through)|more info|some info|pricing|how much|"
                    r"a deck|one[- ]pager|case stud|details|documentation|\bcosts?\b"),
    ("question",    r"how does|does it|can you|can it|what about|is it|do you (support|have)|"
                    r"what'?s the|which|why would|\?"),
    ("warm",        r"interested|sounds (good|interesting|great)|happy to|keen|tell me more|"
                    r"worth a (chat|call)|let'?s (talk|chat)|open to"),
]


def classify(text, opened_calendar=False):
    """(bucket, evidence). `opened_calendar` promotes a would-be sender, never a no."""
    body = (text or "").strip().lower()
    if not body:
        return "unknown", "empty message"
    for bucket, pattern in RULES:
        match = re.search(pattern, body)
        if match:
            if opened_calendar and bucket in ("warm", "send_info", "question"):
                return "opened_no_book", "matched /{}/ on {!r}, and opened the scheduler".format(
                    bucket, match.group(0))
            return bucket, "matched /{}/ on {!r}".format(bucket, match.group(0))
    if opened_calendar:
        return "opened_no_book", "no rule matched, but opened the scheduler"
    return "unknown", "no rule matched"


# --- when to propose ---------------------------------------------------------
def two_slots(now, timezone="UTC", hours=SLOT_HOURS, min_lead_hours=MIN_LEAD_HOURS):
    """Two bookable slots, on two different business days, both far enough out."""
    zone = ZoneInfo(timezone) if ZoneInfo else dt.timezone.utc
    local = now.astimezone(zone)
    earliest = local + dt.timedelta(hours=min_lead_hours)
    found, day, seen_days = [], local.date(), set()
    for _ in range(21):                       # three weeks is plenty; guards the loop
        if day.weekday() in BUSINESS_DAYS and day not in seen_days:
            # A different hour for each slot: two 10am options read as one offer,
            # a morning and an afternoon read as two.
            shift = len(found) % len(hours)
            for hour in tuple(hours)[shift:] + tuple(hours)[:shift]:
                slot = dt.datetime.combine(day, dt.time(hour), tzinfo=zone)
                if slot >= earliest:
                    found.append(slot)
                    seen_days.add(day)
                    break
        if len(found) == 2:
            return found
        day += dt.timedelta(days=1)
    raise RuntimeError("could not find two slots - check the timezone and hours")


def say_slot(slot):
    """'Thursday 4 September at 10:00 (CEST)' - a time, not a link."""
    stamp = slot.strftime("%A %-d %B at %H:%M") if sys.platform != "win32" \
        else slot.strftime("%A %d %B at %H:%M")
    zone = slot.strftime("%Z") or "UTC"
    return "{} ({})".format(stamp, zone)


def re_engage_date(text, now, default_days=90):
    """When 'not now' means. Reads the lead's own words, falls back to a quarter."""
    body = (text or "").lower()
    weeks = re.search(r"in (\d{1,2}) weeks?", body)
    months = re.search(r"in (\d{1,2}) months?", body)
    days = default_days
    if weeks:
        days = int(weeks.group(1)) * 7
    elif months:
        days = int(months.group(1)) * 30
    elif re.search(r"next month", body):
        days = 30
    elif re.search(r"next (quarter)|\bq[1-4]\b|after (the )?summer", body):
        days = 90
    elif re.search(r"next year", body):
        days = 180
    return (now + dt.timedelta(days=min(days, 365))).date()


# --- what to say -------------------------------------------------------------
def compose(bucket, ctx):
    """The follow-up body. Raises if a slot-bearing bucket lost its slots."""
    first = ctx.get("first_name") or "there"
    offer = ctx["offer"]                       # one line, from config
    proof = ctx.get("proof", "")               # optional second line
    sender = ctx["sender"]
    slots = ctx.get("slots") or []
    slot_line = ("Would either of these work? {} or {}. If neither does, tell me a day "
                 "that suits and I will send an invite.".format(*slots) if len(slots) == 2 else "")

    if bucket == "send_info":
        body = ("Hi {first},\n\nHere it is, short version: {offer}\n{proof}\n"
                "Rather than send you a link and hope, it is quicker to show you the part "
                "that matters for {company} in fifteen minutes.\n\n{slots}\n\n{sender}")
    elif bucket == "warm":
        body = ("Hi {first},\n\nGlad it landed. {offer}\n{proof}\n"
                "Fifteen minutes is enough to know whether this is worth your time.\n\n"
                "{slots}\n\n{sender}")
    elif bucket == "opened_no_book":
        body = ("Hi {first},\n\nI saw you had a look at the calendar and nothing fitted - "
                "that is usually my fault for offering the wrong times.\n\n{slots}\n\n{sender}")
    elif bucket == "question":
        body = ("Hi {first},\n\n{answer}\n\n{offer}\n"
                "Happy to walk through it against {company}'s own setup.\n\n{slots}\n\n{sender}")
    elif bucket == "re_engage":
        body = ("Hi {first},\n\nYou asked me to come back to this later - it is later.\n\n"
                "{offer}\n{proof}\n{slots}\n\nIf the timing is still wrong, say so and I "
                "will stop.\n\n{sender}")
    elif bucket == "wrong_person":
        body = ("Hi {first},\n\nThanks for saying so - and sorry for landing in the wrong "
                "inbox.\n\nWho owns {topic} at {company}? A name is enough and I will take it "
                "from there.\n\n{sender}")
    else:
        raise ValueError("{} is not a sending bucket".format(bucket))

    message = body.format(first=first, offer=offer, proof=proof, sender=sender,
                          company=ctx.get("company") or "your team",
                          topic=ctx.get("topic", "outbound"),
                          answer=ctx.get("answer", "Short answer: yes."),
                          slots=slot_line)
    message = re.sub(r"\n{3,}", "\n\n", message).strip()

    if SENDING.get(bucket) and not all(slot in message for slot in slots):
        raise ValueError("{} must propose both times - the template dropped them".format(bucket))
    if SENDING.get(bucket) and not slots:
        raise ValueError("{} needs two slots and got none".format(bucket))
    return message


def _cli(argv):
    ap = argparse.ArgumentParser(description="Classify one reply and print the follow-up.")
    ap.add_argument("text")
    ap.add_argument("--opened-calendar", action="store_true")
    ap.add_argument("--timezone", default="Europe/Paris")
    args = ap.parse_args(argv[1:])

    bucket, why = classify(args.text, opened_calendar=args.opened_calendar)
    print("bucket: {}  ({})".format(bucket, why))
    now = dt.datetime.now(dt.timezone.utc)
    if bucket in QUEUED:
        print("re-engage on: {}".format(re_engage_date(args.text, now)))
        return 0
    if bucket in SILENT:
        print("nothing sends. This bucket is handled by a human, or not at all.")
        return 0
    slots = [say_slot(s) for s in two_slots(now, args.timezone)]
    print("\n" + compose(bucket, {"first_name": "Alex", "company": "Acme",
                                  "offer": "<offer line from config.json>",
                                  "sender": "<sender from config.json>", "slots": slots}))
    return 0


if __name__ == "__main__":
    sys.exit(_cli(sys.argv))
