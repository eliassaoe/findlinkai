#!/usr/bin/env python3
"""The one number, before and after: cost per call that actually showed up.

    python3 baseline.py --project 4021                       # what the API knows
    python3 baseline.py --project 4021 --booked 10 --showed 5 --label 2026-08 --save
    python3 baseline.py --project 4021 --booked 10 --showed 5 --won 2 --revenue 4000
    python3 baseline.py --project 4021 --deal-value 2000     # what a win has to be worth

WHY THE HUMAN NUMBERS ARE ARGUMENTS
-----------------------------------
Explee can tell you what it sent, what replied, what went hot, and what it cost.
It cannot tell you who turned up. A hot lead is a reply that sounded interested;
a call that showed up is a different, smaller number, and it is the only one the
plan is optimising. So booked and showed are typed in from the calendar, stored
next to the spend they belong to, and never inferred.

Do this BEFORE changing anything. The plan's warning is the point of the file:
if half the calls no-show, a $50 cost per call is really $100, and that is worth
knowing before you spend a month improving the wrong number.

AND A CALL IS NOT A RESULT EITHER
---------------------------------
A cheap call selling an $89 subscription still loses money; an expensive one
selling a $2,000 enrichment project does not. So --won and --revenue go in
alongside --booked and --showed, and the last line of the report is revenue per
dollar spent. --deal-value asks the question the other way round: at this cost
per interested lead, how many interested leads does one win have to come out of?
See ECONOMICS.md - that ratio, not cost per call, is what decides the channel.
"""

import argparse
import json
import sys
import time
from pathlib import Path

from explee import Explee, first_of

HISTORY = Path(__file__).resolve().parent / "cost-per-call.json"


def pull(api, project_id, period):
    stats = api.project_analytics(project_id, period=period)
    flat = dict(first_of(stats, "totals", "analytics", "summary", default={}) or {})
    flat.update({k: v for k, v in stats.items() if not isinstance(v, (dict, list))})
    return {
        "sent": int(first_of(flat, "emails_sent", "sent", "emails", default=0)),
        "replies": int(first_of(flat, "replies", "reply_count", "replied", default=0)),
        "hot": int(first_of(flat, "hot_leads", "hot_lead_count", "hot", default=0)),
        "spend": float(first_of(flat, "spend_usd", "spend", "cost_usd", default=0.0)),
    }


def per(spend, count):
    return spend / count if count else None


def breakeven(spend, hot, gross):
    """Interested leads one win has to be worth, for an offer with this gross profit."""
    each = per(spend, hot)
    if not each or not gross:
        return None, None
    return gross / each, each / gross


def money(value):
    return "-" if value is None else "${:.2f}".format(value)


def report(row, out=sys.stdout):
    print("period {}   spend ${:.2f}   sent {}   replies {}   hot {}".format(
        row.get("label", "?"), row["spend"], row["sent"], row["replies"], row["hot"]), file=out)
    print("  per reply     {}".format(money(per(row["spend"], row["replies"]))), file=out)
    print("  per hot lead  {}".format(money(per(row["spend"], row["hot"]))), file=out)
    booked, showed = row.get("booked"), row.get("showed")
    if booked is None:
        print("  per call      unknown - pass --booked and --showed from your calendar",
              file=out)
    else:
        print("  per call BOOKED {}".format(money(per(row["spend"], booked))), file=out)
        print("  per call SHOWED {}   <- the number".format(money(per(row["spend"], showed))),
              file=out)
        if booked and showed is not None:
            no_show = 1 - (showed / booked)
            if no_show >= 0.25:
                print("  {:.0%} of booked calls did not show. The true cost is {} and no amount "
                      "of lead-source work fixes that - confirmations and reminders do.".format(
                          no_show, money(per(row["spend"], showed))), file=out)

    won, revenue = row.get("won"), row.get("revenue")
    if won is None and revenue is None:
        print("  per win       unknown - pass --won and --revenue. A cheap call selling an $89 "
              "subscription still loses money; an expensive one selling a $2,000 project "
              "does not.", file=out)
        return
    if won is not None:
        print("  per WIN       {}".format(money(per(row["spend"], won))), file=out)
    if revenue is None:
        return
    returned = revenue / row["spend"] if row["spend"] else None
    print("  {} spent returned {} - {} per dollar".format(
        money(row["spend"]), money(revenue),
        "-" if returned is None else "${:.2f}".format(returned)), file=out)
    if returned is not None and returned < 1:
        print("  UNDER WATER. The channel is not paying for itself at this offer - the deal "
              "size is too small for the calls it is buying, or the booking rate is. "
              "See ECONOMICS.md.", file=out)


def compare(before, after, out=sys.stdout):
    old, new = per(before["spend"], before.get("showed")), per(after["spend"], after.get("showed"))
    if old is None or new is None:
        print("\nno before/after: both periods need --showed", file=out)
        return
    move = (new - old) / old
    print("\n{} -> {}: {} -> {} ({:+.0%})".format(
        before.get("label"), after.get("label"), money(old), money(new), move), file=out)
    if new <= 50:
        print("under the $50 target.", file=out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--project", type=int, required=True)
    ap.add_argument("--period", help="the API's aggregation window, e.g. month")
    ap.add_argument("--label", default=time.strftime("%Y-%m"))
    ap.add_argument("--booked", type=int, help="calls booked in this period, from your calendar")
    ap.add_argument("--showed", type=int, help="of those, how many turned up")
    ap.add_argument("--won", type=int, help="of those, how many became paying customers")
    ap.add_argument("--revenue", type=float, help="gross revenue from them, USD")
    ap.add_argument("--deal-value", type=float, dest="deal_value",
                    help="gross profit of one win - prints the win rate it needs, and sends nothing")
    ap.add_argument("--save", action="store_true", help="append this period to the history file")
    ap.add_argument("--history", default=str(HISTORY))
    args = ap.parse_args(argv)

    row = pull(Explee(), args.project, args.period)
    row.update({"label": args.label, "booked": args.booked, "showed": args.showed,
                "won": args.won, "revenue": args.revenue,
                "pulled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    report(row)

    if args.deal_value:
        leads, rate = breakeven(row["spend"], row["hot"], args.deal_value)
        if leads is None:
            print("\nno break-even: the period has no hot leads to divide by")
        else:
            print("\nbreak-even on a {} win: 1 per {:.0f} interested leads ({:.2%}). "
                  "At {} of them a period, that is one every {:.1f} periods.".format(
                      money(args.deal_value), leads, rate, row["hot"], leads / row["hot"]))

    path = Path(args.history)
    history = json.loads(path.read_text()) if path.exists() else []
    if args.save:
        history = [h for h in history if h.get("label") != row["label"]] + [row]
        history.sort(key=lambda h: h.get("label", ""))
        path.write_text(json.dumps(history, indent=1))
        print("\nsaved to {}".format(path.name))
    previous = [h for h in history if h.get("label") != row["label"] and h.get("showed")]
    if previous:
        compare(previous[-1], row)
    return 0


if __name__ == "__main__":
    sys.exit(main())
