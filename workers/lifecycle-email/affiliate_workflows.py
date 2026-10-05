#!/usr/bin/env python3
"""Affiliate invite campaigns (13, 14) as workflows-create payloads.

    python3 affiliate_workflows.py        # writes build/13_*.json, build/14_*.json

Why: the referral program was invisible. Since v2 went live nobody had been
attributed, 329 of 361 people dismissed the old toast (it went to every free
signup), and no email had ever mentioned it. These two go only to people with
something to recommend:

  13. Paying customers - on a payment or renewal, 5 days later.
  14. Active free users - after their 3rd successful enrichment, a day later.

Both: email 1, then wait up to 7 days for the referral modal to open or the
link to be copied, then one reminder, then stop for 90 days. Opening the modal
from the email (?action=refer) or copying the link exits the sequence.

Terms in the copy (30% for 12 months, $50 minimum, 30-day hold, PayPal) must
match workers/referral/worker.js. Copy lives here, not in variants.json, so the
Monday optimisation loop does not start A/B-ing a money promise.
"""
import json
from pathlib import Path

from route_workflows import email_action, ev, wait_events, PERSON_FILTERS, OUT

APP = "https://linkfinderai.com/app?action=refer&utm_source=posthog&utm_medium=email&utm_campaign="
TERMS = ("How it works: they sign up through your link and pay, you earn 30% of every payment "
         "they make for their first 12 months. Paid monthly by PayPal once you&rsquo;re owed $50, "
         "after a 30-day refund window. No cap, no limit on how many people.")

PAYING_1 = {
    "subject": "30% of what they pay, for a year",
    "preheader": "If LinkFinder saves you time, it will save your peers time too.",
    "body": [
        "Hi &mdash; Eliasse here, I built LinkFinder.",
        "Thanks for being a customer. Quick one: if you know someone doing outbound, recruiting or RevOps "
        "who would use this, you can earn <strong>30% of everything they pay us for their first 12 months</strong>.",
        "Your link is already set up in the app. Send it to a colleague, drop it in a Slack group, a newsletter or a tool list.",
    ],
    "cta": "Get your link",
    "url": APP + "affiliate_paying_1",
    "after": [
        TERMS,
        "If you run an agency: one client on the $99 plan is about $356 to you over the year.",
        "&mdash; Eliasse",
    ],
    "reason": "you are a LinkFinder AI customer",
}
PAYING_2 = {
    "subject": "who on your team still finds emails by hand?",
    "preheader": "Last note on this, then I will leave it.",
    "body": [
        "Hi &mdash; one more on this, then I will stop.",
        "The people who earn most from our affiliate program are not influencers. They are agency owners "
        "who set LinkFinder up for clients, and sales leads who share it with their team.",
        "Every person you refer earns you 30% of what they pay for 12 months. Your link is one click away:",
    ],
    "cta": "Copy my link",
    "url": APP + "affiliate_paying_2",
    "after": ["Not for you? No problem, this is the last email about it.", "&mdash; Eliasse"],
    "reason": "you are a LinkFinder AI customer",
}
ACTIVE_1 = {
    "subject": "you have run a few lookups - want to earn from them?",
    "preheader": "30% of what anyone you refer pays, for a full year.",
    "body": [
        "Hi &mdash; Eliasse here, I built LinkFinder.",
        "You have been using LinkFinder for a bit, so here is something most people do not know: if you share it, "
        "you earn <strong>30% of everything the people you refer pay us for their first 12 months</strong>.",
        "Your link is already waiting in the app.",
    ],
    "cta": "Get your link",
    "url": APP + "affiliate_active_1",
    "after": [TERMS, "Referring your own second account does not count.", "&mdash; Eliasse"],
    "reason": "you have been using LinkFinder AI",
}
ACTIVE_2 = dict(PAYING_2, url=APP + "affiliate_active_2", reason="you have been using LinkFinder AI")

