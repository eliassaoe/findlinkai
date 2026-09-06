#!/usr/bin/env python3
"""Change 1: shorten the sequence - but only once the replies say it pays.

    python3 sequence.py measure                        # replies by step, every campaign
    python3 sequence.py measure --campaign 127292
    python3 sequence.py shorten --campaign 127292 --emails 2          # shows the PATCH
    python3 sequence.py shorten --campaign 127292 --emails 2 --apply  # does it

THE ARITHMETIC, AND WHY IT IS NOT A FREE WIN
--------------------------------------------
AutoGTM bills $0.03 an email and nothing for the lead behind it, so the only
number that moves cost per reply is emails per reply. Cutting a four-email
sequence to two halves the sends per lead - and keeps whatever share of the
replies arrived by email 2. If 70% of replies come in by then, cost per reply
falls 29%. If 50% do, it falls 0%: you sent half the mail and got half the
replies. Below 50% it goes UP.

    cost-per-reply ratio at N emails  =  (N / current) / share of replies by step N

So the tool refuses to shorten on a hunch: `shorten` measures first and only
proceeds when the ratio at the requested length clears MIN_GAIN (or --force).
`measure` recommends the shortest length that still keeps MIN_SHARE of the
replies - one email is always the cheapest per reply, and also the one that
throws away the most replies per lead.

Two things it says out loud that the dashboard does not:

  * A shorter sequence burns the lead pool `current / N` times faster. Autopilot
    already reports campaigns running dry in 3-6 days; halving the sequence
    halves that. Cheaper per reply is not the same as more replies.
  * Recent leads have not had time to receive email 3 or 4, so their replies
    can only be at steps 1-2 and flatter the early steps. Threads younger than
    --settled-days are left out of the arithmetic and counted separately.

Every call `measure` makes is a GET: free, on any positive balance.
"""

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import followups as fu
from explee import Explee, ExpleeError, ShapeError, first_of
from recover import thread_view
import state

HERE = Path(__file__).resolve().parent
MIN_GAIN = 0.15            # do not touch a live sequence for less than a 15% cut
MIN_REPLIES = 30           # below this the step shares are noise
MIN_POSITIVE = 12          # positives decide when there are enough of them
MIN_SHARE = 0.8            # a cut must keep 80% of the replies per lead
SETTLED_DAYS = None        # derived from the sequence: (emails-1) x delay + 2; --settled-days overrides
SETTLE_MARGIN = 2          # days after the last send for the reply to arrive
FALLBACK_SETTLED = 14      # when the delay cannot be read off the campaign


# --- reading one thread ------------------------------------------------------
def reply_step(messages):
    """1-based number of the email they answered: how many we sent before they wrote."""
    sent = 0
    for msg in messages:
        if msg["direction"] == "out":
            sent += 1
        elif sent:
            return sent
        else:
            return None          # they wrote first - not a campaign reply
    return None


def first_outbound_at(messages):
    for msg in messages:
        if msg["direction"] == "out":
            return msg.get("at")
    return None


def first_inbound_text(messages):
    for msg in messages:
        if msg["direction"] == "in":
            return msg.get("text") or ""
    return ""


def bucket_of(text):
    """all / positive / auto - what kind of reply this is, via the shared classifier."""
    bucket, _ = fu.classify(text)
    if bucket == "auto_reply":
        return "auto"
    if bucket in fu.SENDING or bucket in fu.QUEUED:
        return "positive"
    return "human"


# --- the tally ---------------------------------------------------------------
def tally_steps(threads, now, settled_days=FALLBACK_SETTLED):
    """threads: iterable of thread payloads -> counts by step.

    Returns {"replies": {step: n}, "positive": {step: n}, "auto": n,
             "young": n, "unknown_age": n, "no_step": n}
    """
    out = {"replies": {}, "positive": {}, "auto": 0, "young": 0, "unknown_age": 0,
           "no_step": 0}
    cutoff = now - dt.timedelta(days=settled_days)
    for thread in threads:
        messages, _ = thread_view(thread)
        step = reply_step(messages)
        if step is None:
            out["no_step"] += 1
            continue
        started = first_outbound_at(messages)
        if started is None:
            out["unknown_age"] += 1          # counted, but flagged
        elif started > cutoff:
            out["young"] += 1
            continue
        kind = bucket_of(first_inbound_text(messages))
        if kind == "auto":
            out["auto"] += 1
            continue
        out["replies"][step] = out["replies"].get(step, 0) + 1
        if kind == "positive":
            out["positive"][step] = out["positive"].get(step, 0) + 1
    return out


