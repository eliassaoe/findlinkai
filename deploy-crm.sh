#!/usr/bin/env bash
#
# Deploys the two pieces that make the CRM cleanup work:
#   1. the Nango sync   (reads HubSpot, fills gaps, writes back)
#   2. the connect worker (mints Connect sessions, triggers the sync)
#
# Run from the repo root:  bash deploy-crm.sh
#
# Nothing here is stored. Secrets are typed at the prompt and go straight to
# Cloudflare / a gitignored .env - none of them are written to a tracked file.

set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !! \033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------- prerequisite
say "Before anything else"
cat <<'TXT'
You do NOT need your own HubSpot developer app. Nango ships a shared developer
app for HubSpot that works in production as well as dev. All that is required:

  https://app.nango.dev/dev/integrations/hubspot/settings
  -> enable the integration, and turn on these scopes:
       crm.objects.contacts.read     crm.objects.contacts.write
       crm.objects.companies.read    crm.objects.companies.write

Register your own HubSpot app LATER, not now. The reason is branding rather
than function: on Nango's shared app your customers see "Authorize Nango" on
the consent screen instead of LinkFinder AI, the scopes are fixed, and the
callback is on Nango's domain rather than yours. None of that blocks you today.

TXT
read -r -p "HubSpot integration enabled in Nango with those scopes? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { warn "Enable it at app.nango.dev, then re-run this script."; exit 1; }

# ---------------------------------------------------------------- 1. the sync
say "1/2  Deploying the Nango sync"

cd nango-integrations

if [ ! -f .env ]; then
    echo "Nango secret keys — from https://app.nango.dev/dev/environment-settings"
    echo "(note the _DEV / _PROD suffixes; a plain NANGO_SECRET_KEY is ignored by the CLI)"
    read -r -s -p "  NANGO_SECRET_KEY_DEV:  " NDEV;  echo
    read -r -s -p "  NANGO_SECRET_KEY_PROD: " NPROD; echo
    printf 'NANGO_SECRET_KEY_DEV=%s\nNANGO_SECRET_KEY_PROD=%s\n' "$NDEV" "$NPROD" > .env
    ok ".env written (gitignored)"
else
    ok ".env already present, reusing it"
fi

[ -d node_modules ] || { echo "installing deps..."; npm install --silent; }

echo "compiling (validates without touching Nango)..."
npm run compile
ok "compiled"

npm run deploy:dev
ok "sync deployed to the dev environment"
echo "   run 'npm run deploy:prod' in nango-integrations when you are happy with it"

# ---------------------------------------------------------------- 2. the worker
cd ../workers/nango-connect
say "2/2  Deploying the connect worker"

echo "You will be prompted for three secrets. They go straight to Cloudflare,"
echo "encrypted, and are never written to disk here."
echo

for s in NANGO_SECRET_KEY SUPABASE_URL SUPABASE_SERVICE_KEY; do
    case "$s" in
      NANGO_SECRET_KEY)     hint="same Nango key as above, no _DEV suffix" ;;
      SUPABASE_URL)         hint="https://snxhsboboatjywgwdeds.supabase.co" ;;
      SUPABASE_SERVICE_KEY) hint="service_role key — NOT the anon/publishable one" ;;
    esac
    echo "  $s  ($hint)"
    npx wrangler secret put "$s"
done

npx wrangler deploy
ok "worker deployed"

# ---------------------------------------------------------------- done
say "Done — now verify it"
cat <<'TXT'
  1. Open  https://linkfinderai.com/crm-sync  on a PAID account
  2. Upload any CSV so the audit runs
  3. The "Fix these gaps in HubSpot" card should offer "Connect HubSpot"
     (not "Could not reach the connection service")
  4. Connect, then check app.nango.dev -> Connections: the connection exists
     AND its metadata contains apiKey. Empty metadata means /finalise failed —
     check API_KEY_COLUMN in wrangler.toml against your real schema.
  5. Click "Clean my HubSpot now" on a small test portal first.

The sync is autoStart:false on purpose — it only ever runs when someone asks,
because it spends their credits.
TXT
