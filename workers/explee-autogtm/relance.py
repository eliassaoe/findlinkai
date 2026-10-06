#!/usr/bin/env python3
"""
Relance — pilote de relance des hot leads Explee.

  python3 relance.py VOTRE_CLE_API      → ouvre http://localhost:8787
  python3 relance.py --demo             → même interface avec des données d'exemple

Séquence par lead (jours ouvrés, comptés depuis votre réponse au lead) :
  J+1  Email 1  — créneau précis, « un simple oui suffit »
  J+2  Appel    — seulement si un numéro figure dans sa signature
  J+4  Email 2  — angle valeur (ce qu'il repart avec)
  J+8  Email 3  — clôture polie
La séquence s'arrête dès que le lead répond (il repasse en « À répondre »),
quand vous marquez « RDV calé » ou « Pas intéressé ».
Si le lead a demandé d'attendre (« après le 14 », « semaine prochaine »…),
la première relance est décalée automatiquement.

Aucune dépendance (Python 3.9+). Clé et état restent sur votre ordinateur
(fichier relance_state.json à côté du script). Aucun crédit Explee consommé.
"""
import csv
import io
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Europe/Paris")
except Exception:  # Windows sans tzdata
    TZ = timezone(timedelta(hours=2))

BASE = "https://api.explee.com/public/api/v1"
PORT = int(os.environ.get("RELANCE_PORT", "8787"))
HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / "relance_state.json"

# Cadence : (étape, jours ouvrés après votre réponse)
CADENCE_WITH_PHONE = [("email1", 1), ("call", 2), ("email2", 4), ("email3", 8)]
CADENCE_NO_PHONE = [("email1", 1), ("email2", 4), ("email3", 8)]
STEP_LABEL = {"reply": "Répondre", "email1": "Email 1", "call": "Appel",
              "email2": "Email 2", "email3": "Email 3"}

# ═══════════════════════════════════════════════════════════ utilitaires

def pick(d, *keys, default=""):
    if not isinstance(d, dict):
        return default
    for k in keys:
        cur = d
        for part in k.split("."):
            cur = cur.get(part) if isinstance(cur, dict) else None
        if cur not in (None, "", [], {}):
            return cur
    return default


def first_list(d, *keys):
    if isinstance(d, list):
        return d
    for k in keys:
        v = d.get(k) if isinstance(d, dict) else None
        if isinstance(v, list):
            return v
    return []


def parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ)


def now():
    return datetime.now(TZ)


def add_bdays(d, n):
    """d (date) + n jours ouvrés."""
    while n > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


def next_bday(d):
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]


def fr_day(d, ref=None):
    ref = ref or now().date()
    if d == ref + timedelta(days=1):
        return f"demain {JOURS[d.weekday()]}"
    if (d - ref).days < 7:
        return f"{JOURS[d.weekday()]} {d.day}"
    return f"{JOURS[d.weekday()]} {d.day} {MOIS[d.month - 1]}"

# ═══════════════════════════════════════════════════════════ texte des emails

QUOTE_CUT = re.compile(
    r"(^[ \t>]*Le \d.{0,140}?a écrit ?:|^[ \t>]*Le (?:lun|mar|mer|jeu|ven|sam|dim).{0,140}?a écrit ?:|"
    r"^[ \t>]*On .{0,140}?wrote:|-----Original Message-----|"
    r"^[ \t]*De ?: .{0,140}?\n.{0,12}Envoy|^[ \t]*From: .{0,140}?\nSent:)", re.S | re.M)


def strip_quoted(text):
    text = text or ""
    m = QUOTE_CUT.search(text)
    if m:
        text = text[:m.start()]
    return "\n".join(l for l in text.splitlines() if not l.lstrip().startswith(">")).strip()


INTL = re.compile(r"(?<![\d+])(?:\+|00)\s?(?:33|32|41|352|377|1|44|212|213|216|49|39|34|971)"
                  r"(?:[\s.\-()]*\d){7,12}")
FR_NATIONAL = re.compile(r"(?<![\d+])0[1-9](?:[\s.\-]?\d{2}){4}(?!\d)")


def normalize_phone(raw):
    raw = raw.strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("00"):
        return "+" + digits[2:]
    if raw.startswith("+"):
        return "+" + digits
    if len(digits) == 10 and digits.startswith("0"):
        return "+33" + digits[1:]
    return digits


def pretty_phone(p):
    if p.startswith("+33") and len(p) == 12:
        n = "0" + p[3:]
        return " ".join(n[i:i + 2] for i in range(0, 10, 2))
    if p.startswith("+41") and len(p) == 12:
        return f"+41 {p[3:5]} {p[5:8]} {p[8:10]} {p[10:]}"
    return p


def is_mobile(p):
    return (p.startswith("+336") or p.startswith("+337") or p.startswith("+417")
            or p.startswith("+324") or p.startswith("+3526"))


def extract_phones(text):
    flat = re.sub(r"\s+", " ", strip_quoted(text))
    out = []
    for rx in (INTL, FR_NATIONAL):
        for m in rx.finditer(flat):
            p = normalize_phone(m.group(0))
            if 9 <= len(re.sub(r"\D", "", p)) <= 15 and p not in out:
                out.append(p)
    out.sort(key=lambda p: not is_mobile(p))  # mobile d'abord
    return out


LINK_RX = re.compile(r"https?://(?:cal\.link|calendly\.com|cal\.com|zcal\.co|tidycal\.com|"
                     r"meetings\.hubspot\.com|savvycal\.com)/[^\s<>\")]+", re.I)


def clean_cal_link(url):
    u = urllib.parse.urlsplit(url.rstrip(".,;"))
    q = [(k, v) for k, v in urllib.parse.parse_qsl(u.query) if k not in ("back", "month", "date")]
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, urllib.parse.urlencode(q), ""))


def detect_wait_until(text, ref):
    """Le lead demande d'attendre → date à partir de laquelle relancer."""
    t = strip_quoted(text).lower()
    m = re.search(r"(?:après|apres|à partir du|a partir du|dès le|des le|pas avant le|pas avant)\s+(?:le\s+)?(\d{1,2})"
                  r"(?:\s+(" + "|".join(MOIS) + r"))?", t)
    if m:
        day = int(m.group(1))
        month = MOIS.index(m.group(2)) + 1 if m.group(2) else ref.month
        year = ref.year
        try:
            d = date(year, month, day)
        except ValueError:
            d = None
        if d and d < ref:
            month = month + 1 if not m.group(2) else month
            year = year + (1 if month > 12 or m.group(2) else 0)
            month = (month - 1) % 12 + 1
            try:
                d = date(year, month, day)
            except ValueError:
                d = None
        if d:
            starts_after = m.group(0).startswith(("après", "apres"))
            return next_bday(d + timedelta(days=1 if starts_after else 0))
    if "semaine prochaine" in t:
        return ref + timedelta(days=7 - ref.weekday())
    m = re.search(r"(?:en|début|debut|courant|fin)\s+(" + "|".join(MOIS) + r")", t)
    if m:
        month = MOIS.index(m.group(1)) + 1
        year = ref.year + (1 if month < ref.month else 0)
        if month != ref.month:
            return next_bday(date(year, month, 1))
    if re.search(r"rentrée|rentree", t) and ref.month in (6, 7, 8):
        return next_bday(date(ref.year, 9, 1))
    return None


def preferred_hour(text):
    t = strip_quoted(text).lower()
    if re.search(r"fin d.après[- ]midi|en fin de journée|après 17|apres 17|soir", t):
        return 17
    if re.search(r"après[- ]midi|apres[- ]midi", t):
        return 14
    if re.search(r"\bmatin", t):
        return 10
    return 11

# ═══════════════════════════════════════════════════════════ note Explee → état

