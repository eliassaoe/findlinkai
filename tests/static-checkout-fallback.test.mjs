// The static payment-link fallback in app.html. Two invariants matter more
// than anything else here:
//
//   1. With every DODO_PAYMENT_LINKS value empty and FORCE_STATIC_CHECKOUT
//      false (the shipped state), the worker path behaves exactly as before:
//      the worker is called, the redirect happens, and the stall toast offers
//      the session URL.
//   2. With a link filled in and the switch on, the worker is never called and
//      the buyer lands on the static link with the account token in the
//      metadata_ query parameters - without that the payment webhook cannot
//      credit the account.
//
// launchCheckout() is evaluated in a stubbed browser so both can be exercised
// without a browser or a network.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

const slice = (from, to) => {
    const a = app.indexOf(from); assert.ok(a !== -1, `missing: ${from}`);
    const b = app.indexOf(to, a); assert.ok(b !== -1, `missing: ${to}`);
    return app.slice(a, b);
};

test('shipped configuration: switch off, any filled link is a Dodo static link', () => {
    const cfg = slice('const DODO_PAYMENT_LINKS = {', 'const FORCE_STATIC_CHECKOUT');
    const values = [...cfg.matchAll(/^\s*(\w+):\s*'([^']*)',/gm)];
    const keys = values.map(m => m[1]);
    assert.deepEqual(keys, ['payg_small','payg_medium','payg_large','starter_monthly','starter_annual','pro_monthly','pro_annual','enterprise_monthly','enterprise_annual']);
    for (const [, key, url] of values) if (url) assert.match(url, /^https:\/\/checkout\.dodopayments\.com\/buy\/pdt_[A-Za-z0-9]+$/, `${key} link must be a Dodo static payment link`);
    assert.match(app, /const FORCE_STATIC_CHECKOUT = (true|false);/);
});

test('every plan key launchCheckout can receive has a slot in DODO_PAYMENT_LINKS', () => {
    const cfg = slice('const DODO_PAYMENT_LINKS = {', 'const FORCE_STATIC_CHECKOUT');
    for (const plan of ['starter','pro','enterprise']) for (const b of ['monthly','annual']) {
        assert.match(cfg, new RegExp(`\\b${plan}_${b}:`));
    }
    for (const pack of ['payg_small','payg_medium','payg_large']) assert.match(cfg, new RegExp(`\\b${pack}:`));
    assert.match(app, /plan\.key \+ \(billingMode === 'annual' \? '_annual' : '_monthly'\)/);
});

test('stall timer is 3.5s and the validation allow-list is untouched', () => {
    assert.match(app, /\}, 3500\);\n\n    \} catch \(e\) \{/);
    assert.doesNotMatch(app, /\}, 5000\);\n\n    \} catch \(e\) \{/);
    assert.match(app, /u\.hostname === 'checkout\.dodopayments\.com' \|\|\n\s+u\.hostname\.endsWith\('\.dodopayments\.com'\)/);
});

// ---- behavioural: run launchCheckout in a stubbed browser ----------------

function boot({ links = {}, force = false, workerImpl, visible = true } = {}) {
    const src = [
        slice('function validateCheckoutUrl(url) {', '// ===== Checkout hand-off telemetry ====='),
        slice('const PENDING_CHECKOUT_KEY', 'function clearPendingCheckout'),
        slice('const DODO_PAYMENT_LINKS = {', 'const INDUSTRY_AVG_PER_CREDIT'),
        slice('function showCheckoutError(message, opts = {}) {', 'async function launchCheckout('),
        slice('async function launchCheckout(', '// The checkout worker builds a return_url'),
    ].join('\n')
      .replace(/const DODO_PAYMENT_LINKS = \{[\s\S]*?\};/, 'const DODO_PAYMENT_LINKS = ' + JSON.stringify(links) + ';')
      .replace(/const FORCE_STATIC_CHECKOUT = (true|false);/, `const FORCE_STATIC_CHECKOUT = ${force};`);

    const events = [];
    const timers = [];
    const state = { href: null, workerCalls: [], toasts: [] };
    const el = { innerHTML: '', style: {}, remove() {}, };
    const ctx = {
        console: { error() {}, log() {} },
        userToken: 'tok_1234567890', lastCheckoutAttemptId: null, checkoutInFlight: false, currentCredits: 0, isExistingSubscriber: false,
        genCheckoutId: () => 'att_1',
        posthog: { capture: (n, p) => events.push([n, p]) },
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
        clearTimeout() {},
        Promise, URL, JSON, Date, Error, String, RegExp,
        localStorage: { setItem() {}, removeItem() {}, getItem() { return null; } },
        sessionStorage: { setItem() {}, getItem() { return null; } },
        window: { location: { get href() { return state.href; }, set href(v) { state.href = v; }, origin: 'https://linkfinderai.com' }, currentUserEmail: 'buyer@example.com' },
        document: { visibilityState: visible ? 'visible' : 'hidden', getElementById: () => el, createElement: () => el, body: { appendChild() {} } },
        fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
        waitForUserEmail: async () => 'buyer@example.com',
        backupAuthToken() {},
        showAlert() {},
        createCheckoutSessionViaWorker: async (planKey, email) => { state.workerCalls.push([planKey, email]); return workerImpl(planKey); },
    };
    ctx.window.posthog = ctx.posthog;
    vm.createContext(ctx);
    // captureBeforeUnload awaits a 250ms setTimeout; resolve it immediately.
    vm.runInContext(src.replace("await new Promise(r => setTimeout(r, 250));", ''), ctx);
    const toastText = () => el.innerHTML;
    return { ctx, events, timers, state, toastText };
}

