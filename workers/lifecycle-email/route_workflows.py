#!/usr/bin/env python3
"""The route campaigns (7-10), the idle-credits campaign (11) and the monthly
value receipt (12), as workflows-create payloads.

    python3 route_workflows.py            # writes build/<key>.json, one per workflow
    python3 route_workflows.py --print csv

Why these exist: docs/next-step-routing.md. Someone picks where their data
lives (onboarding_route_picked, route = csv | sheets | api | crm) and the app
lands them there. These are the same routes, one and three days later, for the
people who picked and then did not do the thing. Each one stops the moment the
thing happens (conversion goal), so nobody who uploaded, installed, called or
connected ever gets the second mail.

Campaign 11 is different: a subscriber whose credits are sitting there. It
fires on a renewal or a payment, waits 20 days for a single enrich_started,
and only then writes.

Every email is the same four-row skeleton the other seven use (text-1,
button-1, text-2, text-3), so build_email.py can swap variants on them and the
Monday loop can see them. Copy lives in variants.json; this file only shapes.
"""

import argparse
import html as htmllib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIBRARY = HERE / "variants.json"
OUT = HERE / "build"

FROM = {"name": "Eliasse at LinkFinder", "email": "support@linkfinderai.com", "integrationId": 238896}
# Same audience guard as campaign 6: email_verified is not trustworthy for
# email signups (docs/email-verified-is-wrong.md), so this writes to Google
# signups only. Widen deliberately, not by accident.
PERSON_FILTERS = [
    {"key": "email_verified", "type": "person", "value": ["false"], "operator": "is_not"},
    {"key": "signup_method", "type": "person", "value": ["google"], "operator": "exact"},
]

PARA = '<p style="line-height:1.6">{}</p>'
FOOTER = (
    '<p style="font-size:12px;color:#6b7280;line-height:1.6">'
    "LinkFinder AI &middot; you are getting this because {reason}.<br />"
    '<a href="{{{{ unsubscribe_url }}}}" style="color:#6b7280">Unsubscribe</a></p>'
)
BUTTON_TEXT = '<span style="font-size:15px;font-weight:600">{}</span>'
ASCII = {"—": " - ", "–": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "•": "*", " ": " ", "…": "..."}


def to_plain(fragment):
    text = re.sub(r"<br\s*/?>", " ", fragment)
    text = re.sub(r"<[^>]+>", "", text)
    text = htmllib.unescape(text)
    for uni, plain in ASCII.items():
        text = text.replace(uni, plain)
    return re.sub(r"\s+", " ", text).strip()


def plaintext(v):
    parts = [to_plain(p) for p in v["body"]]
    parts.append("{}: {}".format(to_plain(v["cta"]), v["url"]))
    parts.extend(to_plain(p) for p in v["after"])
    parts.append("Unsubscribe: {{ unsubscribe_url }}")
    return " ".join(p for p in parts if p)


def block_text(v):
    return "".join(PARA.format(p) for p in v["body"])


def block_after(v):
    return "".join(PARA.format(p) for p in v["after"])


