#!/usr/bin/env python3
"""Read every reply you have ever had, and group what they actually object to.

    python3 mine.py --all                      # every project
    python3 mine.py --project-file projects/example.json --out replies.csv

WHY THIS COMES BEFORE WRITING A NEW OFFER
-----------------------------------------
There are 55 replies sitting in one inbox. Every objection to the offer is in
there in the buyer's own words, dated, attributable, free. A generator invents
offers with nothing to choose between them; this produces the thing you choose
with.

The counts below are a rules classifier and they are approximate - a reply can
carry two objections, or none the patterns know. **The output is the corpus, not
the table.** Every reply is written out in full, so the summary is an index into
the reading, not a replacement for it.

WHAT IT LOOKS FOR
-----------------
Not sentiment - that is `followups.classify`, and it runs too, so each reply is
tagged warm / negative / not_now / wrong_person alongside. This asks a different
question: **when they say no, what is the no about?** Price, doubt that it works,
they already have someone, no need, timing, or they do not believe you are real.
Those five or six answers point at different fixes, and only one of them is the
offer's wording.

The one that matters most for a per-meeting offer is `roi_doubt`: a buyer who
says "at that price, with a 20% show rate, I decline" is not objecting to your
copy. He is telling you the unit economics do not clear for him, and no rewrite
fixes that - a different price shape, a guarantee, or a different buyer does.

OFFER OR ICP? THE ANSWER IS IN WHICH CAMPAIGN IT LANDS IN
----------------------------------------------------------
Both fixes are available and they are not interchangeable, so the report cuts
objections by campaign as well as in total:

    the same objection across every campaign  -> the OFFER. Everyone hears the
                                                 same pitch and everyone balks
                                                 at the same thing.
    an objection concentrated in one campaign -> the ICP. That audience cannot
                                                 buy this, and rewriting the
                                                 email will not change it.

"We already have an agency" landing only on the 50-person firms and never on the
5-person ones is a targeting instruction, not a copywriting one. Which is why
this runs per project and across all of them: every customer you manage has their
own offer and their own buyers, and their objections separate the two for you
without anyone guessing.
"""

import argparse
import csv
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

import followups as fu
import recover
from explee import Explee, ExpleeError, ShapeError, first_of

HERE = Path(__file__).resolve().parent

# Ordered only for reporting; a reply can match several and keeps all of them.
OBJECTIONS = [
    ("price", r"\btarifs?\b|\bprix\b|trop cher|co[ûu]teux|\bbudget\b|hors budget|"
              r"expensive|pricing|too much|\bcosts?\b|cher pour"),
    ("roi_doubt", r"taux de (transformation|conversion)|ne (marche|fonctionne) pas|"
                  r"d[ée]j[àa] essay|[ée]a n'?a rien donn|pas de r[ée]sultat|"
                  r"garantie|\bshow[- ]?up\b|no[- ]?show|does ?n'?t work|tried (that|this)|"
                  r"\bresults?\b|prouv"),
    ("has_provider", r"d[ée]j[àa] un (prestataire|partenaire|agence)|on a d[ée]j[àa]|"
                     r"nous avons d[ée]j[àa]|en interne|notre [ée]quipe s'?en (occupe|charge)|"
                     r"already (have|work with|use)|in[- ]house|we do (it|this) ourselves"),
    ("no_need", r"pas besoin|aucun besoin|carnet (plein|bien rempli)|complet|"
                r"pas notre priorit[ée]|no need|not a priority|fully booked|"
                r"we'?re good|all set"),
    ("timing", r"pas le (bon )?moment|plus tard|l'?ann[ée]e prochaine|budget.{0,20}prochain|"
               r"trop t[ôo]t|later|next (year|quarter)|not (right )?now|too early"),
    ("credibility", r"\bspams?\b|qui [êe]tes[- ]vous|jamais entendu|pas convaincant|"
                    r"\bpubl?icit[ée]\b|who are you|never heard|not convincing|"
                    r"looks? like (a )?scam"),
    ("privacy", r"\brgpd\b|\bgdpr\b|donn[ée]es personnelles|o[ùu] avez[- ]vous (eu|trouv)|"
                r"where did you get|d[ée]sabonn|unsubscribe"),
    ("lead_quality", r"qualit[ée] des (leads|contacts)|mal cibl|pas qualifi|"
                     r"lead quality|not qualified|poorly targeted"),
]

# What the interested ones asked for. The offer has to answer these first.
ASKS = [
    ("wants_price", r"\btarifs?\b|\bprix\b|combien|how much|pricing|\bdevis\b"),
    ("wants_info", r"envoyez|plus d'?info|documentation|plaquette|send (me|over)|more info"),
    ("wants_call", r"[ée]change|rendez[- ]vous|\bappel\b|\bcall\b|15 min|un point|"
                   r"disponible|dispo\b"),
    ("wants_proof", r"r[ée]f[ée]rences|cas client|exemples?|case stud|references|examples"),
]


