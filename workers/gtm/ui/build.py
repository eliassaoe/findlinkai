#!/usr/bin/env python3
"""Publish the console to the website as /gtm-console.

`workers/gtm/ui/index.html` is the ONE master copy. This script renders it to
`gtm-console.html` at the repo root, which is how a plain-HTML page gets served
at https://linkfinderai.com/gtm-console.

Edit the master, run this, commit both. Never hand-edit gtm-console.html — the
repo already has three things called "the Google Sheets integration" for exactly
this reason, and a second editable copy is how that happens.

    python3 workers/gtm/ui/build.py            # dry run, shows the diff summary
    python3 workers/gtm/ui/build.py --write
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MASTER = HERE / "index.html"
ROOT = HERE.parents[2]
TARGET = ROOT / "gtm-console.html"

# Crawlable (so the crawler can read the noindex), noindex, and absent from the
# sitemap — see NOINDEX_ONLY in gen_sitemap.py for why it is not in robots.txt.
HEAD = """<!-- GENERATED — do not edit. Master: workers/gtm/ui/index.html
     Rebuild: python3 workers/gtm/ui/build.py --write -->
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="googlebot" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
"""


def render() -> str:
    html = MASTER.read_text(encoding="utf-8")
    marker = "<title>"
    if marker not in html:
        sys.exit("master has no <title> to anchor the head block on")
    return html.replace(marker, HEAD + marker, 1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    out = render()
    old = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
    if out == old:
        print(f"{TARGET.name} is already current ({len(out)} bytes)")
        return 0

    print(f"master  : {MASTER.relative_to(ROOT)} ({len(MASTER.read_text(encoding='utf-8'))} bytes)")
    print(f"target  : {TARGET.name} ({len(old)} -> {len(out)} bytes)")
    if not args.write:
        print("\nDRY RUN. Re-run with --write.")
        return 0

    TARGET.write_text(out, encoding="utf-8")
    print(f"WROTE {TARGET.name}")
    print("Next: python3 gen_sitemap.py --write  (keeps it out of the sitemap), then commit both.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
