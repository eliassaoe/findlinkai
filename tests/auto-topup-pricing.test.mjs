/**
 * One price list, in four files.
 *
 * Auto top-up shipped with its own pack table and nothing ever compared it to
 * the packs the product actually sells. It charged $19 for 5,000 credits while
 * the same credits cost $200 through pay-as-you-go — 8x under — and its top pack
 * ($149 for 60,000) beat the Enterprise plan ($149/month for 50,000) outright,
 * so the rational move for a heavy customer was to cancel their subscription.
 *
 * Nothing was misconfigured. The frontend, the charge worker and the summary
 * line all agreed with each other. They just all disagreed with the real prices,
 * because a second price list existed and drifted.
 *
 * These tests read the real numbers out of each file and fail if any two
 * disagree, so a second price list cannot drift again.
 *
 * Run: node --test tests/auto-topup-pricing.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(join(REPO, f), 'utf8');

/** The pay-as-you-go packs as app.html renders them — the source of truth. */
function paygPacks(file) {
    const page = read(file);
    const at = page.indexOf('const packs = [');
    assert.ok(at > 0, `${file} no longer declares the PAYG packs`);
    const body = page.slice(at, page.indexOf('];', at));
    const rows = [...body.matchAll(/credits:\s*(\d+),\s*price:\s*(\d+)/g)];
    assert.strictEqual(rows.length, 3, `${file} should list exactly 3 PAYG packs`);
    return rows.map((m) => ({ credits: Number(m[1]), price: Number(m[2]) }));
}

/** The charge worker's table — the only figures a customer's card ever sees. */
function workerPacks() {
    const src = read('workers/auto-topup-charge/worker.js');
    const at = src.indexOf('const TOPUP_PACKS = {');
    assert.ok(at > 0, 'the charge worker no longer declares TOPUP_PACKS');
    const body = src.slice(at, src.indexOf('};', at));
    const rows = [...body.matchAll(/(\w+):\s*\{\s*credits:\s*(\d+),\s*amount_cents:\s*(\d+)\s*\}/g)];
    return rows.map((m) => ({ key: m[1], credits: Number(m[2]), price: Number(m[3]) / 100 }));
}

/** What the account page offers, which is what the user agrees to. */
function accountPacks() {
    const page = read('account.html');
    const at = page.indexOf('const ATU_PACKS = [');
    assert.ok(at > 0, 'account.html no longer declares ATU_PACKS');
    const body = page.slice(at, page.indexOf('];', at));
    const rows = [...body.matchAll(/key:\s*'(\w+)',\s*credits:\s*(\d+),\s*price:\s*(\d+)/g)];
    return rows.map((m) => ({ key: m[1], credits: Number(m[2]), price: Number(m[3]) }));
}

const shape = (packs) => packs.map((p) => `${p.credits}/${p.price}`).join(' ');

// ---------------------------------------------------------------------------
// 1. The tables agree
// ---------------------------------------------------------------------------

test('auto top-up charges the pay-as-you-go prices', () => {
    const payg = paygPacks('app.html');
    assert.strictEqual(shape(workerPacks()), shape(payg),
        'the charge worker is selling credits at a price the product does not');
    assert.strictEqual(shape(accountPacks()), shape(payg),
        'the account page offers a price the charge worker will not honour');
});

test('app.html and account.html quote the same PAYG packs', () => {
    assert.strictEqual(shape(paygPacks('account.html')), shape(paygPacks('app.html')));
});

test('the pack keys match the checkout products, in both places', () => {
    const expected = ['payg_small', 'payg_medium', 'payg_large'];
    assert.deepStrictEqual(workerPacks().map((p) => p.key), expected);
    assert.deepStrictEqual(accountPacks().map((p) => p.key), expected);

    // The same keys the one-off checkout already uses, so there is one product
    // vocabulary rather than two.
    const app = read('app.html');
    for (const key of expected) {
        assert.ok(app.includes(`'${key}'`), `${key} is not a checkout product key in app.html`);
    }
});

test('the old mis-priced keys are gone, so a stale setting charges nothing', () => {
    const src = read('workers/auto-topup-charge/worker.js');
    const table = src.slice(src.indexOf('const TOPUP_PACKS = {'), src.indexOf('};', src.indexOf('const TOPUP_PACKS = {')));
    for (const dead of ['small:', 'medium:', 'large:']) {
        assert.ok(!table.includes(' ' + dead), `${dead} still resolves — a settings record written before the reprice would charge`);
    }
    // An unknown key must not fall through to a default.
    assert.match(src, /if \(!pack\) return json\(\{ error: 'Invalid pack_key on settings' \}, 400\);/);
});