NOTE_STAMP = re.compile(r"^\s*\[(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?\]\s*")
ISO_DAY = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
FR_DAY = re.compile(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b")


def _day_in(text, ref):
    m = ISO_DAY.search(text)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = FR_DAY.search(text)
    if m:
        y = int(m.group(3)) if m.group(3) else ref.year
        y = y + 2000 if y < 100 else y
        try:
            d = date(y, int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
        return d if m.group(3) or d >= ref - timedelta(days=60) else date(y + 1, d.month, d.day)
    return None


def state_from_note(note, ref=None):
    """Lit la note partagée du lead sur Explee et en tire l'état de relance.

    Une ligne par action, la dernière l'emporte. La page /relance écrit ces lignes
    (« [06/10 20:12] Relance · Appel : message laissé ») ; on peut aussi les taper
    à la main dans l'inbox : `booked`, `rdv`, `stop`, `ne pas relancer` (mêmes mots
    que recover.py), `appel : pas de réponse`, `attendre jusqu'au 15/10`…
    """
    ref = ref or now().date()
    st = {}
    for raw in (note or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        at = None
        m = NOTE_STAMP.match(line)
        if m:
            y = int(m.group(3)) if m.group(3) else ref.year
            y = y + 2000 if y < 100 else y
            try:
                at = datetime(y, int(m.group(2)), int(m.group(1)), int(m.group(4) or 9), int(m.group(5) or 0), tzinfo=TZ)
                if at.date() > ref + timedelta(days=1):
                    at = at.replace(year=y - 1)
            except ValueError:
                at = None
            line = line[m.end():]
        low = line.lower()
        low = re.sub(r"^relance\s*·\s*", "", low)
        if re.search(r"réactiv|reactiv", low):
            st.pop("status", None)
            continue
        if low.startswith(("appel", "call")):
            out = None
            if re.search(r"rdv|rendez|booked", low):
                out = "booked"
            elif re.search(r"pas intéress|pas interess|not interested", low):
                out = "not_interested"
            elif re.search(r"rappeler|retry|callback", low):
                out = "retry"
            elif re.search(r"message|messagerie|voicemail|répondeur|repondeur", low):
                out = "voicemail"
            elif re.search(r"pas de réponse|pas de reponse|no answer|injoignable", low):
                out = "no_answer"
            if out:
                call = {"outcome": out, "at": (at or datetime.combine(ref, datetime.min.time(), TZ)).isoformat()}
                if out == "retry":
                    d = _day_in(low, ref)
                    if d:
                        call["retry_at"] = datetime.combine(d, datetime.min.time(), TZ).replace(hour=9).isoformat()
                st["call"] = call
                if out == "booked":
                    st["status"] = "booked"
                if out == "not_interested":
                    st["status"] = "lost"
            continue
        if re.search(r"attendre|reporter|reporté|reportee|snooze|pas avant", low):
            d = _day_in(low, ref)
            if d:
                st["snooze_until"] = datetime.combine(d, datetime.min.time(), TZ).replace(hour=9).isoformat()
            elif re.search(r"retir|annul", low):
                st.pop("snooze_until", None)
            continue
        if low.startswith(("email envoyé", "suivi linkfinder")):
            continue
        if re.search(r"\b(booked|rdv|rendez-vous|meeting booked)\b", low):
            st["status"] = "booked"
        elif re.search(r"\b(stop|ne pas relancer|pas intéressée?|pas interessee?|not interested|perdu)\b", low):
            st["status"] = "lost"
    return st


# ═══════════════════════════════════════════════════════════ messages

def msg_text(m):
    return str(pick(m, "body_text", "text", "body", "content", "snippet", "html", default=""))


def msg_date(m):
    return parse_dt(pick(m, "sent_at", "date", "created_at", "received_at", "timestamp", default=""))


def from_lead(m, lead_email):
    d = str(pick(m, "direction", "type", "kind", "role", default="")).lower()
    if d in ("inbound", "in", "received", "reply", "incoming", "lead", "contact"):
        return True
    if d in ("outbound", "out", "sent", "outgoing", "us", "user", "agent", "followup", "first"):
        return False
    for f in ("is_inbound", "from_lead", "is_reply", "is_from_lead", "incoming"):
        if isinstance(m.get(f), bool):
            return m[f]
    for f in ("is_outbound", "from_us", "outgoing"):
        if isinstance(m.get(f), bool):
            return not m[f]
    sender = str(pick(m, "from_email", "from.email", "from", "sender", "sender_email", default="")).lower()
    if sender and lead_email:
        return lead_email.split("@")[-1].lower() in sender
    return False


def sender_identity(outbound_texts):
    signoff, name = "Cordialement", "Tom"
    for t in reversed(outbound_texts):
        body = strip_quoted(t)
        m = re.search(r"(Bien cordialement|Très cordialement|Cordialement|Belle journée|Bonne journée|"
                      r"Bien à vous|À bientôt|Merci)\s*,?\s*\n+\s*([A-ZÉÈ][\w\-éèï]+)", body)
        if m:
            return m.group(1), m.group(2)
    return signoff, name

# ═══════════════════════════════════════════════════════════ brouillons

def drafts_for(ctx):
    p, co, link = ctx["first_name"], ctx["company"], ctx["cal_link"]
    hello = f"Bonjour {p}," if p else "Bonjour,"
    sig = f"{ctx['signoff']},\n{ctx['me']}"
    via = " sur Teams" if ctx["teams"] else ""
    s1, s2 = ctx["slot1"], ctx["slot2"]
    link_line = f"Sinon, un autre moment ici :\n{link}" if link else "Sinon, dites-moi ce qui vous arrange."
    ref = f"vous m'aviez répondu par email au sujet de {co}" if co else "vous m'aviez répondu par email"
    return {
        "reply": (f"{hello}\n\nMerci, avec plaisir. Je vous propose {s1}{via}, cela vous irait ?\n\n"
                  f"Un simple « oui » suffit et je vous envoie l'invitation. {link_line}\n\n{sig}"),
        "email1": (f"{hello}\n\nJe vous propose de caler notre quart d'heure : {s1}{via}, cela vous irait ?\n\n"
                   f"Un simple « oui » suffit et je vous envoie l'invitation. {link_line}\n\n{sig}"),
        "email2": (f"{hello}\n\nPour que le quart d'heure vous serve vraiment, je regarde avant l'appel vos "
                   f"publicités en cours et vos pages d'arrivée{(' chez ' + co) if co else ''}. Vous repartez "
                   f"avec la liste de ce qu'il faut corriger, que l'on travaille ensemble ou non.\n\n"
                   f"{s2[0].upper() + s2[1:]}{via} ?" + (f" Ou ici :\n{link}" if link else "") + f"\n\n{sig}"),
        "email3": (f"{hello}\n\nJe ne veux pas encombrer votre boîte. Si le moment n'est pas le bon, "
                   f"je ferme le dossier de mon côté.\n\nSi c'est toujours d'actualité, répondez simplement "
                   f"« oui » et je m'adapte à votre agenda." + (f"\n{link}" if link else "") + f"\n\n{sig}"),
        "call": (f"« Bonjour {p or '…'}, {ctx['me']} de Prescient, {ref}. Je vous appelle trente secondes "
                 f"pour caler le quart d'heure : {s1} ou {s2}, qu'est-ce qui vous arrange ? »\n\n"
                 f"S'il dit oui → envoyez l'invitation pendant l'appel.\n"
                 f"S'il hésite → « Le quart d'heure sert à vous montrer où part votre budget pub. "
                 f"Vous gardez l'analyse, même sans suite. »"),
        "voicemail": (f"« Bonjour {p or ''}, {ctx['me']} de Prescient, suite à votre réponse par email. "
                      f"Je vous renvoie un créneau par écrit, vous n'aurez qu'à dire oui. Bonne journée. »"),
        "sms": (f"Bonjour {p}, {ctx['me']} de Prescient (suite à votre email). {s1[0].upper() + s1[1:]}"
                f"{via} pour notre quart d'heure, ça vous va ?" + (f" Sinon : {link}" if link else "")),
    }

# ═══════════════════════════════════════════════════════════ moteur de cadence

def compute(lead, thread, state, ref_dt=None):
    ref_dt = ref_dt or now()
    today = ref_dt.date()
    email = str(pick(lead, "email", "person.email"))
    msgs = first_list(thread or {}, "messages", "thread", "emails", "items", "conversation")
    msgs = sorted(msgs, key=lambda m: msg_date(m) or datetime.min.replace(tzinfo=TZ))

    inbound = [m for m in msgs if from_lead(m, email)]
    outbound = [m for m in msgs if not from_lead(m, email)]
    last_in = inbound[-1] if inbound else None
    last_in_dt = msg_date(last_in) if last_in else None
    after = [m for m in outbound if last_in_dt and (msg_date(m) or ref_dt) > last_in_dt]

    phones = []
    for m in inbound:
        for p in extract_phones(msg_text(m)):
            if p not in phones:
                phones.append(p)
    known = pick(lead, "phone", "phone_number", "mobile", "person.phone")
    if known:
        for p in extract_phones(str(known)) or [normalize_phone(str(known))]:
            if p not in phones:
                phones.insert(0, p)

    lead_texts = " \n".join(msg_text(m) for m in inbound)
    last_in_text = msg_text(last_in) if last_in else ""
    links = [clean_cal_link(u) for m in outbound for u in LINK_RX.findall(msg_text(m))]
    signoff, me = sender_identity([msg_text(m) for m in outbound])

    first = str(pick(lead, "first_name", "person.first_name"))
    last = str(pick(lead, "last_name", "person.last_name"))
    full = str(pick(lead, "full_name", "name", "person.name", default=f"{first} {last}".strip()))
    if not first:
        local = email.split("@")[0].split(".")[0]
        if local.isalpha() and len(local) > 2 and local.lower() not in ("contact", "info", "hello", "bonjour", "admin"):
            first = local.capitalize()
    company = str(pick(lead, "company_name", "company.name", "company", "organization"))
    domain = str(pick(lead, "company_domain", "company.domain", "domain", default=email.split("@")[-1]))
    if not company:
        company = domain.split(".")[0].capitalize()

    st = state or {}
    wait_until = parse_dt(st.get("snooze_until")).date() if st.get("snooze_until") else None
    auto_wait = detect_wait_until(last_in_text, (last_in_dt or ref_dt).date()) if last_in_text else None
    if auto_wait and (not wait_until) and auto_wait > (last_in_dt or ref_dt).date():
        wait_until = auto_wait
    hour = preferred_hour(lead_texts)
    teams = bool(re.search(r"\bteams\b", lead_texts, re.I))

    # ---- statut et prochaine action
    cadence = CADENCE_WITH_PHONE if phones else CADENCE_NO_PHONE
    steps, nxt, status = [], None, "active"
    base = msg_date(after[0]).date() if after else None
    relances_sent = max(0, len(after) - 1)
    call = st.get("call") or {}

    if st.get("status") in ("booked", "lost"):
        status = st["status"]
    elif last_in is not None and not after:
        status = "reply"
    elif not msgs:
        status = "unknown"

    email_i = 0
    sent_dates = [msg_date(m).date() for m in after[1:]]
    prev_done = base
    for key, offset in cadence:
        sched = add_bdays(base, offset) if base else None
        if key == "call":
            done = bool(call.get("outcome")) and call.get("outcome") not in ("retry",)
            done_at = parse_dt(call.get("at")).date() if call.get("at") else None
            retry = call.get("outcome") == "retry"
        else:
            done = email_i < relances_sent
            done_at = sent_dates[email_i] if done and email_i < len(sent_dates) else None
            email_i += 1
            retry = False
        due = sched
        if due and prev_done:
            due = max(due, add_bdays(prev_done, 1))
        if due and wait_until:
            due = max(due, wait_until)
        if retry and call.get("retry_at"):
            due = parse_dt(call["retry_at"]).date()
        steps.append({"key": key, "label": STEP_LABEL[key], "done": done,
                      "done_at": done_at.isoformat() if done_at else None,
                      "due": due.isoformat() if due else None,
                      "outcome": call.get("outcome") if key == "call" else None})
        if done:
            prev_done = done_at or prev_done
        elif nxt is None and status == "active":
            nxt = steps[-1]

    if status == "active" and nxt is None and base:
        status = "finished"
    if status == "reply":
        nxt = {"key": "reply", "label": "Répondre", "due": (last_in_dt.date() if last_in_dt else today).isoformat()}

    due_d = date.fromisoformat(nxt["due"]) if nxt and nxt.get("due") else None
    if status == "reply":
        bucket = "reply"
    elif status in ("booked", "lost", "finished", "unknown"):
        bucket = status
    elif due_d and due_d <= today:
        bucket = "call" if nxt["key"] == "call" else "today"
    else:
        bucket = "scheduled"

    # créneaux proposés : prochain jour ouvré ≥ max(demain, attente)
    d1 = next_bday(max(today + timedelta(days=1), wait_until or today))
    d2 = add_bdays(d1, 1)
    h2 = 17 if hour != 17 else 11
    ctx = {"first_name": first, "company": company, "cal_link": links[-1] if links else "",
           "signoff": signoff, "me": me, "teams": teams,
           "slot1": f"{fr_day(d1, today)} à {hour}h", "slot2": f"{fr_day(d2, today)} à {h2}h"}

    last_msg = msgs[-1] if msgs else None
    last_dt = msg_date(last_msg) if last_msg else None
    cid = pick(lead, "campaign_id", "campaign.id")
    pid = pick(lead, "person_id", "contact_id", "id")
    return {
        "key": f"{cid}:{pid}", "campaign_id": cid, "person_id": pid,
        "name": full or email, "first_name": first, "email": email,
        "title": str(pick(lead, "job_title", "title", "person.job_title")),
        "company": company, "domain": domain,
        "linkedin": str(pick(lead, "linkedin_url", "person.linkedin_url")),
        "phones": [{"raw": p, "pretty": pretty_phone(p), "mobile": is_mobile(p)} for p in phones],
        "hot_since": str(pick(lead, "became_hot_at"))[:10],
        "status": status, "bucket": bucket, "next": nxt, "steps": steps,
        "relances_sent": relances_sent,
        "wait_until": wait_until.isoformat() if wait_until else None,
        "wait_auto": bool(auto_wait and not st.get("snooze_until")),
        "last_from": ("lead" if from_lead(last_msg, email) else "me") if last_msg else None,
        "last_at": last_dt.isoformat() if last_dt else None,
        "days_silent": (today - last_dt.date()).days if last_dt else None,
        "last_reply": re.sub(r"\s+", " ", strip_quoted(last_in_text))[:400],
        "thread": [{"from": "lead" if from_lead(m, email) else "me",
                    "at": (msg_date(m).isoformat() if msg_date(m) else ""),
                    "subject": str(pick(m, "subject")),
                    "text": strip_quoted(msg_text(m))[:3000]} for m in msgs],
        "drafts": drafts_for(ctx), "ctx": ctx,
        "log": st.get("log", []), "note": st.get("note", ""),
    }

# ═══════════════════════════════════════════════════════════ API Explee

class Explee:
    def __init__(self, key):
        self.key = key

    def req(self, method, path, params=None, body=None, retries=4):
        url = BASE + path
        if params:
            url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        data = json.dumps(body).encode() if body is not None else None
        headers = {"X-API-Key": self.key, "Accept": "application/json"}
        if data:
            headers["Content-Type"] = "application/json"
        for attempt in range(retries):
            r = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(r, timeout=90) as resp:
                    raw = resp.read().decode("utf-8")
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as e:
                txt = e.read().decode("utf-8", "ignore")
                if method == "GET" and e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise ApiError(e.code, txt)
            except urllib.error.URLError as e:
                if method == "GET" and attempt < retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise ApiError(0, str(e.reason))

    def projects(self):
        return first_list(self.req("GET", "/autogtm/projects"), "projects")

    def campaigns(self):
        return first_list(self.req("GET", "/autogtm/campaigns"), "campaigns")

    def analytics(self, cid):
        try:
            return self.req("GET", f"/autogtm/campaigns/{cid}/analytics", {"period": "all"})
        except ApiError:
            return {}

    def hot_leads(self):
        out, offset = [], 0
        while True:
            page = self.req("GET", "/autogtm/hot-leads", {"limit": 200, "offset": offset})
            items = first_list(page, "leads", "hot_leads", "items", "results", "data", "contacts")
            out += items
            total = pick(page, "total", default=None)
            if len(items) < 200 or (total is not None and len(out) >= int(total)):
                return out
            offset += 200

    def thread(self, cid, pid):
        return self.req("GET", f"/autogtm/campaigns/{cid}/inbox/{urllib.parse.quote(str(pid))}")

    def reply(self, cid, pid, text):
        path = f"/autogtm/campaigns/{cid}/inbox/{urllib.parse.quote(str(pid))}/reply"
        last = None
        for field in ("message", "text", "body"):
            try:
                return self.req("POST", path, body={field: text})
            except ApiError as e:
                last = e
                # 422 « champ manquant / inconnu » → on essaie le nom de champ suivant
                if e.code == 422 and re.search(r"missing|required|extra|not permitted|unknown field", e.body, re.I):
                    continue
                raise
        raise last

    def get_note(self, cid, pid):
        try:
            return pick(self.req("GET", f"/autogtm/campaigns/{cid}/inbox/{pid}/note"), "note") or ""
        except ApiError:
            return ""

    def set_note(self, cid, pid, note):
        return self.req("POST", f"/autogtm/campaigns/{cid}/inbox/{pid}/note", body={"note": note})


class ApiError(Exception):
    def __init__(self, code, body):
        super().__init__(f"HTTP {code}: {body[:300]}")
        self.code, self.body = code, body

# ═══════════════════════════════════════════════════════════ état local

_lock = threading.Lock()


def load_state():
    try:
        return json.loads(STATE_FILE.read_text("utf-8"))
    except Exception:
        return {}


def save_state(s):
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(s, ensure_ascii=False, indent=2), "utf-8")
    tmp.replace(STATE_FILE)

# ═══════════════════════════════════════════════════════════ données (réel / démo)

class Store:
    def __init__(self, api=None, demo=False):
        self.api, self.demo = api, demo
        self.raw = None  # {"projects","campaigns","analytics","leads":[(lead, thread)]}
        self.error = None
        self.fetched_at = None

    def fetch(self):
        if self.demo:
            self.raw = demo_data()
        else:
            projects = self.api.projects()
            campaigns = self.api.campaigns()
            leads = self.api.hot_leads()
            with ThreadPoolExecutor(max_workers=8) as ex:
                threads = list(ex.map(lambda l: self._thread(l), leads))
                analytics = dict(zip([pick(c, "id") for c in campaigns],
                                     ex.map(lambda c: self.api.analytics(pick(c, "id")), campaigns)))
            self.raw = {"projects": projects, "campaigns": campaigns, "analytics": analytics,
                        "leads": list(zip(leads, threads))}
        self.fetched_at = now().isoformat()

    def _thread(self, lead):
        cid, pid = pick(lead, "campaign_id", "campaign.id"), pick(lead, "person_id", "contact_id", "id")
        if not cid or not pid:
            return None
        try:
            return self.api.thread(cid, pid)
        except ApiError:
            return None

    def refresh_one(self, key):
        if self.demo or not self.raw:
            return
        for i, (lead, _) in enumerate(self.raw["leads"]):
            if f"{pick(lead, 'campaign_id', 'campaign.id')}:{pick(lead, 'person_id', 'contact_id', 'id')}" == key:
                self.raw["leads"][i] = (lead, self._thread(lead))

    def view(self, states=None):
        """states : {clé lead → état}. Par défaut le fichier local ; la page /relance
        passe l'état lu dans les notes Explee (voir state_from_note)."""
        if self.raw is None:
            self.fetch()
        state = load_state() if states is None else states
        projects = {pick(p, "id"): p for p in self.raw["projects"]}
        camps = {pick(c, "id"): c for c in self.raw["campaigns"]}
        leads = []
        for lead, thread in self.raw["leads"]:
            v = compute(lead, thread, None)
            v = compute(lead, thread, state.get(v["key"]))
            c = camps.get(v["campaign_id"], {})
            v["campaign"] = str(pick(c, "name", default=pick(lead, "campaign_name", default="Campagne")))
            v["project_id"] = pick(c, "project_id", default=pick(lead, "project_id"))
            v["project"] = str(pick(projects.get(v["project_id"], {}), "domain", "name",
                                    default=v["project_id"] or "Projet"))
            v["inbox_url"] = (f"https://explee.com/app-auto-gtm/p/{v['project_id']}/inbox"
                              if v["project_id"] else "https://explee.com/app-auto-gtm")
            leads.append(v)
        camp_list = []
        for cid, c in camps.items():
            a = self.raw.get("analytics", {}).get(cid) or {}
            a = a.get("totals", a) if isinstance(a, dict) else {}
            camp_list.append({
                "id": cid, "name": str(pick(c, "name")), "project_id": pick(c, "project_id"),
                "status": str(pick(c, "status")),
                "sent": pick(a, "emails_sent", "sent", "emails", default=None),
                "replies": pick(a, "replies", "replied", default=None),
                "reply_rate": pick(a, "reply_rate", default=None),
                "hot": pick(a, "hot_leads", "hot", default=None),
                "spend": pick(a, "spend_usd", "spend", default=None),
                "cpl": pick(a, "cost_per_lead_usd", "cost_per_lead", "cpl", default=None),
            })
        return {"fetched_at": self.fetched_at, "today": now().date().isoformat(), "demo": self.demo,
                "projects": [{"id": pick(p, "id"), "name": str(pick(p, "domain", "name"))}
                             for p in self.raw["projects"]],
                "campaigns": camp_list, "leads": leads}

# ═══════════════════════════════════════════════════════════ export CSV

def to_csv(view):
    order = {"reply": 0, "call": 1, "today": 2, "scheduled": 3, "booked": 4, "finished": 5, "lost": 6, "unknown": 7}
    label = {"reply": "À répondre", "call": "À appeler", "today": "À relancer", "scheduled": "Planifié",
             "booked": "RDV calé", "finished": "Séquence terminée", "lost": "Pas intéressé", "unknown": "?"}
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Statut", "Prochaine action", "Échéance", "Nom", "Téléphone", "Email", "Poste", "Entreprise",
                "Site", "LinkedIn", "Projet", "Campagne", "Hot depuis", "Relances envoyées",
                "Dernier msg de", "Jours de silence", "Attendre jusqu'au", "Dernière réponse du lead", "Inbox"])
    for v in sorted(view["leads"], key=lambda v: (order[v["bucket"]], (v["next"] or {}).get("due") or "9")):
        n = v["next"] or {}
        w.writerow([label[v["bucket"]], n.get("label", ""), n.get("due", ""), v["name"],
                    " | ".join(p["pretty"] for p in v["phones"]), v["email"], v["title"], v["company"],
                    v["domain"], v["linkedin"], v["project"], v["campaign"], v["hot_since"], v["relances_sent"],
                    {"lead": "Lead", "me": "Moi"}.get(v["last_from"], ""), v["days_silent"] if v["days_silent"] is not None else "",
                    v["wait_until"] or "", v["last_reply"], v["inbox_url"]])
    return "﻿" + buf.getvalue()

