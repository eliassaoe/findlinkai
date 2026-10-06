#!/usr/bin/env python3
"""relance_page.py — publie /relance : le pilote de relance des hot leads, chiffré.

Lit tous les hot leads de l'organisation Explee (tous projets, toutes campagnes),
calcule pour chacun la prochaine relance avec le moteur de relance.py (3 emails +
1 appel si un numéro figure dans la signature), et écrit `relance.html` à la
racine du site.

Mot de passe FACULTATIF. Sans le secret RELANCE_PASSWORD (choix actuel), la page
est publiée en clair : noindex, hors sitemap, liée de nulle part — mais le dépôt
est public, donc ses données sont aussi lisibles dans relance.html sur GitHub.
Avec le secret, tout est chiffré (AES-256-GCM, PBKDF2-SHA256 310 000 itérations)
et la page demande le mot de passe.

L'état de chaque lead (RDV calé, appel passé, attendre jusqu'au…) vit dans la
NOTE du lead sur Explee — la page y écrit, ce script la relit. Les emails envoyés
se lisent directement dans le fil. Rien d'autre n'est stocké.

    EXPLEE_API_KEY=... python3 relance_page.py --write
    python3 relance_page.py --demo --write          # données d'exemple

Lancé par .github/workflows/explee-relance.yml. Lecture seule côté Explee
(GET gratuits) : ce script n'envoie aucun email et n'écrit aucune note.
"""
import base64
import hashlib
import json
import os
import secrets
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import relance as R

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TEMPLATE = HERE / "relance_page.html"
OUT = ROOT / "relance.html"
ITERATIONS = 310_000
MARK = "/*__RELANCE_BLOB__*/null"


def encrypt(payload: dict, password: str) -> dict:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # pip install cryptography
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS, 32)
    ct = AESGCM(key).encrypt(iv, json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8"), None)
    b64 = lambda b: base64.b64encode(b).decode()
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITERATIONS, "salt": b64(salt), "iv": b64(iv), "ct": b64(ct)}


def decrypt(blob: dict, password: str) -> dict:
    """Pour les tests : même opération que le navigateur."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    d = lambda s: base64.b64decode(s)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), d(blob["salt"]), blob["iter"], 32)
    return json.loads(AESGCM(key).decrypt(d(blob["iv"]), d(blob["ct"]), None))


def seal(view, password):
    return encrypt(view, password) if password else {"plain": view}


def unseal(blob, password):
    if isinstance(blob, dict) and "plain" in blob:
        return blob["plain"]
    return decrypt(blob, password)


def auto_projects():
    """Projets déjà relancés automatiquement par recover.py (projects/*.json) :
    la page n'y propose pas d'envoyer d'email, pour ne pas doubler la cadence."""
    ids = set()
    for f in sorted((HERE / "projects").glob("*.json")):
        try:
            pid = json.loads(f.read_text("utf-8")).get("project_id")
        except Exception:
            continue
        if pid:
            ids.add(str(pid))
    return ids


def notes_for(store):
    """{clé lead → note Explee}. Un GET gratuit par hot lead."""
    if store.demo:
        return {}
    pairs = []
    for lead, _ in store.raw["leads"]:
        cid = R.pick(lead, "campaign_id", "campaign.id")
        pid = R.pick(lead, "person_id", "contact_id", "id")
        if cid and pid:
            pairs.append((f"{cid}:{pid}", cid, pid))
    with ThreadPoolExecutor(max_workers=8) as ex:
        notes = list(ex.map(lambda t: store.api.get_note(t[1], t[2]), pairs))
    return {k: n for (k, _, _), n in zip(pairs, notes)}


def build(store):
    store.fetch()
    notes = notes_for(store)
    states = {k: R.state_from_note(n) for k, n in notes.items()}
    view = store.view(states=states)
    auto = auto_projects()
    for lead in view["leads"]:
        lead["note"] = notes.get(lead["key"], "")
        lead["auto"] = str(lead.get("project_id")) in auto
    view["auto_projects"] = sorted(auto)
    view["generated_at"] = R.now().isoformat(timespec="seconds")
    return view


def unchanged(prev_html, view, password, max_age_h=12):
    """Vrai si la page publiée contient déjà exactement ces leads et a moins de
    max_age_h heures (au-delà on republie pour que « Synchro il y a… » reste juste)."""
    import re
    m = re.search(r"const PAGE = (\{.*?\});\n", prev_html, re.S)
    if not m:
        return False
    try:
        prev = json.loads(m.group(1).replace("<\\/", "</"))
        old = unseal(prev["blob"], password)
    except Exception:
        return False
    if render(prev["blob"], prev.get("status")) != prev_html:
        return False                     # le gabarit a changé depuis : republier
    age = R.now() - R.parse_dt(old.get("generated_at"))
    if age.total_seconds() > max_age_h * 3600:
        return False
    strip = lambda v: json.dumps([{k: x for k, x in l.items() if k not in ("drafts", "ctx", "days_silent")}
                                  for l in v["leads"]], sort_keys=True, default=str)
    return strip(old) == strip(view) and old.get("today") == view.get("today")


def render(blob, status):
    html = TEMPLATE.read_text("utf-8")
    assert MARK in html, "marqueur de données absent du gabarit"
    data = {"blob": blob, "status": status}
    return html.replace(MARK, json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))


def main():
    demo = "--demo" in sys.argv
    write = "--write" in sys.argv
    password = os.environ.get("RELANCE_PASSWORD", "")
    status = {"at": R.now().isoformat(timespec="seconds"), "ok": False, "message": ""}

    if demo:
        store = R.Store(demo=True)
    else:
        key = os.environ.get("EXPLEE_API_KEY", "").strip()
        if not key:
            sys.exit("EXPLEE_API_KEY manquant")
        store = R.Store(api=R.Explee(key))
    try:
        view = build(store)
    except R.ApiError as e:
        msg = {401: "Clé API Explee refusée.",
               402: "Solde Explee négatif : Explee bloque tous les appels, même gratuits. "
                    "Rechargez sur explee.com/app-auto-gtm/billing."}.get(e.code, f"Erreur Explee : {e}")
        print(f"::warning::{msg}")
        # On garde la page précédente (et ses données) : on n'écrase rien.
        if OUT.exists() and write and '"blob": null' not in OUT.read_text("utf-8"):
            print("Page précédente conservée.")
            return
        status["message"] = msg
        blob = None
    else:
        status.update(ok=True, message=f"{len(view['leads'])} hot leads")
        blob = seal(view, password)
        n = {b: sum(1 for l in view["leads"] if l["bucket"] == b) for b in ("reply", "call", "today", "scheduled", "booked")}
        print(f"{len(view['leads'])} hot leads · à répondre {n['reply']} · appels {n['call']} · "
              f"relances {n['today']} · planifiés {n['scheduled']} · RDV {n['booked']}")

    # Sans ce garde-fou, chaque synchro (2 h) ferait un commit et un redéploiement
    # du site pour rien (et le chiffré, s'il y en a un, change à chaque run).
    if write and blob and OUT.exists() and unchanged(OUT.read_text("utf-8"), view, password):
        print("rien de nouveau depuis la dernière synchro : relance.html inchangé")
        return

    html = render(blob, status)
    if write:
        OUT.write_text(html, "utf-8")
        print(f"écrit {OUT.relative_to(ROOT)} ({len(html) // 1024} Ko)")
    else:
        print("(aperçu — ajoutez --write pour écrire relance.html)")


if __name__ == "__main__":
    main()
