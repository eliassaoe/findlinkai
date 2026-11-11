import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// docs/partner-ltd-codes.md (InfoStack, 11 Nov 2026). No real code ever goes
// in this repo: it is public.

const page = readFileSync(new URL('../redeem-code.html', import.meta.url), 'utf8');

test('the redeem page sends AppSumo and InfoStack codes to the Supabase RPC', () => {
    assert.match(page, /if \(\/\^LF\(AS\|IS\)-\/i\.test\(code\)\)/);
    assert.match(page, /rpc\/appsumo_redeem/);
});

test('/redeem forwards to /redeem-code and keeps the code', () => {
    const r = readFileSync(new URL('../redeem.html', import.meta.url), 'utf8');
    assert.match(r, /location\.replace\('\/redeem-code' \+ location\.search/);
    assert.match(r, /noindex/);
});

test('the migration grants a monthly lifetime allowance for partner codes', () => {
    const m = readFileSync(new URL('../supabase/migrations/20261111200000_partner_ltd_codes.sql', import.meta.url), 'utf8');
    assert.match(m, /ltd_monthly_credits = coalesce\(ltd_monthly_credits, 0\) \+ k\.monthly_credits/);
    assert.match(m, /revoke all on function public\.partner_generate_ltd_codes/);
});

test('no LFIS or LFAS code is committed anywhere in the docs', () => {
    for (const f of ['../docs/partner-ltd-codes.md', '../docs/appsumo-codes.md']) {
        if (!existsSync(new URL(f, import.meta.url))) continue;
        const t = readFileSync(new URL(f, import.meta.url), 'utf8');
        assert.doesNotMatch(t, /LF(IS|AS)-(?!XXXX)[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}/);
    }
});