# ═══════════════════════════════════════════════════════════ serveur

STORE = None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else (
            body.encode("utf-8") if isinstance(body, str) else json.dumps(body, ensure_ascii=False, default=str).encode())
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _json(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        try:
            if u.path == "/":
                return self._send(200, (HERE / "relance_ui.html").read_text("utf-8")
                                  if (HERE / "relance_ui.html").exists() else UI_HTML, "text/html; charset=utf-8")
            if u.path == "/api/data":
                if q.get("refresh"):
                    STORE.fetch()
                return self._send(200, STORE.view())
            if u.path == "/export.csv":
                fn = f"hot_leads_{now():%Y-%m-%d}.csv"
                return self._send(200, to_csv(STORE.view()), "text/csv; charset=utf-8",
                                  {"Content-Disposition": f'attachment; filename="{fn}"'})
            self._send(404, {"error": "not found"})
        except ApiError as e:
            msg = "Clé API invalide : récupérez-la sur explee.com/app-auto-gtm/api-keys" if e.code == 401 else str(e)
            self._send(502, {"error": msg})
        except Exception as e:
            self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def do_POST(self):
        u = urllib.parse.urlsplit(self.path)
        try:
            body = self._json()
            key = body.get("key", "")
            cid, _, pid = key.partition(":")
            if u.path == "/api/send":
                text = (body.get("text") or "").strip()
                if not text:
                    return self._send(400, {"error": "Message vide"})
                if STORE.demo:
                    log(key, f"Email envoyé (démo) : {body.get('step', '')}")
                    return self._send(200, {"ok": True, "demo": True})
                try:
                    STORE.api.reply(cid, pid, text)
                except ApiError as e:
                    if e.code == 429:
                        return self._send(429, {"error": "Explee limite les réponses à ce contact pour l'instant. "
                                                         "Copiez le texte et envoyez-le depuis l'inbox Explee."})
                    if e.code == 403:
                        return self._send(403, {"error": "Explee bloque l'envoi (désinscrit ou jamais répondu)."})
                    raise
                entry = f"Email envoyé : {STEP_LABEL.get(body.get('step'), body.get('step', ''))}"
                log(key, entry)
                if body.get("sync_note"):
                    append_note(cid, pid, entry)
                STORE.refresh_one(key)
                return self._send(200, {"ok": True})
            if u.path == "/api/state":
                patch = body.get("patch") or {}
                with _lock:
                    s = load_state()
                    cur = s.setdefault(key, {})
                    for k, v in patch.items():
                        if v is None:
                            cur.pop(k, None)
                        else:
                            cur[k] = v
                    entry = body.get("log")
                    if entry:
                        cur.setdefault("log", []).append({"at": now().isoformat(timespec="minutes"), "text": entry})
                    save_state(s)
                if entry and body.get("sync_note"):
                    append_note(cid, pid, entry)
                return self._send(200, {"ok": True})
            self._send(404, {"error": "not found"})
        except ApiError as e:
            self._send(502, {"error": str(e)})
        except Exception as e:
            self._send(500, {"error": f"{type(e).__name__}: {e}"})


def append_note(cid, pid, entry):
    """Ajoute une ligne datée à la note partagée du lead sur Explee (sans effacer l'existant)."""
    if STORE.demo:
        return
    try:
        old = STORE.api.get_note(cid, pid)
        line = f"[{now():%d/%m %H:%M}] Relance · {entry}"
        STORE.api.set_note(cid, pid, f"{old}\n{line}".strip() if old else line)
    except ApiError:
        pass


def log(key, text):
    with _lock:
        s = load_state()
        s.setdefault(key, {}).setdefault("log", []).append({"at": now().isoformat(timespec="minutes"), "text": text})
        save_state(s)

# ═══════════════════════════════════════════════════════════ démo

def demo_data():
    def m(direction, at, body, subject=""):
        return {"direction": direction, "sent_at": at, "body": body, "subject": subject}
    leads, threads = [], []

    def add(lead, msgs):
        leads.append(lead)
        threads.append({"messages": msgs})

    add({"person_id": "p1", "campaign_id": 187263, "first_name": "Claire", "last_name": "Antonin",
         "email": "claire@blozenn.com", "job_title": "Co-fondatrice & CEO", "company_name": "Blozenn",
         "company_domain": "blozenn.com", "became_hot_at": "2026-10-05T14:14:00Z"},
        [m("outbound", "2026-09-30T08:09:00Z", "Bonjour Claire,\n\n…\n\nTom", "les coffrets blozenn"),
         m("outbound", "2026-10-05T07:08:00Z", "Bonjour Claire,\n\nJe relance…\n\nTom"),
         m("inbound", "2026-10-05T14:14:00Z", "Bonjour\n\nOn peut se parler après le 14, on est vraiment sous "
           "l'eau donc je n'aurai pas plus de 15 / 20 mins\n\nBelle journée,\nClaire & Sabine Antonin\n"
           "📱 +33763679767 / +33687132959\n\nLe lun. 5 oct. 2026 à 09:08, Tom Guerreau a écrit :\n> …"),
         m("outbound", "2026-10-05T18:24:00Z", "Bonjour Claire,\n\nMerci. Après le quatorze, un quart d'heure "
           "suffira.\n\nVous pouvez choisir le moment qui vous arrange ici :\n"
           "https://calendly.com/tom-prescient/15min?back=1&month=2026-09\n\nCordialement,\nTom")])
    add({"person_id": "p2", "campaign_id": 187263, "first_name": "Xavier", "last_name": "Brun",
         "email": "xavier@swissbiolab.ch", "job_title": "Gérant", "company_name": "SwissBioLab",
         "company_domain": "swissbiolab.ch", "became_hot_at": "2026-10-05T07:27:00Z"},
        [m("outbound", "2026-09-29T14:12:00Z", "Bonjour Xavier,\n…\nTom", "Les gélules de SwissBioLab"),
         m("outbound", "2026-10-05T06:48:00Z", "Bonjour Xavier,\n\nJe relance mon message…\n\nBien cordialement,\n\nTom"),
         m("inbound", "2026-10-05T07:27:00Z", "Bonjour\n\nJe peux être libre pour un teams aujourd’hui en fin "
           "d’après-midi.\n\nBest regards – Meilleures salutations\n\nXavier Brun\n\nSales Manager & Owner\n"
           "T+41\n27 588 00 98\n\nP+41\n79 412 87 80\n\nEnvoyé de mon iPhone\n\nLe 5 oct. 2026 à 08:48, "
           "Tom Guerreau a écrit :\n…"),
         m("outbound", "2026-10-05T12:41:00Z", "Bonjour Xavier,\n\nMerci Xavier.\n\nVous pouvez choisir le moment "
           "qui vous arrange ici :\nhttps://cal.link/FdEm9re\n\nBien cordialement,\nTom")])
    add({"person_id": "p3", "campaign_id": 187262, "first_name": "Khaled", "last_name": "Tahraoui",
         "email": "k.tahraoui@kality.fr", "job_title": "Fondateur", "company_name": "Parcours Immo",
         "company_domain": "parcours-immo.fr", "became_hot_at": "2026-10-03T10:07:00Z"},
        [m("outbound", "2026-10-01T07:15:00Z", "Bonjour Khaled,\n\nSur votre site, Parcours Immo…\n\nTom",
           "vos formations loi alur"),
         m("inbound", "2026-10-03T10:07:00Z", "Bonjour\nJe suis dispo pour un échange\nCdlt\nKhaled Tahraoui\n"
           "0762379192\nEnvoyé de mon iPhone"),
         m("outbound", "2026-10-03T10:16:00Z", "Bonjour Khaled,\n\nMerci, avec plaisir.\n\nVous pouvez choisir le "
           "moment qui vous arrange ici :\nhttps://cal.link/dcNwcOu\n\nCordialement,\nTom"),
         m("outbound", "2026-10-06T17:57:00Z", "Bonjour Khaled,\n\nJe vous propose de caler notre quart d'heure "
           "dès maintenant, au moment qui vous arrange :\nhttps://cal.link/dcNwcOu\n\nCordialement,\nTom")])
    add({"person_id": "p4", "campaign_id": 187262, "first_name": "Jean-Marie", "last_name": "Bastiani",
         "email": "jm.bastiani@transitionspro-cvl.fr", "company_name": "Transitions Pro CVL",
         "became_hot_at": "2026-10-02T09:00:00Z"},
        [m("outbound", "2026-09-30T07:00:00Z", "Bonjour Jean-Marie,\n…\nTom"),
         m("inbound", "2026-10-02T09:00:00Z", "Bonjour, oui pourquoi pas, quelles sont vos disponibilités ?\n"
           "Jean-Marie Bastiani\nDirecteur\nTél. 02 38 24 10 10")])
    add({"person_id": "p5", "campaign_id": 187184, "first_name": "Jacques", "last_name": "Patingre",
         "email": "j.patingre@villaslaprovencale.com", "company_name": "Villas La Provençale",
         "became_hot_at": "2026-09-24T09:00:00Z"},
        [m("outbound", "2026-09-22T07:00:00Z", "Bonjour Jacques,\n…\nTom"),
         m("inbound", "2026-09-24T09:00:00Z", "Bonjour, intéressé, envoyez-moi un lien."),
         m("outbound", "2026-09-24T10:00:00Z", "Bonjour Jacques,\n\nVoici le lien : https://cal.link/abc\n\nCordialement,\nTom"),
         m("outbound", "2026-09-25T10:00:00Z", "Bonjour Jacques,\n\nJe vous propose…\n\nCordialement,\nTom"),
         m("outbound", "2026-09-30T10:00:00Z", "Bonjour Jacques,\n\nPour que le quart d'heure…\n\nCordialement,\nTom")])
    add({"person_id": "p6", "campaign_id": 171549, "first_name": "Rachid", "last_name": "Tebboub",
         "email": "rtebboub@wake-up-success.fr", "company_name": "Wake Up Success",
         "became_hot_at": "2026-09-25T09:00:00Z"},
        [m("outbound", "2026-09-23T07:00:00Z", "Bonjour Rachid,\n…\nTom"),
         m("inbound", "2026-09-25T09:00:00Z", "Ok pour en parler.\nRachid\n06 12 34 56 78"),
         m("outbound", "2026-09-25T10:00:00Z", "Bonjour Rachid,\n\nVoici le lien : https://cal.link/xyz\n\nCordialement,\nTom")])
    camps = [{"id": 171549, "project_id": 37293, "name": "Prescient studio 1", "status": "running"},
             {"id": 176956, "project_id": 37293, "name": "SaaS francophones self-serve", "status": "running"},
             {"id": 187184, "project_id": 37293, "name": "Prescient – Travaux haut de gamme", "status": "running"},
             {"id": 187262, "project_id": 37293, "name": "Prescient – Écoles & formation", "status": "running"},
             {"id": 187263, "project_id": 37293, "name": "Prescient – DTC nutrition & beauté", "status": "running"}]
    ana = {171549: {"emails_sent": 4810, "replies": 96, "reply_rate": 2.0, "hot_leads": 3, "spend_usd": 412},
           176956: {"emails_sent": 2120, "replies": 31, "reply_rate": 1.5, "hot_leads": 0, "spend_usd": 180},
           187184: {"emails_sent": 1890, "replies": 52, "reply_rate": 2.8, "hot_leads": 2, "spend_usd": 160},
           187262: {"emails_sent": 1760, "replies": 47, "reply_rate": 2.7, "hot_leads": 4, "spend_usd": 150},
           187263: {"emails_sent": 1777, "replies": 42, "reply_rate": 2.4, "hot_leads": 4, "spend_usd": 151}}
    return {"projects": [{"id": 37293, "domain": "prescient.studio"}], "campaigns": camps,
            "analytics": ana, "leads": list(zip(leads, threads))}

# ═══════════════════════════════════════════════════════════ main

UI_HTML = r"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relance · Hot leads</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#f6f7f9;--panel:#fff;--panel2:#fbfbfc;--line:#e7e9ee;--line2:#f0f1f4;
  --ink:#14161b;--ink2:#4a505c;--ink3:#8a909c;
  --accent:#4f46e5;--accent-ink:#fff;--accent-soft:#eef0ff;
  --red:#dc2626;--red-soft:#fef1f1;--amber:#b45309;--amber-soft:#fff6e6;
  --green:#15803d;--green-soft:#ecfaf0;--blue:#1d4ed8;--blue-soft:#eef4ff;
  --violet:#7c3aed;--violet-soft:#f4efff;--gray-soft:#f2f3f5;
  --shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06);
  --shadow-lg:0 20px 50px rgba(16,24,40,.18);
  --r:10px;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0e1014;--panel:#15181e;--panel2:#191c23;--line:#262a33;--line2:#1f232b;
  --ink:#eceef2;--ink2:#b3b8c3;--ink3:#7d8390;
  --accent:#818cf8;--accent-ink:#0e1014;--accent-soft:#1f2240;
  --red:#f87171;--red-soft:#2a1617;--amber:#fbbf24;--amber-soft:#2a2112;
  --green:#4ade80;--green-soft:#11251a;--blue:#93b4ff;--blue-soft:#141e33;
  --violet:#c4b5fd;--violet-soft:#1f1833;--gray-soft:#1e2128;
  --shadow:0 1px 2px rgba(0,0,0,.3);--shadow-lg:0 20px 50px rgba(0,0,0,.5);
}}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;cursor:pointer}
a{color:inherit}
.app{display:grid;grid-template-columns:268px 1fr;height:100vh}
/* sidebar */
.side{background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.brand{display:flex;align-items:center;gap:10px;padding:18px 18px 14px}
.logo{width:30px;height:30px;border-radius:8px;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-weight:700}
.brand b{font-size:15px}.brand small{display:block;color:var(--ink3);font-size:12px;margin-top:-2px}
.nav{overflow:auto;padding:4px 10px 10px;flex:1}
.nav h6{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin:16px 8px 6px;font-weight:600}
.nitem{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;text-align:left;padding:8px 10px;border-radius:8px;color:var(--ink2)}
.nitem:hover{background:var(--gray-soft)}
.nitem.on{background:var(--accent-soft);color:var(--ink);font-weight:600}
.nitem .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cnt{font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums}
.due{font-size:11px;font-weight:600;background:var(--red);color:#fff;border-radius:99px;padding:1px 7px;font-variant-numeric:tabular-nums}
.sidefoot{border-top:1px solid var(--line);padding:12px 16px;font-size:12px;color:var(--ink3);display:flex;align-items:center;justify-content:space-between;gap:8px}
/* main */
.main{display:flex;flex-direction:column;min-width:0;min-height:0}
.top{display:flex;align-items:center;gap:12px;padding:16px 24px;border-bottom:1px solid var(--line);background:var(--panel)}
.top h1{font-size:18px;margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.top h1 small{font-weight:400;color:var(--ink3);font-size:13px;margin-left:8px}
.search{position:relative}
.search input{width:240px;padding:8px 12px 8px 32px;border:1px solid var(--line);border-radius:8px;background:var(--panel2);color:var(--ink);font:inherit}
.search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--ink3)}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel);padding:7px 12px;border-radius:8px;font-weight:500;white-space:nowrap;text-decoration:none}
.btn:hover{background:var(--gray-soft)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{filter:brightness(1.07)}
.btn.sm{padding:5px 10px;font-size:13px}
.btn.ghost{border-color:transparent;background:none}
.btn:disabled{opacity:.55;cursor:default}
.scroll{overflow:auto;flex:1;padding:20px 24px 40px}
.demo{background:var(--amber-soft);color:var(--amber);border:1px solid color-mix(in srgb,var(--amber) 25%,transparent);padding:8px 12px;border-radius:8px;margin-bottom:16px;font-size:13px}
/* kpis */
.kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:16px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;box-shadow:var(--shadow);text-align:left}
button.kpi:hover{border-color:var(--accent)}
.kpi .v{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.kpi .l{font-size:12px;color:var(--ink3);display:flex;align-items:center;gap:6px}
.dot{width:8px;height:8px;border-radius:99px;display:inline-block}
.campstats{display:flex;gap:28px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:12px 18px;margin-bottom:16px;box-shadow:var(--shadow)}
.campstats div{font-size:12px;color:var(--ink3)}.campstats b{display:block;font-size:16px;color:var(--ink);font-variant-numeric:tabular-nums}
/* tabs */
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:14px}
.tab{border:0;background:none;padding:9px 12px;color:var(--ink3);font-weight:500;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab.on{color:var(--ink);border-color:var(--accent)}
.tab .cnt{margin-left:4px}
/* list */
.group h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin:18px 2px 8px;display:flex;align-items:center;gap:8px}
.list{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.row{display:grid;grid-template-columns:minmax(220px,1.6fr) minmax(140px,1fr) 170px minmax(150px,1fr) auto;gap:16px;align-items:center;padding:12px 16px;border-top:1px solid var(--line2);cursor:pointer}
.row:first-child{border-top:0}
.row:hover{background:var(--panel2)}
.who{display:flex;gap:10px;align-items:center;min-width:0}
.av{width:34px;height:34px;border-radius:99px;display:grid;place-items:center;font-weight:600;font-size:12px;flex:none;background:var(--gray-soft);color:var(--ink2)}
.who .t{min-width:0}.who b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{font-size:12px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:2px 8px;border-radius:99px;background:var(--gray-soft);color:var(--ink2);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.tel{display:inline-flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;text-decoration:none;font-weight:500}
.tel:hover{color:var(--accent)}
.muted{color:var(--ink3)}
/* cadence */
.cad{display:flex;align-items:center;gap:0}
.st{display:flex;flex-direction:column;align-items:center;gap:3px;width:40px;position:relative}
.st i{width:22px;height:22px;border-radius:99px;display:grid;place-items:center;font-style:normal;font-size:10px;font-weight:700;border:1.5px solid var(--line);background:var(--panel);color:var(--ink3)}
.st span{font-size:10px;color:var(--ink3)}
.st.done i{background:var(--green);border-color:var(--green);color:#fff}
.st.now i{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);box-shadow:0 0 0 3px var(--accent-soft)}
.st.late i{background:var(--red);border-color:var(--red);color:#fff;box-shadow:0 0 0 3px var(--red-soft)}
.st.skip i{border-style:dashed}
.st+.st:before{content:"";position:absolute;top:11px;right:31px;width:18px;height:1.5px;background:var(--line)}
.next{display:flex;flex-direction:column;gap:2px;min-width:0}
.next b{font-size:13px}
.when{font-size:12px;color:var(--ink3)}.when.late{color:var(--red);font-weight:600}.when.today{color:var(--accent);font-weight:600}
.badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;white-space:nowrap}
.b-reply{background:var(--violet-soft);color:var(--violet)}.b-call{background:var(--blue-soft);color:var(--blue)}
.b-today{background:var(--accent-soft);color:var(--accent)}.b-scheduled{background:var(--gray-soft);color:var(--ink2)}
.b-booked{background:var(--green-soft);color:var(--green)}.b-finished{background:var(--amber-soft);color:var(--amber)}
.b-lost{background:var(--gray-soft);color:var(--ink3)}.b-unknown{background:var(--gray-soft);color:var(--ink3)}
.empty{padding:40px;text-align:center;color:var(--ink3)}
/* board */
.board{display:grid;grid-template-columns:repeat(7,minmax(168px,1fr));gap:12px;overflow-x:auto;padding-bottom:8px}
.col{background:var(--panel2);border:1px solid var(--line);border-radius:var(--r);padding:10px;min-height:120px}
.col h4{margin:2px 4px 10px;font-size:12px;display:flex;justify-content:space-between;color:var(--ink2)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer;box-shadow:var(--shadow)}
.card:hover{border-color:var(--accent)}
.card b{display:block;font-size:13px}.card .sub{margin-top:1px}
.card .foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:6px}
/* drawer */
.veil{position:fixed;inset:0;background:rgba(10,12,16,.35);opacity:0;pointer-events:none;transition:opacity .18s}
.veil.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(580px,100vw);background:var(--panel);box-shadow:var(--shadow-lg);transform:translateX(100%);transition:transform .22s ease;display:flex;flex-direction:column;z-index:10}
.drawer.on{transform:none}
.dh{padding:18px 20px;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:flex-start}
.dh .av{width:42px;height:42px;font-size:14px}
.dh h2{margin:0;font-size:17px}
.dh .x{margin-left:auto}
.links{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.db{overflow:auto;flex:1;padding:16px 20px 30px}
.sec{margin-bottom:22px}
.sec h5{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin:0 0 8px;font-weight:600}
.tl{display:flex;flex-direction:column;gap:0;border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.tli{display:flex;gap:10px;align-items:center;padding:9px 12px;border-top:1px solid var(--line2);font-size:13px}
.tli:first-child{border-top:0}
.tli .st{width:auto}.tli .st+.st:before{display:none}
.tli .grow{flex:1}
.tli.cur{background:var(--accent-soft)}
textarea{width:100%;min-height:260px;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--panel2);color:var(--ink);font:inherit;line-height:1.5;resize:vertical}
textarea:focus,input:focus,select:focus{outline:2px solid var(--accent);outline-offset:-1px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:10px}
.seg button{border:0;background:none;padding:6px 11px;font-size:13px;color:var(--ink2);border-left:1px solid var(--line)}
.seg button:first-child{border-left:0}.seg button.on{background:var(--accent-soft);color:var(--ink);font-weight:600}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}
.script{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:12px 84px 12px 12px;white-space:pre-wrap;font-size:13px;margin-bottom:8px;position:relative}
.script .btn{position:absolute;top:8px;right:8px}
.outs{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.outs .btn{justify-content:center}
.inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
input[type=date]{padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--panel2);color:var(--ink);font:inherit}
.msg{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:13px;white-space:pre-wrap;word-wrap:break-word}
.msg.lead{background:var(--violet-soft);border-color:transparent}
.msg .mh{display:flex;justify-content:space-between;font-size:11px;color:var(--ink3);margin-bottom:4px;white-space:normal}
.note{font-size:12px;color:var(--ink3);margin-top:6px}
.check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink2)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:13px;opacity:0;transition:.2s;z-index:20;max-width:90vw}
.toast.on{opacity:1;transform:translateX(-50%)}
.toast.err{background:var(--red);color:#fff}
.loading{display:grid;place-items:center;height:60vh;color:var(--ink3)}
.spin{width:22px;height:22px;border:2.5px solid var(--line);border-top-color:var(--accent);border-radius:99px;animation:sp 0.8s linear infinite;margin:0 auto 10px}
@keyframes sp{to{transform:rotate(360deg)}}
.hide-m{}
@media (max-width:1100px){.kpis{grid-template-columns:repeat(3,1fr)}.row{grid-template-columns:minmax(180px,1.4fr) 170px minmax(140px,1fr) auto}.row .c-camp{display:none}}
@media (max-width:760px){.app{grid-template-columns:1fr}.side{display:none}.row{grid-template-columns:1fr auto}.row .c-cad,.row .c-next{display:none}.search input{width:140px}.kpis{grid-template-columns:repeat(2,1fr)}.top{padding:12px 16px}.scroll{padding:16px}}
</style>
</head>
<body>
<div class="app">
  <aside class="side">
    <div class="brand"><div class="logo">R</div><div><b>Relance</b><small>Hot leads Explee</small></div></div>
    <nav class="nav" id="nav"></nav>
    <div class="sidefoot"><span id="sync">—</span><button class="btn sm" id="refresh" title="Recharger depuis Explee">↻ Sync</button></div>
  </aside>
  <main class="main">
    <div class="top">
      <h1 id="title">Tous les projets</h1>
      <label class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" placeholder="Rechercher un lead…"></label>
      <a class="btn" href="/export.csv">⤓ CSV</a>
    </div>
    <div class="scroll" id="content"><div class="loading"><div><div class="spin"></div>Chargement des hot leads…</div></div></div>
  </main>
</div>
<div class="veil" id="veil"></div>
<aside class="drawer" id="drawer"></aside>
<div class="toast" id="toast"></div>

<script>
const S = {data:null, scope:{type:'all'}, tab:'today', q:'', open:null, tpl:null, syncNote:true};
const BUCKET = {
  reply:{l:'À répondre',c:'var(--violet)'}, call:{l:'À appeler',c:'var(--blue)'}, today:{l:'À relancer',c:'var(--accent)'},
  scheduled:{l:'Planifié',c:'var(--ink3)'}, booked:{l:'RDV calé',c:'var(--green)'}, finished:{l:'Séquence finie',c:'var(--amber)'},
  lost:{l:'Pas intéressé',c:'var(--ink3)'}, unknown:{l:'Inconnu',c:'var(--ink3)'}
};
const SHORT = {email1:'E1',call:'☎',email2:'E2',email3:'E3'};
const OUT = {no_answer:'Pas de réponse',voicemail:'Message laissé',retry:'À rappeler',booked:'RDV calé',not_interested:'Pas intéressé'};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = n => (n||'?').split(/[\s\-@.]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
const hue = s => [...(s||'')].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
const avStyle = n => `background:hsl(${hue(n)} 70% 92%);color:hsl(${hue(n)} 45% 32%)`;
const today = () => S.data.today;
const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const JOURS = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
function dd(iso){ if(!iso) return ''; const d=new Date(iso.slice(0,10)+'T12:00:00'); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; }
function diff(iso){ return Math.round((new Date(iso.slice(0,10)+'T12:00:00') - new Date(today()+'T12:00:00'))/864e5); }
function when(iso){
  if(!iso) return {t:'',c:''};
  const n = diff(iso);
  if(n<0) return {t:`en retard de ${-n} j`,c:'late'};
  if(n===0) return {t:"aujourd'hui",c:'today'};
  if(n===1) return {t:'demain',c:''};
  return {t:dd(iso),c:''};
}
function dtFr(iso){ if(!iso) return ''; const d=new Date(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function toast(t, err){ const e=$('#toast'); e.textContent=t; e.className='toast on'+(err?' err':''); clearTimeout(e._t); e._t=setTimeout(()=>e.className='toast'+(err?' err':''),3200); }

async function load(refresh){
  if(refresh){ $('#refresh').disabled=true; $('#refresh').textContent='…'; }
  try{
    const r = await fetch('/api/data'+(refresh?'?refresh=1':''));
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||r.statusText);
    S.data = j; render();
    if(S.open) openLead(S.open, true);
    if(refresh) toast('Données à jour');
  }catch(e){
    $('#content').innerHTML = `<div class="empty"><b>Impossible de charger</b><br>${esc(e.message)}</div>`;
  }finally{ $('#refresh').disabled=false; $('#refresh').textContent='↻ Sync'; }
}

function inScope(l){
  const s=S.scope;
  if(s.type==='project' && String(l.project_id)!==String(s.id)) return false;
  if(s.type==='campaign' && String(l.campaign_id)!==String(s.id)) return false;
  if(S.q){ const q=S.q.toLowerCase(); if(![l.name,l.company,l.email,l.campaign].join(' ').toLowerCase().includes(q)) return false; }
  return true;
}
const isAction = l => ['reply','call','today'].includes(l.bucket);
const prio = l => ({reply:0,call:1,today:2,scheduled:3,booked:4,finished:5,lost:6,unknown:7})[l.bucket];
const byPrio = (a,b) => prio(a)-prio(b) || ((a.next||{}).due||'9').localeCompare((b.next||{}).due||'9');

function render(){ renderNav(); renderMain(); }

function renderNav(){
  const d=S.data, leads=d.leads;
  const cnt = f => leads.filter(f).length;
  const due = f => leads.filter(l=>f(l)&&isAction(l)).length;
  const item = (scope,name,f,extra='') => {
    const on = S.scope.type===scope.type && String(S.scope.id)===String(scope.id);
    const n=due(f);
    return `<button class="nitem ${on?'on':''}" data-scope='${esc(JSON.stringify(scope))}'>${extra}<span class="nm">${esc(name)}</span>${n?`<span class="due">${n}</span>`:''}<span class="cnt">${cnt(f)}</span></button>`;
  };
  let h = item({type:'all'},'Tous les projets',()=>true,'<span>◎</span>');
  const projs = d.projects.length ? d.projects : [{id:null,name:'Projet'}];
  for(const p of projs){
    h += `<h6>${esc(p.name)}</h6>`;
    if(d.projects.length>1) h += item({type:'project',id:p.id},'Toutes les campagnes',l=>String(l.project_id)===String(p.id));
    const camps = d.campaigns.filter(c=>!p.id || String(c.project_id)===String(p.id));
    const ids = new Set(camps.map(c=>String(c.id)));
    camps.sort((a,b)=>cnt(l=>String(l.campaign_id)===String(b.id))-cnt(l=>String(l.campaign_id)===String(a.id)));
    for(const c of camps) h += item({type:'campaign',id:c.id},c.name,l=>String(l.campaign_id)===String(c.id),`<span class="dot" style="background:hsl(${hue(c.name)} 60% 55%)"></span>`);
    const orphan = leads.filter(l=>!ids.has(String(l.campaign_id)) && (!p.id||String(l.project_id)===String(p.id)));
    if(orphan.length && d.projects.length<=1) h += item({type:'campaign',id:orphan[0].campaign_id},orphan[0].campaign||'Autre',l=>String(l.campaign_id)===String(orphan[0].campaign_id));
  }
  $('#nav').innerHTML = h;
  $('#nav').querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{S.scope=JSON.parse(b.dataset.scope); render();});
  $('#sync').textContent = d.fetched_at ? 'Sync '+dtFr(d.fetched_at).split(' · ')[1] : '';
}

function scopeTitle(){
  const s=S.scope, d=S.data;
  if(s.type==='campaign'){ const c=d.campaigns.find(c=>String(c.id)===String(s.id)); return c?c.name:(d.leads.find(l=>String(l.campaign_id)===String(s.id))||{}).campaign||'Campagne'; }
  if(s.type==='project'){ const p=d.projects.find(p=>String(p.id)===String(s.id)); return p?p.name:'Projet'; }
  return 'Tous les projets';
}

function renderMain(){
  const d=S.data, leads=d.leads.filter(inScope);
  $('#title').innerHTML = `${esc(scopeTitle())}<small>${leads.length} hot lead${leads.length>1?'s':''}</small>`;
  const n = b => leads.filter(l=>l.bucket===b).length;
  const actions = leads.filter(isAction);
  const conv = leads.length ? Math.round(100*n('booked')/leads.length) : 0;
  let h = d.demo ? `<div class="demo">Mode démo : données d'exemple, aucun email n'est envoyé. Lancez <b>python3 relance.py VOTRE_CLE</b> pour vos vrais leads.</div>` : '';
  const k = (b,v,l,c) => `<button class="kpi" data-k="${b}"><div class="l"><span class="dot" style="background:${c}"></span>${l}</div><div class="v">${v}</div></button>`;
  h += `<div class="kpis">
    ${k('reply',n('reply'),'À répondre',BUCKET.reply.c)}
    ${k('call',n('call'),'Appels du jour',BUCKET.call.c)}
    ${k('today',n('today'),'Relances du jour',BUCKET.today.c)}
    ${k('scheduled',n('scheduled'),'Planifiés',BUCKET.scheduled.c)}
    ${k('booked',n('booked'),'RDV calés',BUCKET.booked.c)}
    <div class="kpi"><div class="l">Hot → RDV</div><div class="v">${conv}%</div></div>
  </div>`;
  if(S.scope.type==='campaign'){
    const c=d.campaigns.find(c=>String(c.id)===String(S.scope.id))||{};
    const f=(v,suf='')=>v==null||v===''?'—':(typeof v==='number'?v.toLocaleString('fr-FR',{maximumFractionDigits:1}):v)+suf;
    const rr = c.reply_rate!=null ? (c.reply_rate<=1? c.reply_rate*100 : c.reply_rate) : null;
    h += `<div class="campstats"><div>Emails envoyés<b>${f(c.sent)}</b></div><div>Réponses<b>${f(c.replies)}</b></div><div>Taux de réponse<b>${f(rr,' %')}</b></div><div>Hot leads<b>${f(c.hot ?? leads.length)}</b></div><div>Dépense<b>${f(c.spend,' $')}</b></div><div>Coût / hot lead<b>${f(c.cpl ?? (c.spend&&leads.length? c.spend/leads.length:null),' $')}</b></div><div>Statut<b>${esc(c.status||'—')}</b></div></div>`;
  }
  const tabs=[['today','Actions du jour',actions.length],['board','Pipeline',null],['all','Tous',leads.length]];
  h += `<div class="tabs">${tabs.map(([id,l,c])=>`<button class="tab ${S.tab===id?'on':''}" data-tab="${id}">${l}${c!=null?`<span class="cnt">${c}</span>`:''}</button>`).join('')}</div>`;
  if(S.tab==='board') h += board(leads);
  else if(S.tab==='today') h += actions.length ? groups(actions,['reply','call','today']) : `<div class="list"><div class="empty">Rien à faire aujourd'hui 🎉<br><span class="sub">${n('scheduled')} relance(s) planifiée(s) plus tard.</span></div></div>`;
  else h += leads.length ? groups(leads,['reply','call','today','scheduled','booked','finished','lost','unknown']) : `<div class="list"><div class="empty">Aucun hot lead ici.</div></div>`;
  $('#content').innerHTML = h;
  $('#content').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab; renderMain();});
  $('#content').querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{S.tab=['reply','call','today'].includes(b.dataset.k)?'today':'all'; renderMain(); const g=document.getElementById('g-'+b.dataset.k); g&&g.scrollIntoView({behavior:'smooth'});});
  $('#content').querySelectorAll('[data-key]').forEach(r=>r.onclick=e=>{ if(e.target.closest('a')) return; openLead(r.dataset.key);});
}

