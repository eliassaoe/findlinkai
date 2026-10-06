#!/usr/bin/env python3
"""relance_act.py — exécute les clics « Envoyer » de la page /relance.

La page ne parle pas directement à Explee (rien ne garantit qu'Explee accepte les
appels d'un navigateur). Elle déclenche .github/workflows/explee-relance-act.yml
avec UN champ `payload` : la liste des actions — chiffrée avec le mot de passe de
la page si RELANCE_PASSWORD est défini (les entrées d'un workflow sont visibles
sur un dépôt public), en clair sinon.

    {"v":1, "actions":[
        {"type":"reply", "key":"187263:p2", "text":"Bonjour Xavier…", "step":"email1", "expect_after":1},
        {"type":"note",  "key":"187262:p3", "line":"[06/10 20:12] Relance · Appel : message laissé"}
    ]}

Garde-fous :
  - la clé du lead doit être un hot lead de l'organisation (on ne répond à
    personne d'autre, et Explee n'autorise de toute façon que les fils où le lead
    a répondu) ;
  - un email ne part que si le fil n'a pas bougé depuis l'affichage de la page
    (même nombre de nos messages après sa dernière réponse, et toujours pas de
    nouvelle réponse) : deux clics, deux onglets ou une relance déjà faite à la
    main ne donnent pas deux emails ;
  - 40 actions au plus par exécution, 5 000 caractères au plus par email.

Les journaux du dépôt sont publics : ce script n'imprime aucun nom, aucune
adresse, aucun texte — seulement des compteurs.

    RELANCE_PASSWORD=... EXPLEE_API_KEY=... RELANCE_PAYLOAD=... python3 relance_act.py
    python3 relance_act.py --dry-run     # vérifie tout, n'envoie rien
"""
import json
import os
import sys

import relance as R
from relance_page import auto_projects, unseal

MAX_ACTIONS = 40
MAX_TEXT = 5000


def decode(payload, password):
    try:
        data = json.loads(payload)
        if not (isinstance(data, dict) and "actions" in data):
            data = unseal(data, password)       # payload chiffré (page avec mot de passe)
    except Exception:
        sys.exit("payload illisible : mauvais mot de passe ou contenu tronqué")
    actions = data.get("actions") if isinstance(data, dict) else None
    if not isinstance(actions, list) or not actions:
        sys.exit("payload vide")
    if len(actions) > MAX_ACTIONS:
        sys.exit(f"{len(actions)} actions : {MAX_ACTIONS} au plus par exécution")
    return actions


def run(api, actions, dry=False, ref=None):
    """Exécute les actions ; renvoie un dict de compteurs (sans données perso)."""
    store = R.Store(api=api)
    store.fetch()
    by_key = {}
    for lead, thread in store.raw["leads"]:
        cid = R.pick(lead, "campaign_id", "campaign.id")
        pid = R.pick(lead, "person_id", "contact_id", "id")
        by_key[f"{cid}:{pid}"] = (lead, thread, cid, pid)

    camp_project = {str(R.pick(c, "id")): str(R.pick(c, "project_id")) for c in store.raw["campaigns"]}
    auto = auto_projects()
    n = {"sent": 0, "notes": 0, "skipped_moved": 0, "skipped_unknown": 0, "skipped_auto": 0,
         "failed": 0, "limited": 0}
    for a in actions:
        key = str(a.get("key", ""))
        if key not in by_key:
            n["skipped_unknown"] += 1
            continue
        lead, thread, cid, pid = by_key[key]
        try:
            if a.get("type") == "reply" and camp_project.get(str(cid)) in auto:
                n["skipped_auto"] += 1           # recover.py relance déjà ce projet
                continue
            if a.get("type") == "reply":
                text = str(a.get("text") or "").strip()
                if not text or len(text) > MAX_TEXT:
                    n["failed"] += 1
                    continue
                v = R.compute(lead, thread, None, ref)
                if v["status"] in ("unknown",) or v["expect_after"] != int(a.get("expect_after", -1)):
                    n["skipped_moved"] += 1      # le fil a bougé : déjà relancé, ou il a répondu
                    continue
                if not dry:
                    api.reply(cid, pid, text)
                    line = f"[{R.now():%d/%m %H:%M}] Relance · Email envoyé : {R.STEP_LABEL.get(a.get('step'), 'Email')}"
                    _append(api, cid, pid, line)
                n["sent"] += 1
            elif a.get("type") == "note":
                line = str(a.get("line") or "").strip()[:300]
                if not line:
                    n["failed"] += 1
                    continue
                if not dry:
                    _append(api, cid, pid, line)
                n["notes"] += 1
            else:
                n["failed"] += 1
        except R.ApiError as e:
            n["limited" if e.code == 429 else "failed"] += 1
            print(f"::warning::action refusée par Explee (HTTP {e.code})")
    return n


def _append(api, cid, pid, line):
    old = api.get_note(cid, pid)
    api.set_note(cid, pid, f"{old}\n{line}".strip() if old else line)


def main():
    dry = "--dry-run" in sys.argv
    password = os.environ.get("RELANCE_PASSWORD", "")
    key = os.environ.get("EXPLEE_API_KEY", "").strip()
    payload = os.environ.get("RELANCE_PAYLOAD", "")
    if not (key and payload):
        sys.exit("EXPLEE_API_KEY et RELANCE_PAYLOAD sont requis")
    actions = decode(payload, password)
    try:
        n = run(R.Explee(key), actions, dry=dry)
    except R.ApiError as e:
        sys.exit("Solde Explee négatif : rien n'est parti." if e.code == 402 else f"Explee HTTP {e.code}")
    summary = (f"{'DRY RUN · ' if dry else ''}{n['sent']} email(s) envoyé(s) · {n['notes']} note(s) · "
               f"{n['skipped_moved']} ignoré(s) car le fil a bougé · {n['limited']} limité(s) par Explee · "
               f"{n['failed']} échec(s) · {n['skipped_unknown']} inconnu(s) · {n['skipped_auto']} laissé(s) à recover.py")
    print(summary)
    out = os.environ.get("GITHUB_STEP_SUMMARY")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(summary + "\n")
    if n["failed"] and not (n["sent"] or n["notes"]):
        sys.exit(1)


if __name__ == "__main__":
    main()
