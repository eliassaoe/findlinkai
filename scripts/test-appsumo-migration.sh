#!/usr/bin/env bash
# Applies the AppSumo LTD migration to a throwaway Postgres and runs its
# behaviour tests. Nothing here touches the real project.
#
#   ./scripts/test-appsumo-migration.sh
#
# It stubs the two things Supabase provides and a bare Postgres does not:
# pg_cron (cron.schedule / cron.unschedule / cron.job) and the anon /
# authenticated / service_role roles. Everything else is the real migration.
set -euo pipefail

PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -1)
[ -n "$PGBIN" ] || { echo "no postgres server binaries; install postgresql"; exit 1; }
export PATH="$PGBIN:$PATH"
PORT=${PGPORT:-5433}
DATA=$(mktemp -d)
OWNER=$(id -u postgres >/dev/null 2>&1 && echo postgres || echo "$(whoami)")
chown -R "$OWNER" "$DATA"

cleanup() { su "$OWNER" -c "$PGBIN/pg_ctl -D $DATA stop" >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

su "$OWNER" -c "$PGBIN/initdb -D $DATA -U pg" >/dev/null
su "$OWNER" -c "$PGBIN/pg_ctl -D $DATA -o '-k /tmp -p $PORT' -l $DATA/log start" >/dev/null
sleep 2

psql -h /tmp -p "$PORT" -U pg -d postgres -q -v ON_ERROR_STOP=1 <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema cron;
create table cron.job (jobid bigserial, jobname text, schedule text, command text);
create function cron.schedule(jobname text, schedule text, command text)
returns bigint language sql as $$ insert into cron.job(jobname,schedule,command)
  values (jobname,schedule,command) returning jobid $$;
create function cron.unschedule(jobname text) returns boolean language sql as
  $$ delete from cron.job where job.jobname = $1 returning true $$;
create table public.linkfinderai_users (
  id bigserial primary key,
  email text, token text unique, credits bigint default 0,
  subscription_id text, is_unlimited boolean default false,
  plan_type int, first_name text, email_verified boolean
);
SQL

ROOT=$(cd "$(dirname "$0")/.." && pwd)
psql -h /tmp -p "$PORT" -U pg -d postgres -q -v ON_ERROR_STOP=1 \
     -f "$ROOT/supabase/migrations/20260905120000_appsumo_ltd.sql" >/dev/null
echo "migration applied"

psql -h /tmp -p "$PORT" -U pg -d postgres -v ON_ERROR_STOP=1 \
     -f "$ROOT/supabase/tests/appsumo_ltd_test.sql" 2>&1 \
  | grep -E "ok |ERROR|PASSED|^---|NOTICE:  ---" | sed 's/^psql.*NOTICE:  //'