function groups(leads, order){
  let h='';
  for(const b of order){
    const g = leads.filter(l=>l.bucket===b).sort(byPrio);
    if(!g.length) continue;
    h += `<div class="group" id="g-${b}"><h3><span class="dot" style="background:${BUCKET[b].c}"></span>${BUCKET[b].l}<span class="cnt">${g.length}</span></h3><div class="list">${g.map(row).join('')}</div></div>`;
  }
  return h;
}

function cadence(l){
  if(!l.steps||!l.steps.length) return '<span class="muted">—</span>';
  return `<div class="cad">${l.steps.map(s=>{
    const isNext = l.next && l.next.key===s.key && ['today','call','scheduled'].includes(l.bucket);
    let cls = s.done?'done':'';
    if(isNext) cls = s.due && diff(s.due)<0 ? 'late' : (s.due && diff(s.due)===0 ? 'now':'');
    const tip = s.done ? `${s.label} · fait${s.done_at?' le '+dd(s.done_at):''}${s.outcome?' · '+(OUT[s.outcome]||s.outcome):''}` : `${s.label} · prévu ${dd(s.due)}`;
    return `<div class="st ${cls}" title="${esc(tip)}"><i>${s.done?'✓':SHORT[s.key]}</i><span>${s.key==='call'?'Appel':s.label.replace('Email ','E')}</span></div>`;
  }).join('')}</div>`;
}

