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


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
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