EXIT_EVENTS = ["referral_link_copied", "referral_modal_opened", "affiliate_email_landed"]


def workflow(name, description, trigger_label, trigger_filters, first_wait, e1, e2):
    return {
        "name": name,
        "description": description,
        "status": "draft",
        # Once per person per 90 days.
        "trigger_masking": {"hash": "{person.id}", "ttl": 7776000},
        "conversion": {"events": [{"filters": {"events": [ev(g)], "source": "events"}} for g in EXIT_EVENTS],
                       "filters": [], "window": "14d"},
        "exit_condition": "exit_on_conversion",
        "actions": [
            {"id": "trigger_1", "name": trigger_label, "description": "", "on_error": None, "filters": None,
             "type": "trigger", "config": {"type": "event", "filters": trigger_filters}, "output_variable": None},
            {"id": "delay_1", "name": "Wait " + first_wait, "description": "", "on_error": None, "filters": None,
             "type": "delay", "config": {"delay_duration": first_wait}, "output_variable": None},
            email_action("email_1", "Email 1 - the offer", e1),
            {"id": "wait_7d", "name": "Wait up to 7 days for the link", "description": "", "on_error": None, "filters": None,
             "type": "wait_until_condition",
             "config": {"events": wait_events(EXIT_EVENTS), "condition": {"filters": None}, "max_wait_duration": "7d"},
             "output_variable": None},
            email_action("email_2", "Email 2 - last reminder", e2),
            {"id": "exit_1", "name": "Exit", "description": "", "on_error": None, "filters": None,
             "type": "exit", "config": {"reason": "Sequence complete"}, "output_variable": None},
        ],
        "edges": [
            {"from": "trigger_1", "to": "delay_1", "type": "continue"},
            {"from": "delay_1", "to": "email_1", "type": "continue"},
            {"from": "email_1", "to": "wait_7d", "type": "continue"},
            {"from": "wait_7d", "to": "exit_1", "type": "branch", "index": 0},
            {"from": "wait_7d", "to": "email_2", "type": "continue"},
            {"from": "email_2", "to": "exit_1", "type": "continue"},
        ],
    }


def paying():
    # Paid customers: their address took a payment, so the email_verified /
    # Google-only guard (docs/email-verified-is-wrong.md) is not needed here.
    filters = {"source": "events",
               "events": [ev("checkout_payment_success"), ev("subscription_renewed")],
               "properties": [{"key": "email", "type": "person", "value": "is_set", "operator": "is_set"}]}
    return workflow(
        "13. Affiliate invite - paying customers",
        "On a payment or renewal, wait 5 days (they have used it), then invite them to the affiliate program "
        "(30% for 12 months). One reminder 7 days later unless they opened the referral modal or copied the link. "
        "Once per person per 90 days. Terms must match workers/referral/worker.js.",
        "Paid or renewed", filters, "5d", PAYING_1, PAYING_2)


def active():
    filters = {"source": "events",
               "events": [ev("enrichment_milestone", [{"key": "count", "type": "event", "value": 3, "operator": "exact"}])],
               "properties": PERSON_FILTERS}
    return workflow(
        "14. Affiliate invite - active free users (3rd enrichment)",
        "After the 3rd successful enrichment, wait 1 day, then invite to the affiliate program (30% for 12 months). "
        "One reminder 7 days later unless they opened the referral modal or copied the link. Same audience guard as "
        "the other lifecycle mails (Google signups, not email_verified=false). Once per person per 90 days.",
        "3rd enrichment", filters, "1d", ACTIVE_1, ACTIVE_2)


def main():
    OUT.mkdir(exist_ok=True)
    for key, wf in (("13_affiliate_paying", paying()), ("14_affiliate_active", active())):
        (OUT / (key + ".json")).write_text(json.dumps(wf, indent=1))
        print("wrote", OUT / (key + ".json"))


if __name__ == "__main__":
    main()
