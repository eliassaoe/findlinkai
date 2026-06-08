#!/usr/bin/env python3
"""
build-faq-schema.py
-------------------
Scans each HTML page for its FAQ section (.faq-item > .faq-question / .faq-answer),
extracts the questions and answers, and injects valid FAQPage JSON-LD into <head>.

Safe to run repeatedly: it strips any block it added before and re-inserts a fresh
one. Pages without a FAQ are skipped untouched. Only the marked block is changed.

Usage (inside a GitHub Codespace):
    pip install beautifulsoup4
    python build-faq-schema.py --dry-run   # preview, writes nothing
    python build-faq-schema.py             # apply
"""

import sys
import re
import json
from pathlib import Path
from bs4 import BeautifulSoup

CONTENT_DIR = Path(".")
EXCLUDE_DIRS = {".git", ".github", "node_modules"}
MARKER_START = "<!-- FAQ-SCHEMA:START -->"
MARKER_END = "<!-- FAQ-SCHEMA:END -->"

DRY_RUN = "--dry-run" in sys.argv


def norm(text):
    return re.sub(r"\s+", " ", text or "").strip()


def extract_faqs(soup):
    """Return a list of (question, answer) tuples, or [] if none found."""
    pairs = []

    items = soup.select(".faq-item")
    if items:
        for item in items:
            q_el = item.select_one(".faq-question")
            a_el = item.select_one(".faq-answer")
            if not q_el or not a_el:
                continue
            # drop the chevron icon (or any nested tags) from the question
            for tag in q_el.find_all(["i", "svg", "span"]):
                tag.decompose()
            q = norm(q_el.get_text(" "))
            a = norm(a_el.get_text(" "))
            if q and a:
                pairs.append((q, a))
        return pairs

    # Fallback: pair up bare .faq-question / .faq-answer lists in document order
    qs = soup.select(".faq-question")
    ans = soup.select(".faq-answer")
    if qs and ans and len(qs) == len(ans):
        for q_el, a_el in zip(qs, ans):
            for tag in q_el.find_all(["i", "svg", "span"]):
                tag.decompose()
            q = norm(q_el.get_text(" "))
            a = norm(a_el.get_text(" "))
            if q and a:
                pairs.append((q, a))
    return pairs


def build_block(pairs):
    schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
            for q, a in pairs
        ],
    }
    body = json.dumps(schema, indent=2, ensure_ascii=False)
    return (
        f"{MARKER_START}\n"
        f'<script type="application/ld+json">\n{body}\n</script>\n'
        f"{MARKER_END}"
    )


def inject(path, block):
    text = path.read_text(encoding="utf-8", errors="ignore")
    original = text

    # strip any previous block (with leading whitespace) so reruns don't stack
    text = re.sub(
        r"\s*" + re.escape(MARKER_START) + r".*?" + re.escape(MARKER_END),
        "", text, flags=re.DOTALL,
    )

    insert = "  " + block + "\n"
    if re.search(r"</head>", text, flags=re.IGNORECASE):
        text = re.sub(r"</head>", insert + "</head>", text, count=1, flags=re.IGNORECASE)
    else:
        # no <head> (unlikely) — put it right after <body> or at the top
        if re.search(r"<body[^>]*>", text, flags=re.IGNORECASE):
            text = re.sub(r"(<body[^>]*>)", r"\1\n" + insert, text, count=1, flags=re.IGNORECASE)
        else:
            text = insert + text

    if text != original and not DRY_RUN:
        path.write_text(text, encoding="utf-8")
    return text != original


def main():
    pages = [
        p for p in CONTENT_DIR.rglob("*.html")
        if not (set(p.relative_to(CONTENT_DIR).parts) & EXCLUDE_DIRS)
        and not p.name.startswith(".")
    ]

    injected, skipped, total_q = 0, 0, 0
    for path in pages:
        soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="ignore"), "html.parser")
        pairs = extract_faqs(soup)
        if not pairs:
            skipped += 1
            continue
        if inject(path, build_block(pairs)):
            injected += 1
            total_q += len(pairs)
            print(f"  + {path.as_posix():55} {len(pairs)} Q&A")

    print(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Pages with FAQ schema injected: {injected}")
    print(f"Pages skipped (no FAQ found): {skipped}")
    print(f"Total questions marked up: {total_q}")


if __name__ == "__main__":
    main()