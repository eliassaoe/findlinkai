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
    "nudge": True,              # the win-back: they went quiet after we answered
}
QUEUED = ("not_now",)                       # dated, fires on a later run
SILENT = ("unsubscribe", "auto_reply", "negative", "booked", "unknown")

# Ordered. The first pattern that matches wins, so every "no" sits above every "yes".
# Ordered. The first pattern that matches wins, so every "no" sits above every
# "yes" - in both languages. The live campaigns write in French and the replies
# come back in French, so the French half is not decoration.
RULES = [
    ("unsubscribe", r"\bunsubscribe\b|\bremove me\b|take me off|stop (emailing|contacting)|"
                    r"d[ée]sabonn|ne plus (me )?(recevoir|contacter)|retirez[- ]moi|"
                    r"supprimez mon"),
    ("auto_reply",  r"out of (the )?office|automatic(al)? repl|auto-repl|annual leave|"
                    r"on (holiday|vacation|parental leave)|away until|"
                    r"absent du bureau|je suis absent|en cong[ée]s?|de retour le|"
                    r"message automatique"),
    ("negative",    r"not interested|no thank|we'?re all set|already (have|use|using)|"
                    r"don'?t need|not a (good )?fit|no need|"
                    r"pas int[ée]ress|non merci|sans suite|je (dois )?d[ée]clin|"
                    r"pas convaincant|pas pour nous|on a d[ée]j[àa]|nous avons d[ée]j[àa]|"
                    r"\bspams?\b|pas le bon moment pour nous"),
    ("booked",      r"\bbooked\b|invite accepted|accepted (the|your) invite|see you (on|then)|"
                    r"calendar invite|confirmed for|added it to my calendar|"
                    r"invitation accept[ée]|c'?est not[ée]|[àa] (jeudi|vendredi|lundi|mardi|"
                    r"mercredi|demain)|bien re[çc]u l'?invitation"),
    ("wrong_person", r"wrong person|not the right person|i don'?t (handle|own|manage)|"
                     r"not my (area|remit)|you'?d want|better (person|contact)|"
                     r"speak (to|with) my colleague|forwarded (this )?to|"
                     r"pas la bonne personne|ce n'?est pas moi qui|voir avec|"
                     r"adressez[- ]vous|je transmets|je fais suivre"),
    ("not_now",     r"not (right )?now|next (quarter|year|month)|\bq[1-4]\b|circle back|"
                    r"revisit|too early|bad timing|after (the )?summer|budget.{0,20}next|"
                    r"reach out (again )?in|"
                    r"pas (pour )?le moment|plus tard|recontact|l'?ann[ée]e prochaine|"
                    r"trop t[ôo]t|apr[èe]s (l'?[ée]t[ée]|les vacances)|en (janvier|septembre)"),
    ("send_info",   r"send (me|over|through)|more info|some info|pricing|how much|"
                    r"a deck|one[- ]pager|case stud|details|documentation|\bcosts?\b|"
                    r"envoyez|envoie[zr]|plus d'?info|des informations|"
                    r"\btarifs?\b|combien|plaquette|une pr[ée]sentation|\bdevis\b"),
    ("question",    r"how does|does it|can you|can it|what about|is it|do you (support|have)|"
                    r"what'?s the|which|why would|"
                    r"comment (ça|ca|vous)|est[- ]ce que|quels? sont|pourquoi|\?"),
    ("warm",        r"interested|sounds (good|interesting|great)|happy to|keen|tell me more|"
                    r"worth a (chat|call)|let'?s (talk|chat)|open to|"
                    r"[çc]a m'?int[ée]resse|int[ée]ress[ée]|volontiers|avec plaisir|"
                    r"open pour|ok pour|d'?accord pour|me pla[îi]t|un (premier )?[ée]change|"
                    r"pourquoi pas|dites m'?en plus"),
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


# strftime's day and month names follow the machine's locale, which on a server is
# almost always English. A French email proposing "Thursday 4 September" is worse
# than no email, so the names are data, not a locale lookup.
DAYS = {"fr": ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"),
        "en": ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")}
MONTHS = {"fr": ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
                 "septembre", "octobre", "novembre", "décembre"),
          "en": ("January", "February", "March", "April", "May", "June", "July", "August",
                 "September", "October", "November", "December")}


def say_slot(slot, language="en"):
    """'jeudi 4 septembre à 10h00 (CEST)' - a time, in the lead's language."""
    lang = language if language in DAYS else "en"
    day, month = DAYS[lang][slot.weekday()], MONTHS[lang][slot.month - 1]
    zone = slot.strftime("%Z") or "UTC"
    if lang == "fr":
        return "{} {} {} à {}h{:02d} ({})".format(
            day, slot.day, month, slot.hour, slot.minute, zone)
    return "{} {} {} at {:02d}:{:02d} ({})".format(
        day, slot.day, month, slot.hour, slot.minute, zone)


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
TEMPLATES = {
    "fr": {
        "send_info": ("Bonjour {first},\n\nEn deux lignes : {offer}\n{proof}\n"
                      "Plutôt que de vous envoyer un lien, quinze minutes suffisent pour "
                      "voir si c'est pertinent pour {company}.\n\n{slots}\n\n{sender}"),
        "warm": ("Bonjour {first},\n\nMerci pour votre retour. {offer}\n{proof}\n"
                 "Quinze minutes suffisent pour savoir si ça vaut votre temps.\n\n"
                 "{slots}\n\n{sender}"),
        "opened_no_book": ("Bonjour {first},\n\nJ'ai vu que vous aviez regardé l'agenda sans "
                           "trouver de créneau - c'est généralement que je propose les mauvais "
                           "horaires.\n\n{slots}\n\n{sender}"),
        "question": ("Bonjour {first},\n\n{answer}\n\n{offer}\n"
                     "Je vous montre volontiers ce que ça donne sur le cas de {company}.\n\n"
                     "{slots}\n\n{sender}"),
        "wrong_person": ("Bonjour {first},\n\nMerci de me le dire, et désolé pour le "
                         "dérangement.\n\nQui s'occupe de {topic} chez {company} ? Un nom me "
                         "suffit et je ne vous embête plus.\n\n{sender}"),
        "re_engage": ("Bonjour {first},\n\nVous m'aviez dit de revenir plus tard - nous y "
                      "sommes.\n\n{offer}\n{proof}\n{slots}\n\nSi le timing ne va toujours "
                      "pas, dites-le-moi et j'arrête.\n\n{sender}"),
        "nudge": ("Bonjour {first},\n\nJe reviens vers vous sur mon message précédent - "
                  "toujours d'actualité de votre côté ?\n\n{slots}\n\n{sender}"),
    },
    "en": {
        "send_info": ("Hi {first},\n\nHere it is, short version: {offer}\n{proof}\n"
                      "Rather than send you a link and hope, it is quicker to show you the "
                      "part that matters for {company} in fifteen minutes.\n\n{slots}\n\n"
                      "{sender}"),
        "warm": ("Hi {first},\n\nGlad it landed. {offer}\n{proof}\n"
                 "Fifteen minutes is enough to know whether this is worth your time.\n\n"
                 "{slots}\n\n{sender}"),
        "opened_no_book": ("Hi {first},\n\nI saw you had a look at the calendar and nothing "
                           "fitted - that is usually my fault for offering the wrong "
                           "times.\n\n{slots}\n\n{sender}"),
        "question": ("Hi {first},\n\n{answer}\n\n{offer}\n"
                     "Happy to walk through it against {company}'s own setup.\n\n{slots}"
                     "\n\n{sender}"),
        "wrong_person": ("Hi {first},\n\nThanks for saying so - and sorry for landing in the "
                         "wrong inbox.\n\nWho owns {topic} at {company}? A name is enough and "
                         "I will take it from there.\n\n{sender}"),
        "re_engage": ("Hi {first},\n\nYou asked me to come back to this later - it is "
                      "later.\n\n{offer}\n{proof}\n{slots}\n\nIf the timing is still "
                      "wrong, say so and I will stop.\n\n{sender}"),
        "nudge": ("Hi {first},\n\nComing back to my last note - is this still live on your "
                  "side?\n\n{slots}\n\n{sender}"),
    },
}

SLOT_LINE = {
    "fr": "Deux créneaux possibles : {} ou {}. Si aucun ne va, donnez-moi un jour et "
          "j'envoie l'invitation.",
    "en": "Would either of these work? {} or {}. If neither does, tell me a day that suits "
          "and I will send an invite.",
}


def compose(bucket, ctx, language="en"):
    """The follow-up body. Raises if a slot-bearing bucket lost its slots."""
    first = ctx.get("first_name") or "there"
    offer = ctx["offer"]                       # one line, from config
    proof = ctx.get("proof", "")               # optional second line
    sender = ctx["sender"]
    slots = ctx.get("slots") or []
    lang = language if language in TEMPLATES else "en"
    slot_line = SLOT_LINE[lang].format(*slots) if len(slots) == 2 else ""
    body = TEMPLATES[lang].get(bucket)
    if body is None:
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
