#!/usr/bin/env python3
"""Emit the workflows-create payload for a new lifecycle email, from a variants.json entry.

    python3 new_email.py retention retention-question > /tmp/payload.json

build_email.py is the *patch* half of this file: it swaps copy into a step that already
exists in PostHog. There was no create half, so every new workflow meant hand-writing the
four-row Unlayer skeleton and hoping the block ids matched. They have to match exactly —
build_email.py addresses text-1 / button-1 / text-2 / text-3 as constants, so a workflow
created with different ids can never be driven by the Monday loop.

This generates that skeleton from the same variant entry build_email.py consumes, so a
step created here is patchable by the loop from its first day.
"""

import json
import sys
from pathlib import Path

import build_email as be

HERE = Path(__file__).resolve().parent

SENDER = {"name": "Eliasse at LinkFinder", "email": "support@linkfinderai.com", "integrationId": 238896}

HEAD = """<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<style type="text/css">
@media only screen and (min-width: 620px) { .u-row { width: 600px !important; } .u-row .u-col { vertical-align: top; } .u-row .u-col-100 { width: 600px !important; } }
@media only screen and (max-width: 620px) { .u-row-container { max-width: 100% !important; padding-left: 0px !important; padding-right: 0px !important; } .u-row { width: 100% !important; } .u-row .u-col { display: block !important; width: 100% !important; min-width: 320px !important; max-width: 100% !important; } .u-row .u-col > div { margin: 0 auto; } }
body{margin:0;padding:0}table,td,tr{border-collapse:collapse;vertical-align:top}p{margin:0}*{line-height:inherit}a[x-apple-data-detectors=true]{color:inherit!important;text-decoration:none!important}
table, td { color: #1f2937; } #u_body a { color: #2563eb; text-decoration: underline; }
</style></head>
<body class="clean-body u_body" style="margin:0;padding:0;-webkit-text-size-adjust:100%;background-color:#eef2f7;color:#1f2937">
<table role="presentation" id="u_body" style="border-collapse:collapse;table-layout:fixed;border-spacing:0;vertical-align:top;min-width:320px;Margin:0 auto;background-color:#eef2f7;width:100%" cellpadding="0" cellspacing="0"><tbody>
<tr><td style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">{preheader}</td></tr>
<tr style="vertical-align:top"><td style="word-break:break-word;border-collapse:collapse !important;vertical-align:top">"""

ROW = """<div class="u-row-container" style="padding:0px;background-color:{bg};">
<div class="u-row" style="margin:0 auto;min-width:320px;max-width:600px;overflow-wrap:break-word;word-break:break-word;background-color:transparent;">
<div style="border-collapse:collapse;display:table;width:100%;height:100%;background-color:transparent;">
<div class="u-col u-col-100" style="max-width:320px;min-width:600px;display:table-cell;vertical-align:top;">
<div style="height:100%;width:100% !important;"><div style="box-sizing:border-box;height:100%;padding:0px;">
<table style="font-family:arial,helvetica,sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0"><tbody><tr>
<td style="overflow-wrap:break-word;word-break:break-word;padding:{pad};font-family:arial,helvetica,sans-serif;" align="left">
{inner}
</td></tr></tbody></table>
</div></div></div></div></div>"""

TEXT_INNER = '<div style="font-size:14px;line-height:140%;text-align:left;word-wrap:break-word;">{}</div>'

BUTTON_INNER = """<div align="left">
<a href="{url}" target="_blank" class="v-button" style="box-sizing:border-box;display:inline-block;text-decoration:none;-webkit-text-size-adjust:none;text-align:center;color:#ffffff;background-color:#2563eb;border-radius:8px;width:auto;max-width:100%;overflow-wrap:break-word;word-break:break-word;font-size:14px;">
<span style="display:block;padding:12px 22px;line-height:120%;">{label}</span></a></div>"""

TAIL = """</td></tr></tbody></table></body></html>"""


