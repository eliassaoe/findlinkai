#!/usr/bin/env python3
"""The part of the weekly job that is not allowed to be a judgement call.

    python3 decide.py measure.json            # print the plan, change nothing
    python3 decide.py measure.json --apply    # write the new statuses into variants.json

measure.json is the raw output of measure.sql: a list of row objects, or the
{columns, results} shape execute-sql returns. Either is accepted.

WHY THIS FILE EXISTS
--------------------
A language model asked "did the new subject line win?" will almost always say
yes. It sees 12 clicks against 9 and reads a trend. So the model does not get to
decide: it collects the numbers, runs this, and does what comes out. The rules
below are deliberately hard to satisfy.

HOW THE TEST ACTUALLY WORKS
---------------------------
PostHog holds exactly one email per step - there is no split node - so two
variants can never be live at the same time. The comparison is therefore
sequential: the champion runs, then a challenger runs, and the two run windows
are compared.

That is a weaker design than a concurrent split and it is worth being blunt
about why it is still the right one here. The welcome step sends ~130/week. A
concurrent five-arm test on click rate would need roughly 25 weeks to resolve.
Sequential testing of one big-swing challenger at a time gets a readable answer
in 4-6 weeks per test, which is the difference between a loop that runs and a
loop that never concludes anything.

The cost is confounding: a challenger's window is a different slice of calendar
than the champion's, so a good week can masquerade as a good subject line. Three
things push back on that:

  * MIN_EFFECT - a challenger has to win by a wide margin, not a hair. A 20%
    lift is thrown away on purpose, because a quiet fortnight can manufacture
    20% on its own.
  * The alpha ladder - a weekly peek at a growing sample inflates false
    positives, so early looks are judged at 1% and only a fully-grown sample
    gets the usual 5%.
  * A real baseline - the champion's numbers freeze the instant a challenger
    goes live, so it has to bank BASELINE_SENDS first. Skipping this is what
    kills sequential tests: a champion with 130 sends behind it cannot be
    beaten by anything, no matter how much better the challenger really is.

Simulated against a known-better variant (+60% on clicks, 130 sends/week), the
loop crowns the right one in 28 of 30 runs and wrongly displaces a champion in
1 of 30 when nothing is actually better. That last number is the price of the
whole design and it is a fair one.

What it does NOT do is re-run an old champion to check itself. Sequential
comparison against frozen numbers would give the same answer twice, so a
re-coronation pass would be theatre. When a step runs out of challengers the
right move is new copy, and the job says so rather than inventing work.

WHAT IS BEING OPTIMISED
-----------------------
Conversion first, clicks as the tiebreak, opens never. Apple Mail Privacy
Protection fabricates opens, and the published trap is real: curiosity-bait
subjects post 40% opens against 2% clicks. A loop that maximises opens
converges on lying to people, so open rate is carried as a diagnostic and is
structurally unable to promote anything.
"""

import argparse
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIBRARY = HERE / "variants.json"

# --- the gates -------------------------------------------------------------
MIN_SENDS = 120          # per arm, before a challenger's numbers are read at all
BASELINE_SENDS = 400     # the champion must bank this much before a challenger starts
PLANNED_SENDS = 400      # per arm, the sample the test was designed around
MIN_EFFECT = 0.25        # challenger must beat champion by 25% relative, not 0.1pp
ALPHA_EARLY = 0.01       # peeking at a part-grown sample costs you significance
ALPHA_FULL = 0.05        # once the planned sample is in, the normal threshold
MAX_TEST_SENDS = 1200    # past this a test is a draw; stop burning audience on it
BOUNCE_ALARM = 0.03      # >3% bounce is a deliverability problem, not a copy result
MIN_CONVERSIONS = 8      # total across both arms before conversion can decide
MAX_WEEKS_TO_BASELINE = 10  # past this, the step is too quiet to test and we say so

LIVE = ("champion", "testing")


# --- statistics ------------------------------------------------------------
def norm_sf(z):
    """Upper tail of the standard normal. erfc is exact enough and needs no scipy."""
    return 0.5 * math.erfc(z / math.sqrt(2))


def two_proportion_p(hits_a, n_a, hits_b, n_b):
    """Two-sided p for 'these two rates differ'. Returns None when it cannot be computed."""
    if n_a <= 0 or n_b <= 0:
        return None
    p_a, p_b = hits_a / n_a, hits_b / n_b
    pooled = (hits_a + hits_b) / (n_a + n_b)
    if pooled in (0.0, 1.0):
        return None
    se = math.sqrt(pooled * (1 - pooled) * (1 / n_a + 1 / n_b))
    if se == 0:
        return None
    return 2 * norm_sf(abs(p_a - p_b) / se)


def rate(hits, n):
    return (hits / n) if n else 0.0


