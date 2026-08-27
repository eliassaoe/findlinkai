#!/usr/bin/env bash
#
# Ships this directory to the published Google Sheets add-on.
#
# Everything here can be done by hand — paste five files into the Apps Script
# editor, cut a version, bump a number in Cloud. This exists because that is six
# fiddly steps with two ways to quietly break a live add-on, and a fix nobody
# ships is the same as a fix nobody wrote.
#
#   ./deploy.sh            push the code and cut a new version
#   ./deploy.sh --dry-run  show what would happen, change nothing
#
# The two things it will not do, on purpose:
#   - create a NEW deployment (a new deployment id disables the old one's triggers)
#   - touch appsscript.json (changing the scopes means Google re-verification)
#
set -euo pipefail

cd "$(dirname "$0")"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
die()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
run()  { if [[ $DRY_RUN == 1 ]]; then printf '  would run: %s\n' "$*"; else "$@"; fi; }

# ── 1. clasp ────────────────────────────────────────────────────────────────
if ! command -v clasp >/dev/null 2>&1; then
  say "Installing clasp (Google's Apps Script CLI)"
  run npm install -g @google/clasp
fi

if [[ ! -f "$HOME/.clasprc.json" ]]; then
  say "Signing in to Google"
  echo "A browser will open. Sign in as the account that PUBLISHED the add-on —"
  echo "not a personal account. Nothing gets pasted anywhere."
  echo
  echo "If this fails, switch the Apps Script API on once at:"
  echo "  https://script.google.com/home/usersettings"
  run clasp login
fi

# ── 2. which project ────────────────────────────────────────────────────────
if [[ ! -f .clasp.json ]]; then
  say "Which Apps Script project?"
  echo "Find the script id in the Apps Script editor under Project Settings —"
  echo "it is the long string labelled 'Script ID'."
  echo
  read -rp "Script ID: " SCRIPT_ID
  [[ -n "$SCRIPT_ID" ]] || die "No script id given — nothing to push to."

  # rootDir is this folder, so clasp never wanders into the rest of the repo.
  if [[ $DRY_RUN == 1 ]]; then
    echo "  would write .clasp.json for $SCRIPT_ID"
  else
    printf '{\n  "scriptId": "%s",\n  "rootDir": "."\n}\n' "$SCRIPT_ID" > .clasp.json
    echo "Saved .clasp.json (gitignored — it names one specific project)."
  fi
fi

# ── 3. do not ship a stale build ────────────────────────────────────────────
say "Checking the generated files are current"
if [[ $DRY_RUN == 1 ]]; then
  echo "  would run: node build.mjs && git diff --quiet"
else
  node build.mjs
  if ! git diff --quiet -- Operations.gs Help.html; then
    die "Operations.gs or Help.html changed when regenerated.
Commit the regenerated files before deploying — otherwise the add-on ships
something that is not in the repo."
  fi
fi

# ── 4. the scopes must not have moved ───────────────────────────────────────
say "Checking no new OAuth scope crept in"
ALLOWED='SpreadsheetApp|PropertiesService|UrlFetchApp|Utilities|HtmlService|Logger'
FOUND=$(grep -ohE '\b[A-Z][A-Za-z]+App\b|\bPropertiesService\b|\bUtilities\b|\bLogger\b' Code.gs Operations.gs \
        | sort -u | grep -vE "^($ALLOWED)$" || true)
if [[ -n "$FOUND" ]]; then
  die "New Apps Script service(s) in use: $FOUND
Apps Script infers the add-on's scopes from its code, so this widens them — and
a scope change pulls the add-on from the store until Google re-verifies it.
Deploy stopped. See the README."
fi
grep -q '@OnlyCurrentDoc' Code.gs || die "@OnlyCurrentDoc is missing from Code.gs — that also widens the scopes."
echo "Only the six services the published version already used. Scopes unchanged."

# ── 5. push ─────────────────────────────────────────────────────────────────
say "Pushing the code"
warn "If clasp offers to DELETE appsscript.json from the remote, answer no."
warn "That manifest is deliberately not in this repo; losing it changes the scopes."
run clasp push

# ── 6. cut a version on the EXISTING deployment ─────────────────────────────
say "Cutting a new version"
DESCRIPTION="${DEPLOY_MESSAGE:-$(git log -1 --pretty=%s 2>/dev/null || echo 'update')}"
run clasp version "$DESCRIPTION"

say "Existing deployments"
if [[ $DRY_RUN == 1 ]]; then
  echo "  would run: clasp deployments"
else
  clasp deployments
fi

cat <<'NEXT'

──────────────────────────────────────────────────────────────────────────
Two clicks left, and they have to be done in a browser.

1. Apps Script -> Deploy -> Manage deployments
   Edit the EXISTING deployment. Version: New version. Deploy.
   Do NOT create a new deployment — a new id disables the old one's triggers.

2. Google Cloud -> Marketplace SDK -> App Configuration
   Bump the version number. THIS is the step that publishes it.

No review, no reinstall — the scopes did not change (checked above).
Test it in a spreadsheet before doing step 2.
──────────────────────────────────────────────────────────────────────────
NEXT
