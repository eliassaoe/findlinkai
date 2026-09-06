#!/usr/bin/env python3
"""Render reports/state.json into the private status page on linkfinderai.com.

    python3 report_page.py            # print the HTML
    python3 report_page.py --write    # write ../../autogtm-report.html (repo root)

The page is one static file: no script, no fetch, no login. It is published by
GitHub Pages with the rest of the site, at /autogtm-report. It carries a noindex
meta, is kept out of sitemap.xml by gen_sitemap.py (NOINDEX_ONLY) and is linked
from nowhere - the same arrangement as /gtm-console. That keeps it out of
Google; it does not make it private. Anyone with the URL can read it, and it
names leads and what they said, so do not share the URL.
"""

import argparse
import html
import sys
from pathlib import Path

from state import STATE, load

HERE = Path(__file__).resolve().parent
PAGE = HERE.parent.parent / "autogtm-report.html"
INBOX_URL = "https://explee.com/app-auto-gtm/p/{}/inbox"

CSS = """
:root{--bg:#fafaf7;--fg:#1c1c1a;--mute:#6b6b66;--line:#e4e2dc;--ok:#166534;--warn:#9a3412;
--dry:#1d4ed8;--card:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#131311;--fg:#ecebe6;--mute:#a09f98;
--line:#2c2b27;--ok:#4ade80;--warn:#fb923c;--dry:#93c5fd;--card:#1b1b18}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,
Segoe UI,Roboto,sans-serif}main{max-width:1100px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:36px 0 10px;padding-top:12px;
border-top:1px solid var(--line)}p{margin:6px 0}.mute{color:var(--mute)}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;
font-weight:600;border:1px solid var(--line)}.pill.ok{color:var(--ok)}
.pill.warn{color:var(--warn)}.pill.dry{color:var(--dry)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;
margin:18px 0}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;
padding:12px 14px}.card b{display:block;font-size:24px;font-weight:600}
.card span{color:var(--mute);font-size:13px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);
vertical-align:top}th{color:var(--mute);font-weight:600;font-size:12px;
text-transform:uppercase;letter-spacing:.03em}td.num{text-align:right;
font-variant-numeric:tabular-nums}.said{max-width:420px;color:var(--mute)}
code{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:0 5px}
.how{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px}
"""


def esc(value, width=None):
    text = str(value if value is not None else "").replace("\n", " ").strip()
    if width and len(text) > width:
        text = text[:width - 1] + "…"
    return html.escape(text)


def pill(applied, sent_label="ARMED", dry_label="DRY RUN"):
    return ('<span class="pill ok">{}</span>'.format(sent_label) if applied
            else '<span class="pill dry">{}</span>'.format(dry_label))


def table(headers, rows):
    if not rows:
        return '<p class="mute">nothing yet</p>'
    head = "".join("<th>{}</th>".format(esc(h)) for h in headers)
    body = "".join("<tr>{}</tr>".format("".join(
        '<td class="{}">{}</td>'.format(cls, cell) for cls, cell in row)) for row in rows)
    return '<div class="wrap"><table><thead><tr>{}</tr></thead><tbody>{}</tbody></table></div>' \
        .format(head, body)


