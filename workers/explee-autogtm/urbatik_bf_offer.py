"""Urbatik Black Friday 2026: "your first dossier is free" to everyone who already
answered a creha.fr (Urbatik) email in Explee, as a new imported campaign.

Owner, 25 Nov 2026: offer a free first dossier (DP or PC), limited in time, and
send it wide to everyone who showed interest. Explee refuses a 4th reply in an
old thread, so the offer goes out as a fresh campaign instead of a reply.

Who gets it: every contact who replied in project 61157 (creha.fr), except
"not interested", unsubscribed, gone, wrong-person and automatic replies that
handed us another address. Nothing personal is printed: counts only.

    python3 urbatik_bf_offer.py            # dry run: counts per intent, field names
    python3 urbatik_bf_offer.py --apply    # import the campaign (it starts Active)
"""

import argparse
import os
import re
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from explee import Explee, ExpleeError, first_of  # noqa: E402

PROJECT = 61157
NAME = "Black Friday : 1er dossier offert (contacts qui ont répondu)"
SKIP = {"not_interested", "recipient_gone", "unsubscribed", "self_reply", "email_changed",
        "do_not_contact", "wrong_person", "bounced"}
CALL = re.compile(r"appel|rappel|t[ée]l[ée]phon|m'appeler|rendez-vous|\brdv\b|calendly|cr[ée]neau", re.I)
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)

BRIEF = {
    "language": "fr",
    "instructions": (
        "Offre Black Friday d'Urbatik. Le destinataire nous a déjà répondu il y a quelques "
        "semaines au sujet des dossiers de mairie : le rappeler en une phrase, sans inventer "
        "de détail sur ce qu'il a dit. L'offre : jusqu'au lundi 1er décembre, nous préparons "
        "gratuitement le premier dossier d'urbanisme de son entreprise, déclaration préalable "
        "ou permis de construire, prêt à déposer en mairie en 72 heures. Un seul dossier offert "
        "par entreprise. Pour en profiter, il répond à cet email avec l'adresse du chantier, le "
        "type de travaux et 2 ou 3 photos. Aucun lien dans l'email. Moins de 90 mots, en "
        "français, vouvoiement, ton direct et concret. Jamais « simplement », « juste » ou "
        "« facilement ». Ne jamais inventer de chiffre ou de référence client. Si le prénom est « Madame, Monsieur », ouvrir par « Bonjour Madame, Monsieur, ». Ne jamais citer l'intitulé de poste."),
    "followup_instructions": (
        "Relances courtes (moins de 50 mots), en français, vouvoiement, aucun lien. "
        "Relance 1 : rappeler que le premier dossier est offert jusqu'au lundi 1er décembre, "
        "et qu'il suffit de répondre avec l'adresse du chantier et le type de travaux. "
        "Relance 2 : dernier jour de l'offre, lundi 1er décembre. Ne jamais inventer de fait."),
}


def intent_of(row):
    return str(first_of(row, "latest_intent", "intent", "reply_intent", "category",
                        "classification", default="") or "").lower()


def lead_of(row):
    email = str(first_of(row, "to_email", "email", "lead_email", "email_address",
                         default="") or "").strip().lower()
    full = str(first_of(row, "lead_name", "full_name", "name", "reply_from_name",
                        default="") or "").strip()
    first = str(first_of(row, "first_name", "firstname", default="") or "").strip()
    last = str(first_of(row, "last_name", "lastname", default="") or "").strip()
    if not first and full:
        parts = full.split()
        first, last = parts[0], " ".join(parts[1:])
    domain = email.split("@")[-1] if "@" in email else ""
    company = str(first_of(row, "company_name", "company", default="") or "").strip()
    return {"email": email,
            "first_name": first.title() or "Madame, Monsieur",
            "last_name": last.title() or (company or domain.split(".")[0].title() or "Entreprise"),
            "company_domain": str(first_of(row, "company_domain", default="") or domain),
            "job_title": str(first_of(row, "job_title", "title", default="") or "Gérant"),
            "linkedin_url": ""}


REPLY = """Bonjour{name},

Pour le Black Friday, nous vous offrons votre premier dossier : déclaration préalable ou permis de construire, préparé gratuitement et prêt à déposer en mairie en 72 h.

Pour en profiter, répondez à cet email avec l'adresse du chantier, le type de travaux et 2 ou 3 photos.

Offre valable jusqu'au lundi 1er décembre, un dossier offert par entreprise.

{sig}"""


