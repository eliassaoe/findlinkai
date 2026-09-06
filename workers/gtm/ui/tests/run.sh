#!/usr/bin/env bash
# The node bodies are real JavaScript, so they are tested as JavaScript:
#   1. every nodes/*.js parses inside the async wrapper n8n uses
#   2. the whole flow runs end to end against fakes built from real API shapes
#   3. adversarial cases per node (country names, agent preambles, a campaign
#      whose template ignores the variables, ...) — each prints ok or FAIL
#   4. index.html carries the current node bodies (gen_nodes.py --check)
set -e
cd "$(dirname "$0")/.."
for f in nodes/*.js; do
  { echo "export default async function(){"; cat "$f"; echo "}"; } > /tmp/_n8n_node_check.mjs
  node --check /tmp/_n8n_node_check.mjs || { echo "SYNTAX FAIL $f"; exit 1; }
done
echo "nodes parse"
node tests/e2e_sim.mjs > /tmp/_e2e.out 2>&1 || { cat /tmp/_e2e.out; exit 1; }
grep -q "emails ready" /tmp/_e2e.out && echo "end-to-end simulation ok" || { cat /tmp/_e2e.out; exit 1; }
node tests/adversarial.mjs | tee /tmp/_adv.out
grep -q FAIL /tmp/_adv.out && exit 1
python3 gen_nodes.py --check