# --- the campaign's sequence field, whatever shape it has ----------------------
# Explee's real field, seen 6 Sept 2026: {"max_touches": 2, "delay_days": 3}. Read as
# two follow-ups after the first email, so a three-email sequence; if replies never
# show up at step 3 in `measure`, max_touches counts the whole sequence instead.
COUNT_KEYS = ("max_touches", "count", "number", "n", "total", "emails", "steps")


def sequence_length(followups):
    """Total emails in the sequence: the first one plus the follow-ups.

    `followups` describes the follow-ups after the first email (the definition
    endpoint lists it as "how many emails the sequence has and how far apart").
    Three shapes are understood; anything else raises so a human reads the
    payload instead of the tool guessing.
    """
    if isinstance(followups, bool):
        raise ShapeError("followups is a boolean - cannot read a length from it")
    if isinstance(followups, int):
        return followups + 1
    if isinstance(followups, list):
        return len(followups) + 1
    if isinstance(followups, dict):
        for key in COUNT_KEYS:
            if isinstance(followups.get(key), int):
                return followups[key] + 1
        steps = first_of(followups, "items", "steps", "delays", "list", default=None)
        if isinstance(steps, list):
            return len(steps) + 1
    raise ShapeError("cannot read a sequence length from followups={!r}. Add its shape to "
                     "sequence_length() in sequence.py.".format(followups))


def settle_window(followups, override=None):
    """Days after the first email by which the whole sequence has gone out and
    had time to be answered. Explee's field: {"max_touches": 2, "delay_days": 3}
    -> 2 x 3 + 2 = 8 days. A fixed 14 excluded every thread of a two-week-old
    campaign, which is how this function came to exist."""
    if override:
        return override
    try:
        emails = sequence_length(followups)
    except ShapeError:
        return FALLBACK_SETTLED
    delay = None
    if isinstance(followups, dict):
        for key in ("delay_days", "interval_days", "days_between", "gap_days", "delay"):
            if isinstance(followups.get(key), (int, float)):
                delay = followups[key]
                break
    if delay is None:
        return FALLBACK_SETTLED
    return int((emails - 1) * delay + SETTLE_MARGIN)


def shortened(followups, emails):
    """The same field, cut to `emails` total. Refuses to lengthen."""
    current = sequence_length(followups)
    if emails < 1:
        raise ValueError("a sequence has at least one email")
    if emails >= current:
        raise ValueError("sequence is {} emails; {} is not shorter".format(current, emails))
    keep = emails - 1
    if isinstance(followups, int):
        return keep
    if isinstance(followups, list):
        return followups[:keep]
    out = dict(followups)
    for key in COUNT_KEYS:
        if isinstance(out.get(key), int):
            out[key] = keep
            return out
    for key in ("items", "steps", "delays", "list"):
        if isinstance(out.get(key), list):
            out[key] = out[key][:keep]
            return out
    raise ShapeError("cannot shorten followups={!r}".format(followups))


# --- the arithmetic ----------------------------------------------------------
def arithmetic(by_step, current):
    """[{emails, share, sends_ratio, cost_ratio, pool_burn}] for N = 1..current."""
    total = sum(by_step.values())
    rows, seen = [], 0
    for n in range(1, current + 1):
        seen += by_step.get(n, 0)
        share = seen / total if total else 0.0
        sends_ratio = n / current
        rows.append({"emails": n, "share": share, "sends_ratio": sends_ratio,
                     "cost_ratio": (sends_ratio / share) if share else float("inf"),
                     "pool_burn": current / n})
    return rows