def fold(text):
    flat = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return flat.lower()


def tag(text, patterns):
    body = fold(text)
    return [(name, re.search(pat, body).group(0))
            for name, pat in patterns if re.search(pat, body)]


def harvest(api, campaigns, out=sys.stdout):
    """Every inbound message across these campaigns, tagged. No sending, no writes."""
    rows = []
    for campaign in campaigns:
        cid = first_of(campaign, "id", "campaign_id")
        name = first_of(campaign, "name", default=str(cid))
        print("  reading {} ...".format(name), file=out)
        for row in api.inbox_all(cid, tab="replied"):
            pid = first_of(row, "person_id", "id", "lead_id")
            try:
                thread = api.thread(cid, pid)
                messages, _ = recover.thread_view(thread)
                who = recover.person_fields(row, thread)
            except (ShapeError, ExpleeError) as err:
                print("    !! {}: {}".format(pid, err), file=out)
                continue
            for msg in messages:
                if msg["direction"] != "in" or not (msg["text"] or "").strip():
                    continue
                text = " ".join(msg["text"].split())
                bucket, _ = fu.classify(text)
                rows.append({
                    "campaign": name, "campaign_id": cid, "person_id": pid,
                    "email": who["email"], "first_name": who["first_name"],
                    "company": who["company"],
                    "at": msg["at"].isoformat() if msg.get("at") else "",
                    "bucket": bucket,
                    "objections": ",".join(n for n, _ in tag(text, OBJECTIONS)),
                    "asks": ",".join(n for n, _ in tag(text, ASKS)),
                    "reply": text,
                })
    return rows


def report(rows, out=sys.stdout):
    if not rows:
        print("no replies found", file=out)
        return
    total = len(rows)
    print("\n{} replies from {} people\n".format(total, len({r["person_id"] for r in rows})),
          file=out)

    def table(title, key):
        counts = {}
        for row in rows:
            for value in (row[key].split(",") if row[key] else ["(none)"]):
                counts[value] = counts.get(value, 0) + 1
        print(title, file=out)
        for value, count in sorted(counts.items(), key=lambda kv: -kv[1]):
            print("  {:<16}{:>4}  {:>5.0%}".format(value, count, count / total), file=out)
        print(file=out)

    table("sentiment", "bucket")
    table("objections", "objections")
    table("what they asked for", "asks")

    # Which campaign an objection lands in is the ICP half of the answer. The same
    # objection everywhere is the offer's problem; one concentrated in a single
    # campaign is that campaign's audience, and the fix is targeting, not copy.
    campaigns = sorted({r["campaign"] for r in rows})
    if len(campaigns) > 1:
        names = [n for n, _ in OBJECTIONS]
        print("objections by campaign  (spread = offer problem, concentrated = ICP problem)",
              file=out)
        print("  {:<30}{}".format("", "".join("{:>14}".format(n[:13]) for n in names)),
              file=out)
        for campaign in campaigns:
            mine_rows = [r for r in rows if r["campaign"] == campaign]
            cells = []
            for name in names:
                hit = sum(1 for r in mine_rows if name in (r["objections"] or ""))
                cells.append("{:>14}".format(
                    "{} ({:.0%})".format(hit, hit / len(mine_rows)) if hit else "-"))
            print("  {:<30}{}".format(campaign[:29], "".join(cells)), file=out)
        print(file=out)

    # The quotes are the point. Counts tell you where to read; this is the reading.
    print("what they actually said, by objection:", file=out)
    for name, _ in OBJECTIONS:
        quoted = [r for r in rows if name in (r["objections"] or "")]
        if not quoted:
            continue
        print("\n  [{}] {} replies".format(name, len(quoted)), file=out)
        for row in quoted[:4]:
            who = row["company"] or row["email"] or row["person_id"]
            print("    {}: {}".format(who, row["reply"][:220]), file=out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--project-file", action="append")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--config", default=str(HERE / "config.json"))
    ap.add_argument("--campaign", type=int, action="append")
    ap.add_argument("--out", default=str(HERE / "replies.csv"))
    args = ap.parse_args(argv)

    api = Explee()
    if api.balance() <= 0:
        raise SystemExit("balance is not positive - every API call 402s, including this "
                         "read-only one. Top up at https://explee.com/billing")

    rows = []
    for path in recover.load_project_files(args):
        cfg = json.loads(Path(path).read_text())
        print("\n=== {} (project {})".format(cfg.get("name", path), cfg.get("project_id")))
        campaigns = ([{"id": c} for c in args.campaign] if args.campaign
                     else api.campaigns(project_id=cfg.get("project_id")))
        rows.extend(harvest(api, campaigns))

    if rows:
        with open(args.out, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        print("\n{} replies -> {}".format(len(rows), args.out))
    report(rows)
    print("\nRead the quotes before changing the offer. The table says where to look.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