def section_followups(data):
    fu = data.get("followups")
    if not fu:
        return "<h2>Follow-up loop</h2><p class=\"mute\">has not run yet</p>"
    rows = fu.get("rows", [])
    acted = [r for r in rows if r.get("action") in ("send", "queue")]
    rest = [r for r in rows if r.get("action") == "skip"]
    hot = fu.get("hot", [])
    in_loop = {r.get("email") for r in rows}
    out = ["<h2>Follow-up loop <span class=\"mute\">— recover.py, {} </span>{}</h2>".format(
        esc(fu.get("at", "")[:16].replace("T", " ")), pill(fu.get("applied"), "SENT", "DRY RUN"))]
    out.append('<div class="cards">')
    for label, value in (("replied leads read", len(rows)),
                         ("acted on this run", len(acted)),
                         ("emails sent" if fu.get("applied") else "emails it would send",
                          fu.get("sends", 0) if fu.get("applied")
                          else sum(1 for r in acted if r.get("action") == "send")),
                         ("hot leads flagged by Explee", len(hot))):
        out.append('<div class="card"><b>{}</b><span>{}</span></div>'.format(value, esc(label)))
    out.append("</div>")
    tally = fu.get("tally", {})
    if tally:
        out.append("<p class=\"mute\">" + " · ".join(
            "{} {}".format(v, esc(k)) for k, v in sorted(tally.items(), key=lambda kv: -kv[1]))
            + "</p>")

    def who(r):
        return "<b>{}</b><br><span class=\"mute\">{}</span>".format(
            esc(r.get("first_name") or r.get("email"), 30), esc(r.get("company"), 30))
    out.append("<h3>This run</h3>")
    out.append(table(["who", "campaign", "they said", "what happened"], [
        [("", who(r)), ("", esc(r.get("campaign"), 30)), ("said", esc(r.get("last_reply"), 160)),
         ("", ("sent " if r.get("sent") else "would send " if r.get("action") == "send"
               else "parked: ") + esc(r.get("bucket")))] for r in acted]))
    out.append("<h3>Everyone else who replied</h3>")
    out.append(table(["who", "campaign", "they said", "status"], [
        [("", who(r)), ("", esc(r.get("campaign"), 30)), ("said", esc(r.get("last_reply"), 160)),
         ("", esc(r.get("next_action"), 60))] for r in rest]))
    out.append("<h3>Hot leads Explee flagged</h3>")
    out.append(table(["who", "title", "campaign", "went hot", "in the loop"], [
        [("", who(h)), ("", esc(h.get("job_title"), 40)), ("", esc(h.get("campaign"), 30)),
         ("", esc(str(h.get("replied_at", ""))[:10])),
         ("", "yes" if h.get("email") in in_loop else "no reply thread yet")] for h in hot]))
    return "\n".join(out)


def section_measure(data):
    ms = data.get("measure")
    out = ["<h2>Sequence length <span class=\"mute\">— sequence.py measure{}</span></h2>".format(
        ", " + esc(ms.get("at", "")[:16].replace("T", " ")) if ms else "")]
    if not ms:
        return out[0] + "<p class=\"mute\">has not run yet</p>"
    for camp in ms.get("campaigns", []):
        tally = camp.get("tally", {})
        replies = {int(k): v for k, v in tally.get("replies", {}).items()}
        positive = {int(k): v for k, v in tally.get("positive", {}).items()}
        current = camp.get("emails", 0)
        total = sum(replies.values())
        seen, rows = 0, []
        for step in range(1, current + 1):
            seen += replies.get(step, 0)
            rows.append([("num", step), ("num", replies.get(step, 0)),
                         ("num", positive.get(step, 0)),
                         ("num", "{:.0%}".format(seen / total) if total else "-")])
        pick = camp.get("recommend")
        out.append("<h3>{} <span class=\"mute\">— {} emails in the sequence</span> {}</h3>".format(
            esc(camp.get("name")), current,
            '<span class="pill warn">shorten to {}</span>'.format(pick) if pick
            else '<span class="pill">keep</span>'))
        out.append(table(["step", "replies", "positive", "cumulative share"], rows))
        out.append("<p class=\"mute\">{}</p>".format(esc(camp.get("why", ""))))
        if pill:
            out.append("<p class=\"mute\">left out: {} auto-replies, {} threads too young to "
                       "have received the whole sequence, {} without a step</p>".format(
                           tally.get("auto", 0), tally.get("young", 0), tally.get("no_step", 0)))
    return "\n".join(out)


