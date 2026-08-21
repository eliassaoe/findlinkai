#!/usr/bin/env bash
# Runs the task-credit regression suite against a throwaway Postgres.
# Never point this at production: it creates and drops its own database.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PGHOST_ARG="${PGHOST:-localhost}"
PGPORT_ARG="${PGPORT:-5432}"
PGUSER_ARG="${PGUSER:-postgres}"
DB="${TEST_DB:-linkfinder_task_credits_test}"

psql -h "$PGHOST_ARG" -p "$PGPORT_ARG" -U "$PGUSER_ARG" -q \
     -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"

run() { psql -h "$PGHOST_ARG" -p "$PGPORT_ARG" -U "$PGUSER_ARG" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }

run "$HERE/mock_schema.sql"
run "$HERE/../01_fix_task_credit_awarding.sql"
run "$HERE/test_task_credit_awarding.sql"

echo "ALL TESTS PASSED"