// ---------------------------------------------------------------------------
// 2. The prices are sane against the rest of the pricing
// ---------------------------------------------------------------------------

test('auto top-up never beats a subscription on price per credit', () => {
    // If topping up is cheaper per credit than a plan, the best move for a heavy
    // customer is to cancel the plan. That is what the old table did: $149 bought
    // 60,000 credits, against Enterprise's 50,000 for $149 a month.
    const PLANS = [
        { name: 'Starter',      price: 49,  credits: 5000 },
        { name: 'Professional', price: 89,  credits: 20000 },
        { name: 'Enterprise',   price: 149, credits: 50000 },
    ];
    const bestPlanRate = Math.min(...PLANS.map((p) => p.price / p.credits));

    for (const pack of workerPacks()) {
        const rate = pack.price / pack.credits;
        assert.ok(rate > bestPlanRate,
            `${pack.key} costs $${rate.toFixed(4)}/credit, at or under the best plan rate ` +
            `($${bestPlanRate.toFixed(4)}) — topping up would be cheaper than subscribing`);
    }
});

test('a bigger pack is better value, and no pack is a rounding error', () => {
    const packs = workerPacks();
    for (let i = 1; i < packs.length; i++) {
        assert.ok(packs[i].credits > packs[i - 1].credits, 'packs must ascend by credits');
        assert.ok(packs[i].price / packs[i].credits <= packs[i - 1].price / packs[i - 1].credits,
            `${packs[i].key} costs more per credit than the smaller pack below it`);
    }
    for (const pack of packs) {
        assert.ok(pack.price >= 1 && pack.price <= 500,
            `$${pack.price} is outside the range that belongs on an automatic charge`);
    }
});

// ---------------------------------------------------------------------------
// 3. What the page tells the user before it charges them
// ---------------------------------------------------------------------------

test('the summary names the exact amount and the exact credits', () => {
    const page = read('account.html');
    const at = page.indexOf('function atuSummaryText(');
    assert.ok(at > 0, 'account.html no longer builds a summary sentence');
    const body = page.slice(at, page.indexOf('\n}', at));

    assert.match(body, /pk\.price/, 'the summary must state the amount that will be charged');
    assert.match(body, /pk\.credits/, 'the summary must state what that buys');
    assert.match(body, /threshold/, 'the summary must state when it fires');
    assert.match(body, /turn this off/i, 'the summary must say it can be turned off');
});

test('the setting has one home, not two', () => {
    // Two UIs over one KV record is how the price lists drifted apart.
    const api = read('api-access.html');
    assert.ok(!api.includes('atuPacksGrid'),
        'api-access.html still renders its own pack picker');
    assert.ok(!api.includes('saveAutoTopupSettings'),
        'api-access.html still has its own save path into the settings worker');
    assert.match(api, /Set up auto top-up/,
        'api-access.html should still point API users at the setting');
    assert.ok(read('account.html').includes('ATU_PACKS'),
        'account.html should own the auto top-up UI');
});

// ---------------------------------------------------------------------------
// 4. It is findable
// ---------------------------------------------------------------------------

test('running low tells you auto top-up exists', () => {
    const app = read('app.html');
    const at = app.indexOf('function updateLowCreditsWarning(');
    assert.ok(at > 0, 'app.html no longer has a low-credit warning');
    const body = app.slice(at, app.indexOf('\n}', at));
    assert.match(body, /auto top-up/i,
        'the low-credit bar is the one moment this is worth offering');
    assert.match(app, /function goToAutoTopup\(\)/);
    assert.match(app, /#auto-topup/, 'the link should open the panel, not just the page');
    assert.match(read('account.html'), /window\.location\.hash === '#auto-topup'/,
        'account.html must act on the #auto-topup hash the app sends');
});

test('the billing row says what is on without opening anything', () => {
    const page = read('account.html');
    const at = page.indexOf('function atuRowText(');
    assert.ok(at > 0, 'account.html no longer summarises auto top-up on the row');
    const body = page.slice(at, page.indexOf('\n}', at));
    assert.match(body, /card_failed/, 'a declined card is the state most worth surfacing');
    assert.match(body, /settings\.threshold/);
});
