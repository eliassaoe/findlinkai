#!/usr/bin/env bash
# The two Explee calls the n8n flow makes, byte-for-byte, so you can see the
# real responses before running the workflow again.
#
# The agent sandbox cannot reach api.explee.com — the egress policy answers 403
# to CONNECT — so this has to be run from your machine.
#
#   export EXPLEE_API_KEY=sk_explee_...      # the ROTATED one
#   ./check-explee.sh
#
# Add a task id to also check a job that never finished:
#   ./check-explee.sh 6ff9b529-6ce7-4bd4-a754-cbef27013903

set -u
: "${EXPLEE_API_KEY:?export EXPLEE_API_KEY first}"
API=https://api.explee.com/public/api/v1
pretty() { python3 -m json.tool 2>/dev/null || cat; }

echo "=== 1. balance — free, and every other call 402s if this is <= 0"
curl -sS -w '\nHTTP %{http_code}\n' -H "X-API-Key: $EXPLEE_API_KEY" \
     "$API/billing/balance" | pretty

echo
echo "=== 2. search/people — what the workflow now sends. Synchronous."
curl -sS -w '\nHTTP %{http_code}\n' -X POST "$API/search/people" \
  -H "X-API-Key: $EXPLEE_API_KEY" -H 'Content-Type: application/json' \
  -d '{
    "people_filters": {
      "job_titles": ["Dirigeant", "responsable commercial"],
      "criteria": ["Vente B2B active", "Equipe commerciale de moins de 5"]
    },
    "company_filters": {
      "definition": "organisme de formation, centre de formation in France, Belgique, Luxembourg"
    },
    "limit": 5
  }' | pretty

if [ $# -ge 1 ]; then
  echo
  echo "=== 3. the stuck find-and-enrich job $1"
  curl -sS -w '\nHTTP %{http_code}\n' -H "X-API-Key: $EXPLEE_API_KEY" \
       "$API/find-and-enrich/$1" | pretty
fi

cat <<'NOTE'

What to look for in call 2:
  - HTTP 200 with a "people" array   -> the flow works, import it and run
  - HTTP 200 but the array is under some other key -> paste it here, one-line fix
  - HTTP 402 -> balance, not the code
  - HTTP 404/422 -> the endpoint or the body shape is wrong, paste the message
NOTE
