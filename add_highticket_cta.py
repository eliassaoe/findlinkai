#!/usr/bin/env python3
"""
add_highticket_cta.py

Adds one line -- <script src="/js/lf-highticket-cta.js" defer></script> --
before </body> on every marketing page in the repo root.

The script decides at runtime whether a page gets the book-a-call band, the
quiet free-trial line, or nothing at all. That routing lives in
js/lf-highticket-cta.js and is explained there (short version: this site's
search traffic is mostly single-lookup tool pages, and selling "don't do it
yourself" to someone who came to do it themselves does not work -- see
docs/traffic-capture-verdict.md). So this script is deliberately dumb: it adds
the tag, and never decides anything.

Because the tag is identical on every page, moving a page between tiers is an
edit to the JS or a data-lf-cta attribute on that page's <body>, and this
script never has to run again.

Usage (from the repo root):
    python3 add_highticket_cta.py --dry-run   # preview, no writes
    python3 add_highticket_cta.py             # apply
"""

import glob
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
TAG = '<script src="/js/lf-highticket-cta.js" defer></script>'

# The app, the auth flow and the pages that already carry their own converting
# CTA. The JS refuses to render on these anyway (its NEVER list), so this is
# about not shipping a marketing script into the product at all.
SKIP = {
    "app.html", "app-beta.html", "app-beta-2.html", "app_beta.html",
    "beta-index.html", "account.html", "account-beta.html",
    "log-in.html", "log-in-beta.html", "sign-up.html", "sign-up-beta.html",
    "confirmation-login.html", "confirmation-signup.html",
    "confirmation-signup-beta.html", "verify-email.html",
    "reset-password.html", "update-password.html", "redeem-code.html",
    "upgrade-confirmation.html", "say-goodbye.html",
    "history.html", "history-beta.html",
    "api-access.html", "api-access-beta.html",
    "gtm-console.html", "autogtm-report.html", "crm-audit.html",
    "crm-audit-privacy.html", "avant-votre-appel.html", "linkfinder-vip.html",
    "talk-to-sales.html", "done-for-you-outbound.html",
    "end-of-bookmarks-bar.html", "badge.html", "100free.html",
}

BODY_CLOSE = re.compile(r"</body>", re.IGNORECASE)


def process(path, dry_run):
    name = os.path.basename(path)
    if name in SKIP:
        return "skip"
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    if "lf-highticket-cta.js" in html:
        return "already"
    if not BODY_CLOSE.search(html):
        return "no-body"
    html = BODY_CLOSE.sub(TAG + "\n</body>", html, count=1)
    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
    return "added"


def main():
    dry_run = "--dry-run" in sys.argv
    counts = {}
    for path in sorted(glob.glob(os.path.join(REPO_ROOT, "*.html"))):
        result = process(path, dry_run)
        counts[result] = counts.get(result, 0) + 1
        if result in ("added", "no-body"):
            print("%-9s %s" % (result, os.path.basename(path)))
    print("\n" + ("DRY RUN — " if dry_run else "") + ", ".join(
        "%s: %d" % (k, v) for k, v in sorted(counts.items())))
    if counts.get("no-body"):
        print("WARNING: pages with no </body> were left untouched.")


if __name__ == "__main__":
    main()