function nextCell(l){
  const b=BUCKET[l.bucket];
  if(['booked','lost','finished','unknown'].includes(l.bucket)) return `<div class="next"><span class="badge b-${l.bucket}">${b.l}</span></div>`;
  const w=when(l.next&&l.next.due);
  const extra = l.bucket==='reply' ? 'Le lead attend votre réponse' : (l.wait_until && l.bucket==='scheduled' ? `Attendre le ${dd(l.wait_until)}${l.wait_auto?' (demandé)':''}` : '');
  return `<div class="next"><b>${esc(l.next?l.next.label:'')}</b><span class="when ${w.c}">${w.t}${extra?' · '+esc(extra):''}</span></div>`;
}

function phoneCell(l){
  if(!l.phones.length) return '<span class="muted sub">Pas de numéro</span>';
  const p=l.phones[0];
  return `<a class="tel" href="tel:${esc(p.raw)}" title="Appeler">${p.mobile?'📱':'☎'} ${esc(p.pretty)}</a>${l.phones.length>1?`<span class="sub"> +${l.phones.length-1}</span>`:''}`;
}

function row(l){
  return `<div class="row" data-key="${esc(l.key)}">
    <div class="who"><div class="av" style="${avStyle(l.name)}">${esc(initials(l.name))}</div><div class="t"><b>${esc(l.name)}</b><div class="sub">${esc([l.title,l.company].filter(Boolean).join(' · '))}</div></div></div>
    <div class="c-camp"><span class="chip" title="${esc(l.campaign)}">${esc(l.campaign.replace(/^Prescient\s*[–-]\s*/,''))}</span><div class="sub" style="margin-top:4px">${phoneCell(l)}</div></div>
    <div class="c-cad">${cadence(l)}</div>
    <div class="c-next">${nextCell(l)}</div>
    <div><span class="badge b-${l.bucket}">${BUCKET[l.bucket].l}</span></div>
  </div>`;
}

