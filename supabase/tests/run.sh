#!/usr/bin/env bash
# Runs the task-credit and review-verification suites against a throwaway
# Postgres. Never point this at production: it drops and recreates its own
# database.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
H="${PGHOST:-localhost}"; P="${PGPORT:-5432}"; U="${PGUSER:-postgres}"
DB="${TEST_DB:-linkfinder_task_credits_test}"

q() { psql -h "$H" -p "$P" -U "$U" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }
fresh() {
  psql -h "$H" -p "$P" -U "$U" -q -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"
}

# Suite 1: credit awarding, with only 01 applied.
fresh
q "$HERE/mock_schema.sql"
q "$HERE/../01_fix_task_credit_awarding.sql"
q "$HERE/test_task_credit_awarding.sql"
echo "credit awarding: OK"

# Suite 2: review verification, with 01 and 02 applied.
fresh
q "$HERE/mock_schema.sql"
q "$HERE/../01_fix_task_credit_awarding.sql"
q "$HERE/../02_auto_verify_review_urls.sql"
q "$HERE/test_review_url_verification.sql"
echo "review verification: OK"

# Suite 3: the production combination — 02 must not disturb 01's behaviour.
fresh
q "$HERE/mock_schema.sql"
q "$HERE/../01_fix_task_credit_awarding.sql"
q "$HERE/../02_auto_verify_review_urls.sql"
q "$HERE/test_task_credit_awarding.sql"
echo "credit awarding with verification applied: OK"

echo "ALL TESTS PASSED"
