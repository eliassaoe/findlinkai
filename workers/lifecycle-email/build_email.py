#!/usr/bin/env python3
"""Turn one entry in variants.json into the exact payload workflows-patch-action-email wants.

    python3 build_email.py welcome welcome-question       # one variant
    python3 build_email.py --champions                    # every live champion
    python3 build_email.py --list welcome                 # what is queued on a step

The weekly job (optimise.md) never writes HTML. It picks a variant id, runs this,
and passes the printed JSON straight through to the MCP tool. That is the whole
point: copy is reviewable in git, and the thing that reaches PostHog is generated.

Every one of the seven live emails was authored from the same four-row skeleton,
and PostHog kept the ids I gave it, so the block addresses below are constants:

    row-1 / col-1 / text-1     the message
    row-2 / col-2 / button-1   the single call to action
    row-3 / col-3 / text-2     what comes after it
    row-4 / col-4 / text-3     grey footer, reason-for-receipt + unsubscribe

Because the block *count* never changes between variants - only the HTML inside
three of them - a variant swap is three update_content ops and a subject change.
No rows are added or removed, so nothing can drift structurally.
"""

import argparse
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIBRARY = HERE / "variants.json"

# Unlayer block ids, identical across all seven steps.
BODY_BLOCK = "text-1"
BUTTON_BLOCK = "button-1"
AFTER_BLOCK = "text-2"
FOOTER_BLOCK = "text-3"

PARA = '<p style="line-height:1.6">{}</p>'
FOOTER = (
    '<p style="font-size:12px;color:#6b7280;line-height:1.6">'
    "LinkFinder AI &middot; you are getting this because {reason}.<br />"
    '<a href="{{{{ unsubscribe_url }}}}" style="color:#6b7280">Unsubscribe</a></p>'
)
BUTTON_TEXT = '<span style="font-size:15px;font-weight:600">{}</span>'

# Gmail and Outlook render the entities fine; the plain-text part must not carry
# them, and some clients mangle raw unicode punctuation in text/plain.
ASCII = {
    "—": " - ", "–": "-", "’": "'", "‘": "'",
    "“": '"', "”": '"', "•": "*", " ": " ", "…": "...",
}


def to_plain(fragment):
    """HTML fragment -> one line of text/plain, entities and tags resolved."""
    text = re.sub(r"<br\s*/?>", " ", fragment)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    for uni, plain in ASCII.items():
        text = text.replace(uni, plain)
    return re.sub(r"\s+", " ", text).strip()


def plaintext(variant):
    """The text/plain alternative. Gmail's spam filter counts a missing one against you."""
    parts = [to_plain(p) for p in variant["body"]]
    parts.append("{}: {}".format(to_plain(variant["cta"]), variant["url"]))
    parts.extend(to_plain(p) for p in variant["after"])
    parts.append("Unsubscribe: {{ unsubscribe_url }}")
    return " ".join(p for p in parts if p)


def build(step_key, variant, step):
    """-> the argument object for workflows-patch-action-email, ready to send."""
    return {
        "id": step["workflow_id"],
        "action_id": step["action_id"],
        "operations": [
            {
                "op": "update_content",
                "id": BODY_BLOCK,
                "patch": {"values": {"text": "".join(PARA.format(p) for p in variant["body"])}},
            },
            {
                "op": "update_content",
                "id": BUTTON_BLOCK,
                "patch": {
                    "values": {
                        "text": BUTTON_TEXT.format(variant["cta"]),
                        "href": {"name": "web", "values": {"href": variant["url"], "target": "_blank"}},
                    }
                },
            },
            {
                "op": "update_content",
                "id": AFTER_BLOCK,
                "patch": {"values": {"text": "".join(PARA.format(p) for p in variant["after"])}},
            },
            {
                "op": "update_content",
                "id": FOOTER_BLOCK,
                "patch": {"values": {"text": FOOTER.format(reason=variant["reason"])}},
            },
            # The preheader is stored twice - once on the email, once on the design,
            # which is what actually renders into the hidden preview span. Both move.
            {"op": "update_body", "patch": {"values": {"preheaderText": variant["preheader"]}}},
        ],
        "email_patch": {
            "subject": variant["subject"],
            "preheader": variant["preheader"],
            "text": plaintext(variant),
        },
        # Not sent to PostHog - carried so the job can log what it did.
        "_meta": {
            "step": step_key,
            "variant": variant["id"],
            "angle": variant["angle"],
            "hypothesis": variant["hypothesis"],
            "goal_event": step["goal_event"],
        },
    }


def load():
    return json.loads(LIBRARY.read_text())


def find(library, step_key, variant_id):
    if step_key not in library["steps"]:
        sys.exit("no such step: {} (have: {})".format(step_key, ", ".join(library["steps"])))
    step = library["steps"][step_key]
    for variant in step["variants"]:
        if variant["id"] == variant_id:
            return step, variant
    sys.exit(
        "no variant {!r} on step {!r} (have: {})".format(
            variant_id, step_key, ", ".join(v["id"] for v in step["variants"])
        )
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", nargs="?", help="step key, e.g. welcome")
    ap.add_argument("variant", nargs="?", help="variant id, e.g. welcome-question")
    ap.add_argument("--champions", action="store_true", help="build every step's current champion")
    ap.add_argument("--list", metavar="STEP", help="show a step's variants and their status")
    args = ap.parse_args()

    library = load()

    if args.list:
        step = library["steps"].get(args.list) or sys.exit("no such step: " + args.list)
        print("{}  ->  {} ({})".format(args.list, step["goal_event"], step["audience"]))
        for v in step["variants"]:
            print("  {:<10} {:<9} {:<22} {}".format(v["status"], v["angle"], v["id"], v["subject"]))
        return

    if args.champions:
        out = []
        for key, step in library["steps"].items():
            champion = next(v for v in step["variants"] if v["status"] == "champion")
            out.append(build(key, champion, step))
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return

    if not (args.step and args.variant):
        ap.error("give a step and a variant, or --champions, or --list STEP")

    step, variant = find(library, args.step, args.variant)
    print(json.dumps(build(args.step, variant, step), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