function board(leads){
  const cols=[['reply','À répondre',l=>l.bucket==='reply'],['email1','Email 1',l=>l.next&&l.next.key==='email1'&&['today','scheduled'].includes(l.bucket)],
    ['call','Appel',l=>l.next&&l.next.key==='call'&&['call','scheduled'].includes(l.bucket)],['email2','Email 2',l=>l.next&&l.next.key==='email2'&&['today','scheduled'].includes(l.bucket)],
    ['email3','Email 3',l=>l.next&&l.next.key==='email3'&&['today','scheduled'].includes(l.bucket)],['booked','RDV calé',l=>l.bucket==='booked'],
    ['done','Terminé',l=>['finished','lost','unknown'].includes(l.bucket)]];
  return `<div class="board">${cols.map(([id,t,f])=>{ const g=leads.filter(f).sort(byPrio); return `<div class="col"><h4>${t}<span class="cnt">${g.length}</span></h4>${g.map(l=>{const w=when(l.next&&l.next.due); return `<div class="card" data-key="${esc(l.key)}"><b>${esc(l.name)}</b><div class="sub">${esc(l.company)}</div><div class="foot">${['booked','finished','lost'].includes(l.bucket)?`<span class="badge b-${l.bucket}">${BUCKET[l.bucket].l}</span>`:`<span class="when ${w.c}">${w.t}</span>`}${l.phones.length?'<span title="Numéro trouvé">📱</span>':''}</div></div>`;}).join('')}</div>`;}).join('')}</div>`;
}