def _parse_ts(value):
    from datetime import datetime, timezone
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def reply_all(api, rows, apply):
    """The offer as a reply in each thread (Explee dedupes imports against the project,
    so a new campaign reaches nobody). Skips anyone we already wrote to in the last
    24 h, and Explee itself refuses a 4th reply after the lead's last message."""
    from datetime import datetime, timedelta, timezone
    now, sent, stats = datetime.now(timezone.utc), set(), Counter()
    for r in rows:
        if intent_of(r) in SKIP or first_of(r, "erased", default=False):
            stats["skipped_intent"] += 1
            continue
        email = str(first_of(r, "email", default="") or "").lower()
        if not EMAIL.match(email) or email in sent:
            stats["skipped_dup_or_invalid"] += 1
            continue
        if now - _parse_ts(first_of(r, "latest_sent_at", default="")) < timedelta(hours=24):
            stats["skipped_written_today"] += 1
            continue
        if str(first_of(r, "lead_status", default="") or "").lower() in ("won", "demo", "lost", "unqualified"):
            stats["skipped_status"] += 1
            continue
        cid, pid = first_of(r, "campaign_id"), first_of(r, "person_id")
        sig = "Urbatik"
        try:
            th = api.thread(cid, pid)
            msgs = first_of(th, "messages", "thread", "items", default=th) or []
            mine = [m for m in msgs if isinstance(m, dict) and str(first_of(
                m, "msg_type", "type", "direction", default="")).lower() in ("sent", "outbound", "out")]
            if mine:
                sig = str(first_of(mine[-1], "from_first_name", "sender_first_name",
                                   default="") or "Urbatik")
            theirs = " ".join(str(first_of(m, "body_text", "text", "body", default="") or "")
                              .split("\nDe :")[0].split("\nFrom:")[0]
                              for m in msgs if isinstance(m, dict) and m not in mine)
            # Owner rule: never chase someone who asked for a call or set a meeting.
            if CALL.search(theirs):
                stats["skipped_asked_for_call"] += 1
                continue
            if re.search(r"relanc|arr[êe]te[zr]? de|ne plus (m'|me )?(é|e)crire|d[ée]sinscri", theirs, re.I):
                stats["skipped_asked_to_stop"] += 1
                continue
        except ExpleeError:
            stats["thread_unreadable"] += 1
        first = str(first_of(r, "name", default="") or "").split(" ")[0].title()
        text = REPLY.format(name=(" " + first) if first.isalpha() and len(first) > 1 else "", sig=sig)
        if not apply:
            stats["would_send"] += 1
            continue
        try:
            api.reply(cid, pid, text)
            stats["sent"] += 1
            sent.add(email)
        except ExpleeError as err:
            stats["refused_{}".format(err.status)] += 1
        time.sleep(1)
    print("reply mode ({}): {}".format("APPLY" if apply else "dry run", dict(stats)))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--reply", action="store_true",
                    help="send the offer as a reply in each existing thread instead of importing")
    args = ap.parse_args(argv)
    api = Explee()

    camps = api.campaigns(PROJECT) or []
    print("{} campaigns in project {}".format(len(camps), PROJECT))
    rows, keys = [], Counter()
    for c in camps:
        cid = first_of(c, "id", "campaign_id")
        try:
            got = api.inbox_all(cid, tab="replied")
        except ExpleeError as err:
            print("campaign {}: inbox HTTP {}".format(cid, err.status))
            continue
        for r in got or []:
            keys.update(r.keys())
        rows.extend(got or [])
    print("replied rows: {}; fields seen: {}".format(len(rows), ", ".join(sorted(keys))))
    print("intents: {}".format(dict(Counter(intent_of(r) or "?" for r in rows))))

    leads, seen = [], set()
    for r in rows:
        if intent_of(r) in SKIP:
            continue
        if first_of(r, "unsubscribed", "is_unsubscribed", "erased", default=False):
            continue
        lead = lead_of(r)
        if not EMAIL.match(lead["email"]) or lead["email"] in seen:
            continue
        seen.add(lead["email"])
        leads.append(lead)
    print("{} leads to import".format(len(leads)))
    if args.reply:
        return reply_all(api, rows, args.apply)
    if not args.apply:
        print("DRY RUN - add --apply")
        return 0
    if not leads:
        return 1
    try:
        task = api.import_campaign(PROJECT, NAME, leads, instructions=BRIEF["instructions"],
                                   followup_instructions=BRIEF["followup_instructions"],
                                   language=BRIEF["language"])
    except ExpleeError as err:
        print("import refused: HTTP {} {}".format(
            err.status, re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "<email>", str(err))[:1500]))
        return 1
    task_id = first_of(task, "task_id", "id")
    status, got = "pending", {}
    for _ in range(120):
        got = api.import_status(task_id)
        status = first_of(got, "status", default=first_of(
            first_of(got, "meta", default={}), "status", default="pending"))
        if status in ("completed", "failed"):
            break
        time.sleep(5)
    print("import {}: {}".format(status, re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "<email>",
                                                str(got))[:1200]))
    return 0 if status == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