const SESSION = 'https://checkout.dodopayments.com/session/cks_test';
const LINK = 'https://checkout.dodopayments.com/buy/pdt_small';

test('no links + switch off: worker called, redirect to session, stall toast offers the session URL', async () => {
    const t = boot({ workerImpl: async () => ({ checkout_url: SESSION, env: 'live' }) });
    await t.ctx.launchCheckout({ planKey: 'payg_small', analyticsPlanName: 'PAYG Small', value: 25, billingLabel: 'payg', btnEl: null });
    assert.deepEqual(t.state.workerCalls, [['payg_small', 'buyer@example.com']]);
    assert.equal(t.state.href, SESSION);
    const names = t.events.map(e => e[0]);
    assert.deepEqual(names.filter(n => n.startsWith('checkout_')), ['checkout_worker_request_started', 'checkout_session_created', 'checkout_redirect_started']);
    assert.ok(!names.includes('checkout_static_link_used'));
    const stall = t.timers.find(x => x.ms === 3500);
    assert.ok(stall, 'stall timer armed at 3500ms');
    stall.fn();
    assert.ok(t.events.some(e => e[0] === 'checkout_redirect_stalled'));
    assert.ok(!t.events.some(e => e[0] === 'checkout_static_fallback_shown'));
    assert.match(t.toastText(), new RegExp(`href="${SESSION}"`));
});

test('link filled + switch on: worker never called, buyer sent to the static link with metadata', async () => {
    const t = boot({ links: { payg_small: LINK }, force: true, workerImpl: async () => { throw new Error('must not be called'); } });
    await t.ctx.launchCheckout({ planKey: 'payg_small', analyticsPlanName: 'PAYG Small', value: 25, billingLabel: 'payg', btnEl: null });
    assert.deepEqual(t.state.workerCalls, []);
    const u = new URL(t.state.href);
    assert.equal(u.origin + u.pathname, LINK);
    assert.equal(u.searchParams.get('quantity'), '1');
    assert.equal(u.searchParams.get('redirect_url'), 'https://linkfinderai.com/app');
    assert.equal(u.searchParams.get('metadata_user_token'), 'tok_1234567890');
    assert.equal(u.searchParams.get('metadata_plan_key'), 'payg_small');
    assert.equal(u.searchParams.get('email'), 'buyer@example.com');
    assert.ok(t.events.some(e => e[0] === 'checkout_static_link_used' && e[1].plan_key === 'payg_small'));
    assert.ok(!t.events.some(e => e[0] === 'checkout_worker_request_started'));
});

test('switch on but no link for this plan: falls through to the worker', async () => {
    const t = boot({ links: { payg_small: LINK }, force: true, workerImpl: async () => ({ checkout_url: SESSION, env: 'live' }) });
    await t.ctx.launchCheckout({ planKey: 'pro_monthly', analyticsPlanName: 'Professional', value: 89, billingLabel: 'monthly', btnEl: null });
    assert.equal(t.state.workerCalls.length, 1);
    assert.equal(t.state.href, SESSION);
});

test('link filled + switch off: worker path first, stall toast offers the static link', async () => {
    const t = boot({ links: { payg_small: LINK }, workerImpl: async () => ({ checkout_url: SESSION, env: 'live' }) });
    await t.ctx.launchCheckout({ planKey: 'payg_small', analyticsPlanName: 'PAYG Small', value: 25, billingLabel: 'payg', btnEl: null });
    assert.equal(t.state.href, SESSION);
    t.timers.find(x => x.ms === 3500).fn();
    assert.ok(t.events.some(e => e[0] === 'checkout_static_fallback_shown' && e[1].reason === 'redirect_stalled'));
    assert.match(t.toastText(), /href="https:\/\/checkout\.dodopayments\.com\/buy\/pdt_small\?quantity=1/);
    assert.doesNotMatch(t.toastText(), new RegExp(SESSION));
});

test('worker throws: toast offers retry plus the static link when one exists, retry only otherwise', async () => {
    const withLink = boot({ links: { payg_small: LINK }, workerImpl: async () => { throw new Error('Checkout session failed (502)'); } });
    await withLink.ctx.launchCheckout({ planKey: 'payg_small', analyticsPlanName: 'PAYG Small', value: 25, billingLabel: 'payg', btnEl: null });
    assert.equal(withLink.state.href, null);
    assert.match(withLink.toastText(), /checkoutErrorRetryBtn/);
    assert.match(withLink.toastText(), /buy\/pdt_small/);
    assert.ok(withLink.events.some(e => e[0] === 'checkout_static_fallback_shown' && e[1].reason === 'worker_error'));
    assert.equal(withLink.ctx.checkoutInFlight, false);

    const noLink = boot({ workerImpl: async () => { throw new Error('Checkout session failed (502)'); } });
    await noLink.ctx.launchCheckout({ planKey: 'payg_small', analyticsPlanName: 'PAYG Small', value: 25, billingLabel: 'payg', btnEl: null });
    assert.match(noLink.toastText(), /checkoutErrorRetryBtn/);
    assert.doesNotMatch(noLink.toastText(), /Continue to payment page/);
    assert.ok(!noLink.events.some(e => e[0] === 'checkout_static_fallback_shown'));
});

test('a link on a non-Dodo host is ignored, never navigated to', async () => {
    const t = boot({ links: { payg_small: 'https://evil.example.com/buy/x' }, force: true, workerImpl: async () => ({ checkout_url: SESSION, env: 'live' }) });
    await t.ctx.launchCheckout({ planKey: 'payg_small', analyticsPlanName: 'PAYG Small', value: 25, billingLabel: 'payg', btnEl: null });
    assert.equal(t.state.href, SESSION);
    assert.ok(t.events.some(e => e[0] === 'checkout_static_link_invalid'));
});