/* ───────── drawer ───────── */
function openLead(key, keepTpl){
  const l = S.data.leads.find(x=>x.key===key); if(!l) return closeLead();
  S.open = key;
  const defTpl = l.next && l.next.key!=='call' ? l.next.key : (l.bucket==='reply'?'reply':(l.next&&l.next.key==='call'?'call':'email1'));
  if(!keepTpl || !S.tpl) S.tpl = defTpl;
  const links = [
    `<a class="btn sm" href="${esc(l.inbox_url)}" target="_blank" rel="noopener">Inbox Explee ↗</a>`,
    l.linkedin?`<a class="btn sm" href="${esc(l.linkedin)}" target="_blank" rel="noopener">LinkedIn ↗</a>`:'',
    `<a class="btn sm" href="mailto:${esc(l.email)}">${esc(l.email)}</a>`,
    ...l.phones.map(p=>`<a class="btn sm" href="tel:${esc(p.raw)}">${p.mobile?'📱':'☎'} ${esc(p.pretty)}</a>`)
  ].join('');
  let h = `<div class="dh"><div class="av" style="${avStyle(l.name)}">${esc(initials(l.name))}</div><div style="min-width:0"><h2>${esc(l.name)}</h2><div class="sub">${esc([l.title,l.company,l.campaign].filter(Boolean).join(' · '))}</div><div class="links">${links}</div></div><button class="btn ghost x" id="close" aria-label="Fermer">✕</button></div><div class="db">`;

  // status line
  const statusBtns = l.bucket==='booked'||l.bucket==='lost'
    ? `<button class="btn sm" data-status="">Réactiver la séquence</button>`
    : `<button class="btn sm" data-status="booked">✓ RDV calé</button><button class="btn sm" data-status="lost">Pas intéressé</button>`;
  h += `<div class="sec"><div class="inline"><span class="badge b-${l.bucket}">${BUCKET[l.bucket].l}</span>${l.next&&!['booked','lost','finished'].includes(l.bucket)?`<span class="sub">Prochaine étape : <b>${esc(l.next.label)}</b> · ${when(l.next.due).t}</span>`:''}<span style="flex:1"></span>${statusBtns}</div></div>`;

  // timeline
  if(l.steps.length){
    h += `<div class="sec"><h5>Séquence de relance</h5><div class="tl">${l.steps.map(s=>{
      const cur = l.next && l.next.key===s.key && !['booked','lost'].includes(l.bucket);
      const late = cur && s.due && diff(s.due)<0;
      const cls = s.done?'done':(cur?(late?'late':'now'):'');
      const right = s.done ? `<span class="sub">fait${s.done_at?' le '+dd(s.done_at):''}${s.outcome?' · '+(OUT[s.outcome]||''):''}</span>` : `<span class="when ${cur?when(s.due).c:''}">${s.due?(cur?when(s.due).t:dd(s.due)):''}</span>`;
      return `<div class="tli ${cur?'cur':''}"><div class="st ${cls}"><i>${s.done?'✓':SHORT[s.key]}</i></div><div class="grow"><b>${esc(s.label)}</b> <span class="sub">${{email1:'créneau précis',call:'si numéro en signature',email2:'angle valeur',email3:'clôture'}[s.key]||''}</span></div>${right}</div>`;
    }).join('')}</div>
    <div class="inline note">Attendre jusqu'au <input type="date" id="snooze" value="${esc(l.wait_until||'')}"> <button class="btn sm" id="snoozeBtn">Appliquer</button>${l.wait_until?`<button class="btn sm ghost" id="unsnooze">Retirer</button>`:''}${l.wait_auto?'<span>détecté dans sa réponse</span>':''}</div></div>`;
  }

  // action panel
  const tpls = [['reply','Réponse'],['email1','Email 1'],['email2','Email 2'],['email3','Email 3']];
  if(l.phones.length) tpls.splice(2,0,['call','Appel']);
  h += `<div class="sec"><h5>Action</h5><div class="seg">${tpls.map(([k,t])=>`<button data-tpl="${k}" class="${S.tpl===k?'on':''}">${t}</button>`).join('')}</div>`;
  if(S.tpl==='call'){
    const d=l.drafts;
    h += `<div class="script"><button class="btn sm" data-copy="call">Copier</button><b>Script</b>\n${esc(d.call)}</div>
      <div class="script"><button class="btn sm" data-copy="voicemail">Copier</button><b>Messagerie</b>\n${esc(d.voicemail)}</div>
      <div class="script"><button class="btn sm" data-copy="sms">Copier</button><b>SMS après l'appel</b>\n${esc(d.sms)}</div>
      ${l.phones.length?`<div class="actions" style="margin:4px 0 12px"><a class="btn primary" href="tel:${esc(l.phones[0].raw)}">📞 Appeler ${esc(l.phones[0].pretty)}</a></div>`:''}
      <h5 style="margin-top:6px">Résultat de l'appel</h5>
      <div class="outs">
        <button class="btn" data-out="booked">✓ RDV calé</button>
        <button class="btn" data-out="voicemail">Message laissé</button>
        <button class="btn" data-out="no_answer">Pas de réponse</button>
        <button class="btn" data-out="not_interested">Pas intéressé</button>
      </div>
      <div class="inline note">À rappeler le <input type="date" id="retryAt"> <button class="btn sm" data-out="retry">Planifier</button></div>`;
  } else {
    h += `<textarea id="draft">${esc(l.drafts[S.tpl]||'')}</textarea>
      <div class="actions"><button class="btn primary" id="send">Envoyer via Explee</button><button class="btn" data-copy="draft">Copier</button><a class="btn ghost" href="${esc(l.inbox_url)}" target="_blank" rel="noopener">Ouvrir l'inbox ↗</a></div>
      <div class="note">Part dans le fil existant, depuis votre boîte d'envoi Explee. Relisez avant d'envoyer.</div>`;
  }
  h += `<div class="inline note" style="margin-top:10px"><label class="check"><input type="checkbox" id="syncNote" ${S.syncNote?'checked':''}> Ajouter chaque action dans la note du lead sur Explee</label></div></div>`;

  // last reply + thread
  h += `<div class="sec"><h5>Conversation</h5>${l.thread.length? l.thread.map(m=>`<div class="msg ${m.from}"><div class="mh"><span>${m.from==='lead'?esc(l.first_name||l.name):'Vous'}${m.subject?' · '+esc(m.subject):''}</span><span>${dtFr(m.at)}</span></div>${esc(m.text||'(vide)')}</div>`).join('') : '<div class="sub">Conversation indisponible.</div>'}</div>`;
  if(l.log && l.log.length) h += `<div class="sec"><h5>Historique local</h5>${l.log.slice().reverse().map(e=>`<div class="sub">${dtFr(e.at)} — ${esc(e.text)}</div>`).join('')}</div>`;
  h += `</div>`;

  const dr=$('#drawer'); dr.innerHTML=h; dr.classList.add('on'); $('#veil').classList.add('on');
  $('#close').onclick=closeLead;
  dr.querySelectorAll('[data-tpl]').forEach(b=>b.onclick=()=>{S.tpl=b.dataset.tpl; openLead(key,true);});
  dr.querySelectorAll('[data-copy]').forEach(b=>b.onclick=e=>{e.stopPropagation(); const k=b.dataset.copy; copy(k==='draft'?$('#draft').value:l.drafts[k]);});
  dr.querySelectorAll('[data-out]').forEach(b=>b.onclick=()=>callOutcome(l,b.dataset.out));
  dr.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>setStatus(l,b.dataset.status));
  $('#syncNote').onchange=e=>S.syncNote=e.target.checked;
  const sb=$('#snoozeBtn'); if(sb) sb.onclick=()=>{ const v=$('#snooze').value; if(!v) return; patch(l,{snooze_until:v+'T09:00:00'},`Relance reportée au ${dd(v)}`); };
  const us=$('#unsnooze'); if(us) us.onclick=()=>patch(l,{snooze_until:null},null);
  const send=$('#send'); if(send) send.onclick=()=>sendMail(l);
}
function closeLead(){ S.open=null; S.tpl=null; $('#drawer').classList.remove('on'); $('#veil').classList.remove('on'); }
$('#veil').onclick=closeLead;
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeLead(); if(e.key==='/' && document.activeElement.tagName!=='TEXTAREA' && document.activeElement.tagName!=='INPUT'){ e.preventDefault(); $('#q').focus(); }});