def design(v):
    """Unlayer design with the exact block ids build_email.py patches."""
    def row(rid, cid, content, bg="#ffffff"):
        return {
            "id": rid, "cells": [1],
            "values": {"_meta": {"htmlID": "u_" + rid, "htmlClassNames": "u_row"}, "padding": "0px", "backgroundColor": bg},
            "columns": [{"id": cid, "values": {"_meta": {"htmlID": "u_" + cid, "htmlClassNames": "u_column"}, "padding": "0px"}, "contents": [content]}],
        }
    text = lambda tid, html_, pad, n: {"id": tid, "type": "text", "values": {"text": html_, "_meta": {"htmlID": "u_content_text_" + n, "htmlClassNames": "u_content_text"}, "containerPadding": pad}}
    button = {
        "id": "button-1", "type": "button",
        "values": {
            "href": {"name": "web", "values": {"href": v["url"], "target": "_blank"}},
            "size": {"width": "100%", "autoWidth": True},
            "text": BUTTON_TEXT.format(v["cta"]),
            "_meta": {"htmlID": "u_content_button_1", "htmlClassNames": "u_content_button"},
            "padding": "12px 22px", "textAlign": "left", "borderRadius": "8px",
            "buttonColors": {"color": "#ffffff", "hoverColor": "#ffffff", "backgroundColor": "#2563eb", "hoverBackgroundColor": "#1d4ed8"},
            "containerPadding": "8px 28px",
        },
    }
    return {
        "body": {
            "id": "body",
            "rows": [
                row("row-1", "col-1", text("text-1", block_text(v), "28px 28px 8px", "1")),
                row("row-2", "col-2", button),
                row("row-3", "col-3", text("text-2", block_after(v), "8px 28px 28px", "2")),
                row("row-4", "col-4", text("text-3", FOOTER.format(reason=v["reason"]), "16px 28px 24px", "3"), bg="#f9fafb"),
            ],
            "values": {
                "_meta": {"htmlID": "u_body", "htmlClassNames": "u_body"},
                "linkStyle": {"body": True, "linkColor": "#2563eb", "linkUnderline": True, "linkHoverColor": "#1d4ed8", "linkHoverUnderline": True},
                "textColor": "#1f2937", "fontFamily": {"label": "Arial", "value": "arial,helvetica,sans-serif"},
                "contentWidth": "600px", "preheaderText": v["preheader"], "backgroundColor": "#eef2f7",
            },
            "footers": [], "headers": [],
        },
        "counters": {}, "schemaVersion": 16,
    }


def render_html(v):
    """Table email, 600px, the same look as the seven live ones."""
    def cell(inner, pad, bg="#ffffff"):
        return (
            '<tr><td style="background-color:{bg};padding:0;">'
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:arial,helvetica,sans-serif;">'
            '<tr><td align="left" style="padding:{pad};font-size:14px;line-height:140%;color:#1f2937;word-break:break-word;">{inner}</td></tr>'
            "</table></td></tr>"
        ).format(bg=bg, pad=pad, inner=inner)

    button = (
        '<a href="{url}" target="_blank" style="display:inline-block;text-decoration:none;color:#ffffff;background-color:#2563eb;'
        'border-radius:8px;font-size:14px;"><span style="display:block;padding:12px 22px;line-height:120%;">{text}</span></a>'
    ).format(url=v["url"], text=BUTTON_TEXT.format(v["cta"]))

    return (
        "<!DOCTYPE html><html><head>"
        '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        "<title>{subject}</title>"
        "<style>body{{margin:0;padding:0}} table,td{{border-collapse:collapse}} p{{margin:0}} a[x-apple-data-detectors]{{color:inherit!important;text-decoration:none!important}}</style>"
        "</head>"
        '<body style="margin:0;padding:0;background-color:#eef2f7;color:#1f2937;">'
        '<div style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{preheader}</div>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7;"><tr><td align="center" style="padding:0;">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">'
        "{rows}"
        "</table></td></tr></table></body></html>"
    ).format(
        subject=htmllib.escape(v["subject"]),
        preheader=htmllib.escape(v["preheader"]),
        rows=cell(block_text(v), "28px 28px 8px")
        + cell(button, "8px 28px")
        + cell(block_after(v), "8px 28px 28px")
        + cell(FOOTER.format(reason=v["reason"]), "16px 28px 24px", bg="#f9fafb"),
    )


def email_action(aid, name, v):
    return {
        "id": aid, "name": name, "description": "", "on_error": "continue", "filters": None,
        "type": "function_email",
        "config": {
            "template_id": "template-email",
            "inputs": {
                "email": {
                    "order": 0,
                    "value": {
                        "to": {"name": "", "email": "{{ person.properties.email }}"},
                        "from": FROM,
                        "html": render_html(v),
                        "text": plaintext(v),
                        "design": design(v),
                        "subject": v["subject"],
                        "preheader": v["preheader"],
                    },
                    "templating": "liquid",
                }
            },
        },
        "output_variable": None,
    }


def ev(name, props=None):
    e = {"id": name, "name": name, "type": "events"}
    if props:
        e["properties"] = props
    return e


def wait_events(names):
    return [{"name": n, "filters": {"events": [ev(n)], "source": "events"}} for n in names]


def champion(library, step_key):
    step = library["steps"][step_key]
    return next(v for v in step["variants"] if v["status"] == "champion")