def recommend(tally, current, min_gain=MIN_GAIN):
    """-> (emails or None, basis, rows, why)."""
    positives = sum(tally["positive"].values())
    replies = sum(tally["replies"].values())
    if replies < MIN_REPLIES:
        return None, "replies", [], "only {} settled human replies - needs {} before the " \
                                    "step shares mean anything".format(replies, MIN_REPLIES)
    basis = "positive" if positives >= MIN_POSITIVE else "replies"
    rows = arithmetic(tally[basis], current)
    # The shortest length that still keeps MIN_SHARE of the replies. The cheapest
    # per reply is always one email, and it also throws away the most replies per
    # lead while burning the pool fastest - so the share floor is the real gate.
    best = next((r for r in rows if r["share"] >= MIN_SHARE), rows[-1])
    if best["cost_ratio"] > 1 - min_gain or best["emails"] == current:
        return None, basis, rows, "no shorter length keeps {:.0%} of replies and cuts cost " \
                                  "per reply by {:.0%}; the late steps are earning their " \
                                  "sends".format(MIN_SHARE, min_gain)
    return best["emails"], basis, rows, "{} emails: {:.0%} of {} replies arrive by then, " \
                                        "cost per reply -{:.0%}, pool burns {:.1f}x faster" \
                                        .format(best["emails"], best["share"], basis,
                                                1 - best["cost_ratio"], best["pool_burn"])


# --- output ------------------------------------------------------------------
def print_report(name, cid, current, tally, out=sys.stdout, followups=None, settled=None):
    print("\n== {} ({}) - {} emails in the sequence (followups={}), settled after {}d".format(
        name, cid, current, json.dumps(followups), settled), file=out)
    steps = sorted(set(tally["replies"]) | set(tally["positive"]) | set(range(1, current + 1)))
    print("  {:<6}{:>9}{:>11}{:>12}".format("step", "replies", "positive", "cum. share"),
          file=out)
    total, seen = sum(tally["replies"].values()), 0
    for step in steps:
        seen += tally["replies"].get(step, 0)
        print("  {:<6}{:>9}{:>11}{:>12}".format(
            step, tally["replies"].get(step, 0), tally["positive"].get(step, 0),
            "{:.0%}".format(seen / total) if total else "-"), file=out)
    print("  left out: {} auto-replies, {} threads younger than the settle window, "
          "{} without a step".format(tally["auto"], tally["young"], tally["no_step"]), file=out)
    if tally["unknown_age"]:
        print("  !! {} threads carry no timestamp and were counted regardless".format(
            tally["unknown_age"]), file=out)

    pick, basis, rows, why = recommend(tally, current)
    if rows:
        print("\n  {:<8}{:>12}{:>14}{:>16}{:>12}".format(
            "emails", "share", "sends/lead", "cost per reply", "pool burn"), file=out)
        for row in rows:
            print("  {:<8}{:>12}{:>14}{:>16}{:>12}".format(
                row["emails"], "{:.0%}".format(row["share"]),
                "{:.0%}".format(row["sends_ratio"]),
                "{:+.0%}".format(row["cost_ratio"] - 1) if row["cost_ratio"] != float("inf")
                else "-", "{:.1f}x".format(row["pool_burn"])), file=out)
        print("  (basis: {} replies)".format(basis), file=out)
    print("  -> {}".format(("SHORTEN to {} - ".format(pick) if pick else "KEEP - ") + why),
          file=out)
    return pick


# --- commands ----------------------------------------------------------------
def default_project():
    for path in [HERE / "config.json"] + sorted((HERE / "projects").glob("*.json")):
        if path.exists():
            pid = json.loads(path.read_text()).get("project_id")
            if pid:
                return pid
    return None


def campaigns_for(api, args):
    if args.campaign:
        return [{"id": c} for c in args.campaign]
    project = args.project or default_project()
    return api.campaigns(project_id=project)


def measure_campaign(api, cid, now, settled_days, out=sys.stdout):
    definition = api.campaign(cid)
    name = first_of(definition, "name", default=cid)
    followups = first_of(definition, "followups", "follow_ups", "sequence")
    current = sequence_length(followups)
    settled_days = settle_window(followups, settled_days)
    threads = []
    for row in api.inbox_all(cid, tab="replied"):
        pid = first_of(row, "person_id", "id", "lead_id")
        try:
            threads.append(api.thread(cid, pid))
        except (ShapeError, ExpleeError) as err:
            print("  !! {}: {}".format(pid, err), file=out)
    tally = tally_steps(threads, now, settled_days)
    pick = print_report(name, cid, current, tally, out=out, followups=followups,
                        settled=settled_days)
    _, _, _, why = recommend(tally, current)
    return {"campaign_id": cid, "name": name, "emails": current, "followups": followups,
            "settled_days": settled_days, "tally": tally, "recommend": pick, "why": why}