def section_prequalify(data):
    pq = data.get("prequalify")
    if not pq:
        return "<h2>Pre-qualification</h2><p class=\"mute\">has not run yet</p>"
    out = ["<h2>Pre-qualification <span class=\"mute\">— prequalify.py, {} </span>{}</h2>".format(
        esc(pq.get("at", "")[:16].replace("T", " ")), pill(pq.get("applied"), "SPENT", "DRY RUN"))]
    out.append('<div class="cards">')
    for label, value in (("source campaign", esc(pq.get("source_name"), 40)),
                         ("people searched", pq.get("searched", 0)),
                         ("qualified (score ≥ {})".format(pq.get("min_score", "?")),
                          pq.get("qualified", 0)),
                         ("import-ready", pq.get("usable", 0)),
                         ("new campaign", pq.get("campaign_id") or "—")):
        out.append('<div class="card"><b>{}</b><span>{}</span></div>'.format(value, esc(label)))
    out.append("</div>")
    if pq.get("criteria"):
        out.append("<p><b>Criteria scored 0–5:</b> " + " · ".join(
            esc(c, 80) for c in pq["criteria"]) + "</p>")
    if pq.get("histogram"):
        out.append("<p class=\"mute\">lowest score per person: " + "  ".join(
            "{}: {}".format(esc(k), v) for k, v in sorted(pq["histogram"].items())) + "</p>")
    if pq.get("compare_after"):
        out.append("<p>Compare the two campaigns after <b>{}</b>: same brief, same project, "
                   "the reply rate decides.</p>".format(esc(pq["compare_after"])))
    return "\n".join(out)


def section_runs(data):
    rows = [[("", esc(r.get("at", "")[:16].replace("T", " "))), ("", esc(r.get("task"))),
             ("", pill(r.get("applied"))), ("", esc(r.get("outcome"), 140))]
            for r in data.get("runs", [])]
    return "<h2>Run history</h2>" + table(["when (UTC)", "task", "mode", "outcome"], rows)


def render(data, project_id=None):
    balance = data.get("balance")
    bal = ("<span class=\"pill {}\">balance {:.0f} credits (${:.2f})</span>".format(
        "ok" if balance > 0 else "warn", balance, balance / 100.0)
        if isinstance(balance, (int, float)) else "")
    last = data["runs"][0] if data.get("runs") else None
    project_id = project_id or (data.get("followups") or {}).get("project_id")
    inbox = INBOX_URL.format(project_id) if project_id else "https://explee.com/app-auto-gtm"
    head = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="robots" content="noindex, nofollow, noarchive"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AutoGTM loop</title><style>{}</style></head><body><main>""".format(CSS)
    parts = [head,
             "<h1>AutoGTM loop — what the API calls did</h1>",
             "<p class=\"mute\">last run {} · {} {}</p>".format(
                 esc(last["at"][:16].replace("T", " ")) if last else "never",
                 esc(last["task"]) if last else "", bal),
             '<div class="how"><p><b>To stop the loop on one person:</b> open them in the '
             '<a href="{}">Explee inbox</a>, write <code>booked</code> or <code>stop</code> in '
             'the lead note. The next run leaves them alone, and writes what it did into '
             'the same note.</p><p class="mute">Dry runs send nothing; they show what the '
             'next armed run would send. Arming is the <code>EXPLEE_APPLY</code> variable '
             'in the repository.</p></div>'.format(esc(inbox)),
             section_followups(data), section_measure(data), section_prequalify(data),
             section_runs(data),
             "<p class=\"mute\" style=\"margin-top:40px\">This page is not indexed and not "
             "linked. It names people and what they wrote: do not share the URL.</p>",
             "</main></body></html>"]
    return "\n".join(parts)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--state", default=str(STATE))
    ap.add_argument("--write", action="store_true", help="write {}".format(PAGE.name))
    ap.add_argument("--out", default=str(PAGE))
    args = ap.parse_args(argv)
    page = render(load(Path(args.state)))
    if args.write:
        Path(args.out).write_text(page)
        print("-> {} ({} bytes)".format(args.out, len(page)))
    else:
        sys.stdout.write(page)
    return 0


if __name__ == "__main__":
    sys.exit(main())
