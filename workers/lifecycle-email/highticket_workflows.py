#!/usr/bin/env python3
"""The three high-ticket workflows (13-15), as workflows-create payloads.

    python3 highticket_workflows.py              # writes build/<key>.json
    python3 highticket_workflows.py --print ent_volume

Shape only -- copy lives in variants.json, and the email skeleton, the design
JSON and the plaintext rendering are all reused from route_workflows so
build_email.py can swap variants on these exactly as it does on the other
twelve. Reasoning for the whole motion: docs/sales-led-motion.md.

WHY THESE THREE TRIGGERS AND NOT SOMETHING SMARTER
--------------------------------------------------
PostHog workflow triggers cannot express "did event X at least N times in the
last M days", so an audience has to be a single observable event plus property
filters, or a cohort. And there is no `plan` person property in this project --
checked against the person schema, it does not exist -- so "is on the top plan"
is not filterable either.

What IS observable is `checkout_redirect_started.plan_key`, whose values are
starter_monthly / pro_monthly / pro_annual / enterprise_monthly /
enterprise_annual / payg_small / payg_medium / payg_large. Two of those are
worth an email each:

  * enterprise_monthly | enterprise_annual -- someone picked the largest
    self-serve plan on the page. That is the closest observable proxy for
    volume there is, and volume is the whole Enterprise qualification.
    (`enterprise_*` is the plan the pricing page now DISPLAYS as Scale -- the
    key never changed. See docs/sales-led-motion.md.)

  * payg_medium | payg_large -- a credit pack. Pair it with 21 days of no
    `enrich_started` and you have the segment docs/dfy-activation-campaign.md
    identified as the strongest qualification on the site: 67 accounts,
    median 10,000 idle credits, paid to solve the problem and never solved it.

The third is `api_first_call_succeeded`: an integration that ran, not one that
was read about. docs/next-step-routing.md measured CSV+API users converting at
19.2% against 0.14% for UI-only, and an integration in production is what makes
an SLA worth paying for.

Every one exits on `sales_lead_submitted`, which is fired by /talk-to-sales, so
nobody who books ever receives the follow-up.

NOT DONE HERE, ON PURPOSE
-------------------------
Nothing is aimed at the SEO tool-page traffic. docs/traffic-capture-verdict.md
measured that audience -- `/linkedin-email-finder`,
`/linkedin-phone-number-finder`, `/instagram-profile-url-finder` -- and it is
defined by wanting to do the lookup itself, cheaply. Mailing it a $999/month
offer scales a wrong-audience problem instead of fixing a monetisation one.
"""

import argparse
import json
import sys
from pathlib import Path

import route_workflows as rw

HERE = Path(__file__).resolve().parent
LIBRARY = HERE / "variants.json"
OUT = HERE / "build"

# The Scale plan's keys. `enterprise_*` is the DISPLAY-renamed tier, not the
# sales-led one -- the sales-led tier has no checkout and so no plan_key at all.
SCALE_PLAN_KEYS = ["enterprise_monthly", "enterprise_annual"]
# payg_small is $25 / 1,000 credits: too small to be worth a service call.
PACK_PLAN_KEYS = ["payg_medium", "payg_large"]

GOAL = "sales_lead_submitted"

# route_workflows.PERSON_FILTERS narrows to `signup_method = google`, because
# `email_verified` is backfilled and untrustworthy (docs/email-verified-is-wrong.md)
# and a Google signup is the only address that project can prove is real.
#
# These three do NOT inherit that, on purpose. Every one of them triggers on an
# act that verifies the address far better than a signup method does: a Dodo
# checkout (the card and the receipt both went somewhere real) or a successful
# authenticated API call. Keeping the google-only guard here would silently
# exclude most of the paying base from the only emails aimed at the paying base
# -- which is the opposite of the guard's purpose. Widened deliberately, which
# is what that file asks for.
HIGH_TICKET_PERSON_FILTERS = []

# `sales_lead_submitted` has never fired: it is captured by talk-to-sales.html,
# which ships with this change. Until that page is live the conversion goal
# simply never matches, which is the correct behaviour and not a misconfiguration.


def plan_key_filter(keys):
    return [{"key": "plan_key", "type": "event", "value": keys, "operator": "exact"}]


def conversion(events, window_minutes):
    return {
        "events": [{"filters": {"events": [rw.ev(e)], "source": "events"}} for e in events],
        "filters": [],
        "window_minutes": window_minutes,
    }


def trigger(node_name, events, properties=None):
    filters = {"source": "events", "events": events,
               "properties": properties if properties is not None else HIGH_TICKET_PERSON_FILTERS}
    return {"id": "trigger_1", "name": node_name, "description": "", "on_error": None,
            "filters": None, "type": "trigger", "config": {"type": "event", "filters": filters},
            "output_variable": None}


def delay(node_id, name, duration):
    return {"id": node_id, "name": name, "description": "", "on_error": None, "filters": None,
            "type": "delay", "config": {"delay_duration": duration}, "output_variable": None}


def wait_for(node_id, name, events, duration):
    return {"id": node_id, "name": name, "description": "", "on_error": None, "filters": None,
            "type": "wait_until_condition",
            "config": {"events": rw.wait_events(events), "condition": {"filters": None},
                       "max_wait_duration": duration},
            "output_variable": None}


def exit_node():
    return {"id": "exit_1", "name": "Exit", "description": "", "on_error": None, "filters": None,
            "type": "exit", "config": {"reason": "Sequence complete"}, "output_variable": None}