def route_workflow(library, route, title, description, goal_events, wait):
    e1 = champion(library, "route_%s_1" % route)
    e2 = champion(library, "route_%s_2" % route)
    trigger_filters = {
        "source": "events",
        "events": [ev("onboarding_route_picked", [{"key": "route", "type": "event", "value": [route], "operator": "exact"}])],
        "properties": PERSON_FILTERS,
    }
    return {
        "name": title,
        "description": description,
        "status": "draft",
        "trigger_masking": {"hash": "{person.id}", "ttl": 2592000},
        "conversion": {"events": [{"filters": {"events": [ev(g)], "source": "events"}} for g in goal_events], "filters": [], "window_minutes": 10080},
        "exit_condition": "exit_on_conversion",
        "actions": [
            {"id": "trigger_1", "name": "Picked the %s route" % route, "description": "", "on_error": None, "filters": None,
             "type": "trigger", "config": {"type": "event", "filters": trigger_filters}, "output_variable": None},
            {"id": "delay_1h", "name": "Wait 1h", "description": "", "on_error": None, "filters": None,
             "type": "delay", "config": {"delay_duration": "1h"}, "output_variable": None},
            email_action("email_1", "Email 1 — how to do it", e1),
            {"id": "wait_3d", "name": "Wait 3 days for the thing to happen", "description": "", "on_error": None, "filters": None,
             "type": "wait_until_condition",
             "config": {"events": wait_events(wait), "condition": {"filters": None}, "max_wait_duration": wait_days(route)},
             "output_variable": None},
            email_action("email_2", "Email 2 — what usually blocks it", e2),
            {"id": "exit_1", "name": "Exit", "description": "", "on_error": None, "filters": None,
             "type": "exit", "config": {"reason": "Sequence complete"}, "output_variable": None},
        ],
        "edges": [
            {"from": "trigger_1", "to": "delay_1h", "type": "continue"},
            {"from": "delay_1h", "to": "email_1", "type": "continue"},
            {"from": "email_1", "to": "wait_3d", "type": "continue"},
            {"from": "wait_3d", "to": "exit_1", "type": "branch", "index": 0},
            {"from": "wait_3d", "to": "email_2", "type": "continue"},
            {"from": "email_2", "to": "exit_1", "type": "continue"},
        ],
    }


def wait_days(route):
    return "3d"


def idle_workflow(library):
    v = champion(library, "idle_credits")
    trigger_filters = {
        "source": "events",
        "events": [ev("subscription_renewed"), ev("checkout_payment_success")],
        "properties": PERSON_FILTERS,
    }
    return {
        "name": "11. Paid, then went quiet — credits sitting there",
        "description": (
            "The number one cancellation reason is 'not using' (21 people) against 5 for price. "
            "Fires on a renewal or a payment, waits 20 days for a single lookup, and writes only if "
            "there was none. Anyone who runs anything exits. Once per person per 30 days."
        ),
        "status": "draft",
        "trigger_masking": {"hash": "{person.id}", "ttl": 2592000},
        "conversion": {"events": [{"filters": {"events": [ev("enrich_started")], "source": "events"}}], "filters": [], "window_minutes": 43200},
        "exit_condition": "exit_on_conversion",
        "actions": [
            {"id": "trigger_1", "name": "Renewed or paid", "description": "", "on_error": None, "filters": None,
             "type": "trigger", "config": {"type": "event", "filters": trigger_filters}, "output_variable": None},
            {"id": "wait_20d", "name": "Wait 20 days for any lookup", "description": "", "on_error": None, "filters": None,
             "type": "wait_until_condition",
             "config": {"events": wait_events(["enrich_started"]), "condition": {"filters": None}, "max_wait_duration": "20d"},
             "output_variable": None},
            email_action("email_idle", "Email — your credits are sitting there", v),
            {"id": "exit_1", "name": "Exit", "description": "", "on_error": None, "filters": None,
             "type": "exit", "config": {"reason": "Sequence complete"}, "output_variable": None},
        ],
        "edges": [
            {"from": "trigger_1", "to": "wait_20d", "type": "continue"},
            {"from": "wait_20d", "to": "exit_1", "type": "branch", "index": 0},
            {"from": "wait_20d", "to": "email_idle", "type": "continue"},
            {"from": "email_idle", "to": "exit_1", "type": "continue"},
        ],
    }