async function copy(t){ try{ await navigator.clipboard.writeText(t); toast('Copié'); }catch{ toast('Copie impossible', true); } }

async function post(url, body){
  const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||r.statusText);
  return j;
}
async function patch(l, p, logText){
  try{ await post('/api/state',{key:l.key,patch:p,log:logText,sync_note:S.syncNote&&!!logText}); toast(logText||'Mis à jour'); await load(false); }
  catch(e){ toast(e.message,true); }
}
function setStatus(l, s){
  if(s==='booked') return patch(l,{status:'booked'},'RDV calé');
  if(s==='lost') return patch(l,{status:'lost'},'Pas intéressé');
  return patch(l,{status:null},'Séquence réactivée');
}
function callOutcome(l, o){
  const at = new Date().toISOString();
  if(o==='retry'){
    const v=$('#retryAt').value; if(!v) return toast('Choisissez une date de rappel',true);
    return patch(l,{call:{outcome:'retry',at,retry_at:v+'T09:00:00'}},`Appel : à rappeler le ${dd(v)}`);
  }
  const p = {call:{outcome:o,at}};
  if(o==='booked') p.status='booked';
  if(o==='not_interested') p.status='lost';
  return patch(l,p,`Appel : ${OUT[o]}`);
}
async function sendMail(l){
  const text=$('#draft').value.trim(); if(!text) return toast('Message vide',true);
  const label = {reply:'la réponse',email1:"l'email 1",email2:"l'email 2",email3:"l'email 3"}[S.tpl]||"l'email";
  if(!confirm(`Envoyer ${label} à ${l.name} (${l.email}) maintenant ?`)) return;
  const b=$('#send'); b.disabled=true; b.textContent='Envoi…';
  try{
    const r = await post('/api/send',{key:l.key,step:S.tpl,text,sync_note:S.syncNote});
    toast(r.demo?'Envoi simulé (démo)':'Email envoyé ✓'); S.tpl=null; await load(false);
  }catch(e){ toast(e.message,true); b.disabled=false; b.textContent='Envoyer via Explee'; }
}

$('#q').oninput=e=>{S.q=e.target.value.trim(); renderMain();};
$('#refresh').onclick=()=>load(true);
load(false);
</script>
</body>
</html>
"""


def main():
    global STORE, STATE_FILE
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    demo = "--demo" in sys.argv
    if demo:
        STATE_FILE = HERE / "relance_state_demo.json"
        STORE = Store(demo=True)
    else:
        key = (args[0] if args else os.environ.get("EXPLEE_API_KEY", "")).strip()
        if not key:
            sys.exit(__doc__ + "\nIl manque la clé API : https://explee.com/app-auto-gtm/api-keys")
        STORE = Store(api=Explee(key))
        print("Chargement des hot leads depuis Explee…")
        try:
            STORE.fetch()
        except ApiError as e:
            sys.exit("Clé API invalide (401)." if e.code == 401 else f"Erreur Explee : {e}")
        print(f"  {len(STORE.raw['leads'])} hot leads chargés")
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"Interface : {url}   (Ctrl+C pour arrêter)")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