# ------------------------------------------------------------ 13. volume
def ent_volume_workflow(library):
    v = rw.champion(library, "enterprise_volume")
    return {
        "name": "13. Picked the biggest plan — the tier above it isn't on the page",
        "description": (
            "Fires when someone starts checkout on Scale (plan_key enterprise_monthly or "
            "enterprise_annual), waits 14 days, then tells them there is a contracted tier above "
            "the pricing page. Picking the top listed plan is the only observable volume signal in "
            "this project -- there is no plan person-property to filter on. Exits on "
            "sales_lead_submitted, so nobody who books gets it. Once per person per 90 days."
        ),
        "status": "draft",
        "trigger_masking": {"hash": "{person.id}", "ttl": 7776000},
        "conversion": conversion([GOAL], 43200),
        "exit_condition": "exit_on_conversion",
        "actions": [
            trigger("Started checkout on Scale", [rw.ev("checkout_redirect_started", plan_key_filter(SCALE_PLAN_KEYS))]),
            delay("delay_14d", "Wait 14 days", "14d"),
            rw.email_action("email_enterprise_volume", "Email — there's a tier above the pricing page", v),
            exit_node(),
        ],
        "edges": [
            {"from": "trigger_1", "to": "delay_14d", "type": "continue"},
            {"from": "delay_14d", "to": "email_enterprise_volume", "type": "continue"},
            {"from": "email_enterprise_volume", "to": "exit_1", "type": "continue"},
        ],
    }


# ------------------------------------------------------------ 14. api
def ent_api_workflow(library):
    v = rw.champion(library, "enterprise_api")
    return {
        "name": "14. API call succeeded — production without an SLA",
        "description": (
            "Fires on api_first_call_succeeded: the integration ran, it was not just read about. "
            "Waits 7 days so it lands after the thing is actually wired in, then sells the SLA and "
            "the rate limits rather than the credits. CSV+API users convert at 19.2% against 0.14% "
            "for UI-only (docs/next-step-routing.md). Exits on sales_lead_submitted. "
            "Once per person per 90 days."
        ),
        "status": "draft",
        "trigger_masking": {"hash": "{person.id}", "ttl": 7776000},
        "conversion": conversion([GOAL], 43200),
        "exit_condition": "exit_on_conversion",
        "actions": [
            trigger("First successful API call", [rw.ev("api_first_call_succeeded")]),
            delay("delay_7d", "Wait 7 days", "7d"),
            rw.email_action("email_enterprise_api", "Email — your integration is in production", v),
            exit_node(),
        ],
        "edges": [
            {"from": "trigger_1", "to": "delay_7d", "type": "continue"},
            {"from": "delay_7d", "to": "email_enterprise_api", "type": "continue"},
            {"from": "email_enterprise_api", "to": "exit_1", "type": "continue"},
        ],
    }


# ------------------------------------------------------------ 15. idle pack
def dfy_idle_workflow(library):
    v = rw.champion(library, "dfy_idle_pack")
    return {
        "name": "15. Bought credits, never ran anything — done-for-you",
        "description": (
            "Fires on a credit-pack checkout (payg_medium or payg_large; payg_small at $25 is too "
            "small to be worth a service call), waits 21 days for a single enrich_started, and "
            "writes only if there was none. 67 accounts matched this on 2026-08-31, median balance "
            "10,000 credits -- the strongest qualification on the site, because they paid to solve "
            "the problem and then did not solve it. See docs/dfy-activation-campaign.md before "
            "quoting any account number. Anyone who runs anything exits before the send. "
            "Once per person per 90 days."
        ),
        "status": "draft",
        "trigger_masking": {"hash": "{person.id}", "ttl": 7776000},
        # Two ways out: they used it (so the service is the wrong pitch), or they
        # booked the call (so the sequence worked).
        "conversion": conversion(["enrich_started", GOAL], 43200),
        "exit_condition": "exit_on_conversion",
        "actions": [
            trigger("Bought a credit pack", [rw.ev("checkout_redirect_started", plan_key_filter(PACK_PLAN_KEYS))]),
            wait_for("wait_21d", "Wait 21 days for any lookup", ["enrich_started"], "21d"),
            rw.email_action("email_dfy_idle_pack", "Email — you bought credits and never used them", v),
            exit_node(),
        ],
        "edges": [
            {"from": "trigger_1", "to": "wait_21d", "type": "continue"},
            # The person ran something: resolved wait -> straight out, no email.
            {"from": "wait_21d", "to": "exit_1", "type": "branch", "index": 0},
            # 21 days elapsed with nothing: the timeout falls through here.
            {"from": "wait_21d", "to": "email_dfy_idle_pack", "type": "continue"},
            {"from": "email_dfy_idle_pack", "to": "exit_1", "type": "continue"},
        ],
    }


BUILDERS = {
    "ent_volume": ent_volume_workflow,
    "ent_api": ent_api_workflow,
    "dfy_idle": dfy_idle_workflow,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", metavar="KEY", help="print one payload (%s)" % "|".join(BUILDERS))
    args = ap.parse_args()
    library = json.loads(LIBRARY.read_text())
    payloads = {k: fn(library) for k, fn in BUILDERS.items()}
    if args.print:
        print(json.dumps(payloads[args.print], ensure_ascii=False))
        return
    OUT.mkdir(exist_ok=True)
    for key, payload in payloads.items():
        (OUT / (key + ".json")).write_text(json.dumps(payload, ensure_ascii=False, indent=1))
        print("wrote build/%s.json  (%d bytes, %d actions)" % (key, len(json.dumps(payload)), len(payload["actions"])))


if __name__ == "__main__":
    main()