def receipt_workflow(library):
    v = champion(library, "monthly_receipt")
    trigger_filters = {
        "source": "events",
        "events": [ev("monthly_value_receipt")],
        "properties": PERSON_FILTERS,
    }
    return {
        "name": "12. Monthly value receipt — what you found last month",
        "description": (
            "On the 1st, workers/monthly-receipt counts what was FOUND for every account that ran "
            "lookups in the last 30 days (same RPC as the account page's 'What you've found') and "
            "captures monthly_value_receipt with the numbers as properties. This sends that as one "
            "email with a link to the account page and to the history. Nobody gets a receipt for "
            "zero: the worker skips them, and workflow 11 covers the idle case. Once per person per 25 days."
        ),
        "status": "draft",
        "trigger_masking": {"hash": "{person.id}", "ttl": 2160000},
        "exit_condition": "exit_only_at_end",
        "actions": [
            {"id": "trigger_1", "name": "Receipt computed", "description": "", "on_error": None, "filters": None,
             "type": "trigger", "config": {"type": "event", "filters": trigger_filters}, "output_variable": None},
            email_action("email_receipt", "Email — what you found last month", v),
            {"id": "exit_1", "name": "Exit", "description": "", "on_error": None, "filters": None,
             "type": "exit", "config": {"reason": "Sequence complete"}, "output_variable": None},
        ],
        "edges": [
            {"from": "trigger_1", "to": "email_receipt", "type": "continue"},
            {"from": "email_receipt", "to": "exit_1", "type": "continue"},
        ],
    }


ROUTES = {
    "csv": dict(
        title="7. Route: CSV — picked it, never uploaded",
        description="Picked 'In a CSV or spreadsheet' on first visit (or arrived with ?intent=csv) and has not uploaded a file. Email 1 after an hour, email 2 three days later only if still no upload. csv_uploaded exits.",
        goal_events=["csv_uploaded"], wait=["csv_uploaded"],
    ),
    "sheets": dict(
        title="8. Route: Google Sheets — picked it, never opened the add-on",
        description="Picked 'In Google Sheets' and has not clicked through to the Marketplace listing. The install itself is not observable, so the click is the goal. sheets_addon_clicked exits.",
        goal_events=["sheets_addon_clicked"], wait=["sheets_addon_clicked"],
    ),
    "api": dict(
        title="9. Route: API — picked it, no key copied and no call made",
        description="Picked 'In my own code or n8n / Make' and has neither copied a key nor made a successful call. api_key_copied or api_first_call_succeeded exits (the latter is fired by the Run-it-now buttons today and by the API worker once workers/api-first-call is deployed).",
        goal_events=["api_key_copied", "api_first_call_succeeded"], wait=["api_key_copied", "api_first_call_succeeded"],
    ),
    "crm": dict(
        title="10. Route: CRM — picked it, HubSpot never connected",
        description="Picked 'In my CRM (HubSpot)' and has not connected. One connection in 90 days before this: the second email offers the setup call rather than another link. hubspot_connected exits. Never mentions PAYG (CLAUDE.md).",
        goal_events=["hubspot_connected"], wait=["hubspot_connected"],
    ),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", metavar="KEY", help="print one payload (csv|sheets|api|crm|idle|receipt)")
    args = ap.parse_args()
    library = json.loads(LIBRARY.read_text())
    payloads = {r: route_workflow(library, r, **cfg) for r, cfg in ROUTES.items()}
    payloads["idle"] = idle_workflow(library)
    payloads["receipt"] = receipt_workflow(library)
    if args.print:
        print(json.dumps(payloads[args.print], ensure_ascii=False))
        return
    OUT.mkdir(exist_ok=True)
    for key, payload in payloads.items():
        (OUT / (key + ".json")).write_text(json.dumps(payload, ensure_ascii=False, indent=1))
        print("wrote build/%s.json  (%d bytes, %d actions)" % (key, len(json.dumps(payload)), len(payload["actions"])))


if __name__ == "__main__":
    main()
