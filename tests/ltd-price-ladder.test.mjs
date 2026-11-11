// Black Friday 2026 price ladder + Agency tier (docs/black-friday-ltd-2026.md, "Price ladder").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../lifetime-deal.html', import.meta.url), 'utf8');
const mig = readFileSync(new URL('../supabase/migrations/20261111230000_ltd_price_ladder.sql', import.meta.url), 'utf8');

test('the page has the three tiers and shows the next price step', () => {
  for (const k of ['ltd_core', 'ltd_plus', 'ltd_agency']) assert.match(page, new RegExp(`data-buy="${k}"`));
  assert.match(page, /t\.left_at_price \+ ' left at \$' \+ fmt\(t\.price\) \+ ', then \$' \+ fmt\(t\.next_price\)/);
  assert.match(page, /Pay once for your sourcing tool/);
});

test('the ladder: Core 149/179/199, Plus 299, Agency 599/699/799', () => {
  assert.match(mig, /'ltd_core',\s+1, 50,\s+149\)/);
  assert.match(mig, /'ltd_core',\s+2, 100,\s+179\)/);
  assert.match(mig, /'ltd_core',\s+3, null, 199\)/);
  assert.match(mig, /'ltd_plus',\s+1, null, 299\)/);
  assert.match(mig, /'ltd_agency', 1, 10,\s+599\)/);
  assert.match(mig, /'ltd_agency', 2, 25,\s+699\)/);
  assert.match(mig, /'ltd_agency', 3, null, 799\)/);
});

test('n8n asks the database for the credits; Agency resets instead of rolling over', () => {
  assert.match(mig, /create or replace function ltd_credits_for_product\(p_product text\)/);
  assert.match(mig, /when ltd_monthly_credits = 25000\s+then greatest\(coalesce\(credits, 0\), 25000\)/);
});

test('every sale carries its channel: last click + first touch go to Dodo', () => {
  assert.match(page, /source: qs\.get\('utm_source'\) \|\| LA\.last_utm_source \|\| LA\.last_referrer_domain \|\| 'direct'/);
  assert.match(page, /u\.searchParams\.set\('metadata_first_source', attribution\.first_source\)/);
  const t = readFileSync(new URL('../supabase/migrations/20261111233000_ltd_sales_tracking.sql', import.meta.url), 'utf8');
  assert.match(t, /create table if not exists ltd_sales/);
  assert.match(t, /create or replace view ltd_sales_by_channel/);
  assert.match(t, /revoke all on ltd_sales_by_channel from public, anon, authenticated/);
});