def html_for(body_html, cta_html, url, after_html, footer_html, preheader):
    # HEAD carries a raw CSS block, so its braces are not format fields - substitute
    # the one placeholder by hand rather than escaping every rule in the stylesheet.
    return (
        HEAD.replace("{preheader}", preheader)
        + ROW.format(bg="#ffffff", pad="28px 28px 8px", inner=TEXT_INNER.format(body_html))
        + ROW.format(bg="#ffffff", pad="8px 28px", inner=BUTTON_INNER.format(url=url, label=cta_html))
        + ROW.format(bg="#ffffff", pad="8px 28px 28px", inner=TEXT_INNER.format(after_html))
        + ROW.format(bg="#f9fafb", pad="16px 28px 24px", inner=TEXT_INNER.format(footer_html))
        + TAIL
    )


def design_for(body_html, cta_html, url, after_html, footer_html, preheader):
    """The Unlayer document. Block ids MUST match build_email.py's constants."""

    def row(rid, cid, bg, content):
        return {
            "id": rid, "cells": [1],
            "values": {"_meta": {"htmlID": "u_" + rid, "htmlClassNames": "u_row"},
                       "padding": "0px", "backgroundColor": bg},
            "columns": [{"id": cid,
                         "values": {"_meta": {"htmlID": "u_" + cid, "htmlClassNames": "u_column"},
                                    "padding": "0px"},
                         "contents": [content]}],
        }

    def text(bid, html_, pad):
        return {"id": bid, "type": "text",
                "values": {"text": html_,
                           "_meta": {"htmlID": "u_content_" + bid, "htmlClassNames": "u_content_text"},
                           "containerPadding": pad}}

    button = {
        "id": be.BUTTON_BLOCK, "type": "button",
        "values": {
            "href": {"name": "web", "values": {"href": url, "target": "_blank"}},
            "size": {"width": "100%", "autoWidth": True},
            "text": cta_html,
            "_meta": {"htmlID": "u_content_button_1", "htmlClassNames": "u_content_button"},
            "padding": "12px 22px", "textAlign": "left", "borderRadius": "8px",
            "buttonColors": {"color": "#ffffff", "hoverColor": "#ffffff",
                             "backgroundColor": "#2563eb", "hoverBackgroundColor": "#1d4ed8"},
            "containerPadding": "8px 28px",
        },
    }

    return {
        "body": {
            "id": "body",
            "rows": [
                row("row-1", "col-1", "#ffffff", text(be.BODY_BLOCK, body_html, "28px 28px 8px")),
                row("row-2", "col-2", "#ffffff", button),
                row("row-3", "col-3", "#ffffff", text(be.AFTER_BLOCK, after_html, "8px 28px 28px")),
                row("row-4", "col-4", "#f9fafb", text(be.FOOTER_BLOCK, footer_html, "16px 28px 24px")),
            ],
            "values": {
                "_meta": {"htmlID": "u_body", "htmlClassNames": "u_body"},
                "linkStyle": {"body": True, "linkColor": "#2563eb", "linkUnderline": True,
                              "linkHoverColor": "#1d4ed8", "linkHoverUnderline": True},
                "textColor": "#1f2937",
                "fontFamily": {"label": "Arial", "value": "arial,helvetica,sans-serif"},
                "contentWidth": "600px", "preheaderText": preheader, "backgroundColor": "#eef2f7",
            },
            "footers": [], "headers": [],
        },
        "counters": {}, "schemaVersion": 16,
    }


def email_config(variant):
    body_html = "".join(be.PARA.format(p) for p in variant["body"])
    after_html = "".join(be.PARA.format(p) for p in variant["after"])
    footer_html = be.FOOTER.format(reason=variant["reason"])
    cta_html = be.BUTTON_TEXT.format(variant["cta"])
    url, pre = variant["url"], variant["preheader"]
    return {
        "to": {"name": "", "email": "{{ person.properties.email }}"},
        "from": SENDER,
        "subject": variant["subject"],
        "preheader": pre,
        "text": be.plaintext(variant),
        "html": html_for(body_html, cta_html, url, after_html, footer_html, pre),
        "design": design_for(body_html, cta_html, url, after_html, footer_html, pre),
    }


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    step_key, variant_id = sys.argv[1], sys.argv[2]
    library = be.load()
    step, variant = be.find(library, step_key, variant_id)
    print(json.dumps({
        "email": email_config(variant),
        "_meta": {"step": step_key, "variant": variant["id"], "angle": variant["angle"],
                  "goal_event": step.get("goal_event")},
    }, indent=2))


if __name__ == "__main__":
    main()
