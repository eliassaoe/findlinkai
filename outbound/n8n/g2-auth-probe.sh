#!/usr/bin/env bash
# Finds which Authorization style your G2 key actually wants.
#
#   G2_API_TOKEN=xxxx ./outbound/n8n/g2-auth-probe.sh
#
# A 401 "Bad Credentials" from G2 is ambiguous: it looks the same whether the
# header style is wrong or the key is not a Data API key at all. This tries
# every style so you stop guessing. Whichever prints products is the one to
# set as g2AuthStyle in the workflow's Config node.
set -u
: "${G2_API_TOKEN:?Set G2_API_TOKEN in the environment (do not paste it into a file)}"

URL="https://data.g2.com/api/v2/categories/site-search-software?include=products"

try () {
  local label="$1"; shift
  local code body
  body=$(curl -sS -w $'\n%{http_code}' --max-time 20 -H "$@" "$URL" 2>&1)
  code=$(printf '%s' "$body" | tail -n1)
  body=$(printf '%s' "$body" | sed '$d')
  if [ "$code" = "200" ]; then
    local n
    n=$(printf '%s' "$body" | grep -o '"type":"products"' | wc -l | tr -d ' ')
    echo "  ✓ $label -> 200, $n products"
  else
    echo "  ✗ $label -> $code  $(printf '%s' "$body" | head -c 120)"
  fi
}

echo "Probing G2 auth styles against $URL"
try "g2AuthStyle: 'token'"  "Authorization: Token token=$G2_API_TOKEN"
try "g2AuthStyle: 'bearer'" "Authorization: Bearer $G2_API_TOKEN"
try "g2AuthStyle: 'raw'"    "Authorization: $G2_API_TOKEN"

echo
echo "All three 401 => the key is not a Data API token."
echo "Get one from the Developer Portal: https://my.g2.com/developers"
echo "Until then set useG2:false in Config and run on Hacker News alone."