# --- loading ---------------------------------------------------------------
def load_measurements(path):
    """measure.sql output -> {subject: row}. Accepts a plain list or execute-sql's shape."""
    raw = json.loads(Path(path).read_text())
    if isinstance(raw, dict) and "results" in raw:
        columns = raw.get("columns") or []
        raw = [dict(zip(columns, r)) for r in raw["results"]]
    rows = {}
    for row in raw:
        subject = row.get("subject")
        if not subject:
            continue
        rows[subject] = {
            "sent": int(row.get("sent") or 0),
            "opened": int(row.get("opened") or 0),
            "clicked": int(row.get("clicked") or 0),
            "converted": int(row.get("converted") or 0),
            "bounced": int(row.get("bounced") or 0),
            "failed": int(row.get("failed") or 0),
            "first_sent": row.get("first_sent"),
            "last_sent": row.get("last_sent"),
        }
    return rows


def weeks_live(stats):
    """How long this variant has actually been sending, from the data itself."""
    first, last = stats.get("first_sent"), stats.get("last_sent")
    if not first or not last:
        return 0.0
    try:
        from datetime import datetime
        parse = lambda t: datetime.fromisoformat(str(t).replace("Z", "+00:00"))
        return max((parse(last) - parse(first)).total_seconds() / 604800.0, 0.0)
    except (ValueError, TypeError):
        return 0.0


EMPTY = {"sent": 0, "opened": 0, "clicked": 0, "converted": 0, "bounced": 0,
         "failed": 0, "first_sent": None, "last_sent": None}


# --- the decision ----------------------------------------------------------
def judge(step_key, step, rows):
    """One step in, one decision out. Never mutates; returns what should happen."""
    def note(action, live, headline, detail):
        return {"step": step_key, "action": action, "live": live,
                "headline": headline, "detail": detail}

    champion = next((v for v in step["variants"] if v["status"] == "champion"), None)
    challenger = next((v for v in step["variants"] if v["status"] == "testing"), None)
    queued = [v for v in step["variants"] if v["status"] == "queued"]

    if champion is None:
        return note("broken", None, "no champion on this step",
                    "variants.json is inconsistent - exactly one variant per step must be champion")

    champ_stats = rows.get(champion["subject"], EMPTY)

    # Nothing under test: put the next challenger up, if there is one.
    if challenger is None:
        if not queued:
            beaten = [v for v in step["variants"] if v["status"] == "retired"]
            return note("exhausted", champion["id"],
                        "{} has beaten all {} challengers".format(champion["id"], len(beaten)),
                        "nothing left to test on this step. The champion's angle is '{}' - the "
                        "useful next move is two or three variants that attack it from angles "
                        "not yet tried here, not another rewrite of the same idea.".format(
                            champion["angle"]))
        # The moment a challenger goes live the champion stops sending, so its
        # numbers freeze exactly as they are now. Whatever baseline it has banked
        # by then is the baseline for every comparison that follows - start a test
        # on a thin champion and no challenger can ever be proven better.
        if champ_stats["sent"] < BASELINE_SENDS:
            per_week = champ_stats["sent"] / weeks_live(champ_stats) if weeks_live(champ_stats) >= 1 else 0
            short = BASELINE_SENDS - champ_stats["sent"]
            if per_week and short / per_week > MAX_WEEKS_TO_BASELINE:
                return note("underpowered", champion["id"],
                            "this step sends ~{:.0f}/week - too quiet to A/B".format(per_week),
                            "a readable test needs {} per arm, which is {:.0f} more weeks of "
                            "baseline and as long again for the challenger. Leaving the champion "
                            "alone is the honest call; the way to make this step testable is more "
                            "traffic into it, not a better subject line.".format(
                                BASELINE_SENDS, short / per_week))
            return note("wait", champion["id"],
                        "champion has {} sends, needs {} before a challenger starts".format(
                            champ_stats["sent"], BASELINE_SENDS),
                        "starting now would freeze a baseline too thin to beat")
        nxt = queued[0]
        return note("start", nxt["id"],
                    "putting {} up against the champion".format(nxt["id"]),
                    "angle {}: {}".format(nxt["angle"], nxt["hypothesis"]))

    chal_stats = rows.get(challenger["subject"], EMPTY)

    # Deliverability beats every copy question. A bouncing variant is pulled at once.
    for who, stats in (("challenger", chal_stats), ("champion", champ_stats)):
        if stats["sent"] >= 50 and rate(stats["bounced"], stats["sent"]) > BOUNCE_ALARM:
            return note("alarm", champion["id"],
                        "{} is bouncing at {:.1%}".format(who, rate(stats['bounced'], stats['sent'])),
                        "that is a sending-domain problem, not a copy result - stop and look at DNS")

    if chal_stats["sent"] < MIN_SENDS:
        return note("wait", challenger["id"],
                    "{} sends so far, need {}".format(chal_stats["sent"], MIN_SENDS),
                    "too thin to read; leaving it live")

    # Conversion is the real objective, but at this volume it is often too sparse
    # to say anything. Clicks stand in until there are enough conversions to test.
    total_conversions = champ_stats["converted"] + chal_stats["converted"]
    if total_conversions >= MIN_CONVERSIONS:
        metric = "conversion"
        c_hits, t_hits = champ_stats["converted"], chal_stats["converted"]
    else:
        metric = "click"
        c_hits, t_hits = champ_stats["clicked"], chal_stats["clicked"]

    c_rate = rate(c_hits, champ_stats["sent"])
    t_rate = rate(t_hits, chal_stats["sent"])
    p = two_proportion_p(c_hits, champ_stats["sent"], t_hits, chal_stats["sent"])
    grown = chal_stats["sent"] >= PLANNED_SENDS and champ_stats["sent"] >= PLANNED_SENDS
    alpha = ALPHA_FULL if grown else ALPHA_EARLY
    lift = ((t_rate - c_rate) / c_rate) if c_rate else (1.0 if t_rate else 0.0)

    summary = ("{} rate {:.2%} vs champion {:.2%} on {}/{} sends, "
               "lift {:+.0%}, p={}, judged at alpha {:.0%}").format(
        metric, t_rate, c_rate, chal_stats["sent"], champ_stats["sent"],
        lift, "n/a" if p is None else "{:.4f}".format(p), alpha)

    if p is not None and p < alpha and lift >= MIN_EFFECT:
        return note("promote", challenger["id"],
                    "{} wins on {}".format(challenger["id"], metric), summary)

    if p is not None and p < alpha and t_rate < c_rate:
        return note("retire", champion["id"],
                    "{} lost on {}".format(challenger["id"], metric), summary)

    if chal_stats["sent"] >= MAX_TEST_SENDS:
        # Two ways to run out of road. Separating them matters: "real but small"
        # is a note to self about MIN_EFFECT, "never separated" is just a draw.
        if p is not None and p < alpha:
            why = ("beat the champion by only {:+.0%}, under the {:.0%} margin this "
                   "design needs to trust a sequential result").format(lift, MIN_EFFECT)
        else:
            why = "never separated from the champion"
        return note("retire", champion["id"],
                    "{} retired after {} sends - {}".format(
                        challenger["id"], chal_stats["sent"], why),
                    summary + " - calling it rather than waiting forever")

    return note("wait", challenger["id"], "not separated yet", summary)