def cmd_measure(args):
    api = Explee()
    require_balance(api)
    now = dt.datetime.now(dt.timezone.utc)
    results = []
    for campaign in campaigns_for(api, args):
        cid = first_of(campaign, "id", "campaign_id")
        try:
            results.append(measure_campaign(api, cid, now, args.settled_days))
        except (ShapeError, ExpleeError) as err:
            print("\n== {}: {}".format(cid, err))
    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=1, default=str))
        print("\n-> {}".format(args.out))
    picks = [r for r in results if r["recommend"]]
    state.record("measure", "{} campaigns measured; {}".format(
        len(results), ("shorten " + ", ".join("{} to {}".format(r["name"], r["recommend"])
                                              for r in picks)) if picks else "keep every sequence"),
                 False, section="measure", now=now, balance=api.last_balance,
                 payload={"campaigns": results})
    if picks:
        print("\nTo apply: " + "  ".join(
            "python3 sequence.py shorten --campaign {} --emails {} --apply".format(
                r["campaign_id"], r["recommend"]) for r in picks))
    return 0


def cmd_shorten(args):
    api = Explee()
    require_balance(api)
    now = dt.datetime.now(dt.timezone.utc)
    measured = measure_campaign(api, args.campaign, now, args.settled_days)
    current = measured["emails"]
    if args.emails >= current:
        raise SystemExit("the sequence is {} emails; {} is not shorter. Nothing to do."
                         .format(current, args.emails))
    if not args.force:
        _, basis, rows, _ = recommend(measured["tally"], current)
        row = next((r for r in rows if r["emails"] == args.emails), None)
        if row is None:
            raise SystemExit("not enough settled replies to justify a change. Wait, or "
                             "--force if you have a reason the data does not show.")
        if row["cost_ratio"] > 1 - MIN_GAIN:
            raise SystemExit("at {} emails cost per {} reply moves {:+.0%} - under the {:.0%} "
                             "bar. Not shortening. --force overrides.".format(
                                 args.emails, basis, row["cost_ratio"] - 1, MIN_GAIN))
    patch = {"followups": shortened(measured["followups"], args.emails)}
    print("\nPATCH /public/api/v1/autogtm/campaigns/{}\n{}".format(
        args.campaign, json.dumps(patch, indent=1)))
    if not args.apply:
        print("DRY RUN - nothing changed. Add --apply.")
        state.record("shorten", "campaign {} ({}): would go {} -> {} emails".format(
            args.campaign, measured["name"], current, args.emails), False, now=now,
            balance=api.last_balance)
        return 0
    got = api.update_campaign(args.campaign, patch)
    after = sequence_length(first_of(got, "followups", "follow_ups", "sequence"))
    print("done: the sequence is now {} emails (was {}). Emails already sent are not "
          "affected; the leads still to come get the shorter one.".format(after, current))
    state.record("shorten", "campaign {} ({}): {} -> {} emails".format(
        args.campaign, measured["name"], current, after), True, now=now,
        balance=api.last_balance)
    return 0


def require_balance(api):
    balance = api.balance()
    api.last_balance = balance
    if balance <= 0:
        state.record("measure", "balance is {} credits - nothing ran".format(balance), False,
                     balance=balance)
        raise SystemExit("balance is {} credits - every request needs a positive balance, "
                         "free ones included. Top up at https://explee.com/billing".format(
                             balance))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    meas = sub.add_parser("measure", help="replies by step, and what shortening would do")
    meas.add_argument("--campaign", type=int, action="append")
    meas.add_argument("--project", type=int)
    meas.add_argument("--settled-days", type=int, default=SETTLED_DAYS)
    meas.add_argument("--out", help="write the measurements as JSON")
    meas.set_defaults(func=cmd_measure)

    cut = sub.add_parser("shorten", help="cut one campaign's sequence to N emails")
    cut.add_argument("--campaign", type=int, required=True)
    cut.add_argument("--emails", type=int, required=True, help="total emails, first one included")
    cut.add_argument("--settled-days", type=int, default=SETTLED_DAYS)
    cut.add_argument("--force", action="store_true", help="skip the measurement gate")
    cut.add_argument("--apply", action="store_true", help="actually PATCH. Off by default.")
    cut.set_defaults(func=cmd_shorten)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ExpleeError as exc:
        print("HTTP {} {}\n{}".format(exc.status, exc.path, exc.body), file=sys.stderr)
        sys.exit(1)
