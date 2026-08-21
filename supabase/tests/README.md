# Task credit tests

Runs `../01_fix_task_credit_awarding.sql` against a scratch database seeded
with `mock_schema.sql`, then asserts the behaviour.

**This drops and recreates its own database. Never point it at production.**

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres ./run.sh
```

Override the database name with `TEST_DB`. Every assertion aborts with a
message naming the failure, so a silent run is a real pass.

`mock_schema.sql` reproduces the production shape the migration targets:
`users(token, credits)` and `onboarding_task_completions(user_token, task_name,
status, credits, ...)`, seeded with a pending review, a second pending review,
and one approval that was flipped before the trigger existed — the case the
back-fill has to catch.