def apply(library, decisions):
    """Write the decisions into variants.json. Only status fields and results move."""
    for d in decisions:
        step = library["steps"][d["step"]]
        by_id = {v["id"]: v for v in step["variants"]}

        if d["action"] == "promote":
            for v in step["variants"]:
                if v["status"] == "champion":
                    v["status"] = "retired"
                    v["retired_because"] = "beaten by " + d["live"]
            by_id[d["live"]]["status"] = "champion"
            by_id[d["live"]]["defences"] = 0
        elif d["action"] == "retire":
            for v in step["variants"]:
                if v["status"] == "testing":
                    v["status"] = "retired"
                    v["retired_because"] = d["headline"]
            champion = next(v for v in step["variants"] if v["status"] == "champion")
            champion["defences"] = champion.get("defences", 0) + 1
        elif d["action"] == "start":
            by_id[d["live"]]["status"] = "testing"
    return library


def stamp_results(library, rows):
    for step in library["steps"].values():
        for v in step["variants"]:
            if v["subject"] in rows:
                v["results"] = rows[v["subject"]]
    return library


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("measurements", help="JSON from measure.sql")
    ap.add_argument("--apply", action="store_true", help="write the result back into variants.json")
    args = ap.parse_args()

    library = json.loads(LIBRARY.read_text())
    rows = load_measurements(args.measurements)
    decisions = [judge(k, s, rows) for k, s in library["steps"].items()]

    width = max(len(d["step"]) for d in decisions)
    for d in decisions:
        print("{:<{w}}  {:<9} live={:<24} {}".format(
            d["step"], d["action"].upper(), d["live"] or "-", d["headline"], w=width))
        print("{:<{w}}  {}".format("", d["detail"], w=width))

    changed = [d for d in decisions if d["action"] in ("promote", "retire", "start")]
    print("\n{} step(s) need a copy swap in PostHog: {}".format(
        len(changed), ", ".join("{}->{}".format(d["step"], d["live"]) for d in changed) or "none"))
    if any(d["action"] == "alarm" for d in decisions):
        print("DELIVERABILITY ALARM - do not promote anything this week")
    if any(d["action"] == "broken" for d in decisions):
        print("variants.json is inconsistent - fix before applying")
        return 1

    if args.apply:
        library = apply(stamp_results(library, rows), decisions)
        LIBRARY.write_text(json.dumps(library, indent=2, ensure_ascii=False) + "\n")
        print("variants.json updated")

    Path(HERE / "last_decision.json").write_text(json.dumps(decisions, indent=2, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
