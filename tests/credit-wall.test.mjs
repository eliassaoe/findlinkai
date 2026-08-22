import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pull the rescue block straight out of app.html so the test cannot drift from
// what ships. If the markers move, this fails loudly rather than silently
// checking nothing.
const src = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const start = src.indexOf('const CIM_DISCOUNT_WORKER');
const endMark = 'function cimRescueSupport() {';
const end = src.indexOf('}', src.indexOf('cimHardClose();', src.indexOf(endMark))) + 1;
assert.ok(start > 0 && end > start, 'could not locate the rescue block in app.html');
const block = src.slice(start, end);

const CALENDLY = 'https://calendly.com/hamoureliasse/compensated-interview-unlimited-leads-clone';

function harness({ store = {}, session = {}, subscriber = false, fetchImpl = null, geoTier = 'standard', ...overrides } = {}) {
    const state = { captured: [], closed: false };
    const answerEl = { innerHTML: '', classList: { add() {}, remove() {} } };
    const ctx = {
        isExistingSubscriber: subscriber,
        creditsExhaustedTrigger: 'test',
        currentCredits: 0,
        sessionCreditsUsed: 42,
        userToken: 'tok_abcdefgh',
        otpGeoTier: geoTier,
        cimSeeSubscriptionPlans: () => {},
        openOnboardingTasksPopupManually: () => {},
        posthog: { capture: (n, p) => state.captured.push({ n, p }) },
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = v; }
        },
        sessionStorage: {
            getItem: (k) => (k in session ? session[k] : null),
            setItem: (k, v) => { session[k] = v; }
        },
        fetch: fetchImpl || (async () => { throw new Error('offline'); }),
        document: {
            getElementById: (id) => {
                if (id === 'cimRescueAnswer') return answerEl;
                if (id === 'insufficientCreditsModal') return { classList: { add() {}, remove() { state.closed = true; } } };
                return { style: {} };
            },
            querySelector: () => ({ style: {} }),
            body: { style: {} }
        },
        window: {},
        ...overrides
    };
    const fn = new Function(...Object.keys(ctx),
        block + '; return { cimRescuePick, cimPriceBranch, cimQualifiesForDiscount, cimRescueSupport, cimOpenRescue };');
    return { api: fn(...Object.values(ctx)), state, answerEl, session };
}

const okWorker = async () => ({
    ok: true,
    json: async () => ({
        code: 'LF40ABCD2345',
        percent_off: 40,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        reused: false
    })
});

test('every branch says something and offers a way out', async () => {
    for (const reason of ['unsure', 'stuck', 'looking']) {
        const { api, state, answerEl } = harness();
        api.cimRescuePick(reason);
        const ev = state.captured.find(c => c.n === 'credits_wall_rescue_answered');
        assert.equal(ev.p.reason, reason);
        assert.ok(answerEl.innerHTML.includes('cimHardClose()'), `${reason} needs a close`);
        assert.ok(!answerEl.innerHTML.includes('&amp;mdash;'), 'double-escaped entity');
    }
});

test('the call branches point at the real Calendly event', () => {
    const { api, answerEl } = harness();
    api.cimRescuePick('unsure');
    assert.ok(answerEl.innerHTML.includes(CALENDLY));
});

// --- the discount gate: this is the expensive one, so it must stay shut ---

test('a first-time waller gets no discount, only the pack and the call', async () => {
    let called = false;
    const { api, answerEl } = harness({
        store: { lf_wall_hits: '1' },
        fetchImpl: async () => { called = true; return okWorker(); }
    });
    assert.equal(api.cimQualifiesForDiscount(), false);
    await api.cimPriceBranch();
    assert.equal(called, false, 'must not even ask the worker for an unqualified user');
    assert.ok(answerEl.innerHTML.includes(CALENDLY));
    assert.ok(!/40%/.test(answerEl.innerHTML));
});

test('a subscriber never qualifies, however many walls they hit', () => {
    const { api } = harness({ subscriber: true, store: { lf_wall_hits: '9', lf_plan_selected_ever: '1' } });
    assert.equal(api.cimQualifiesForDiscount(), false);
});

test('a second wall hit qualifies', () => {
    const { api } = harness({ store: { lf_wall_hits: '2' } });
    assert.equal(api.cimQualifiesForDiscount(), true);
});

test('having picked a plan and not paid qualifies immediately', () => {
    const { api } = harness({ store: { lf_wall_hits: '1', lf_plan_selected_ever: '1' } });
    assert.equal(api.cimQualifiesForDiscount(), true);
});

test('a qualified user is shown the real minted code and the PAYG exclusion', async () => {
    const { api, state, answerEl } = harness({ store: { lf_wall_hits: '2' }, fetchImpl: okWorker });
    await api.cimPriceBranch();
    assert.ok(answerEl.innerHTML.includes('LF40ABCD2345'), 'must show the code Dodo returned');
    assert.ok(/40%/.test(answerEl.innerHTML));
    assert.ok(/not to the credit packs/i.test(answerEl.innerHTML),
        'must say the code excludes PAYG');
    assert.ok(/expires in 24 hours/.test(answerEl.innerHTML));
    assert.ok(state.captured.some(c => c.n === 'discount_code_issued'));
});

test('a worker failure falls back rather than promising a code that does not exist', async () => {
    for (const impl of [
        async () => { throw new Error('network'); },
        async () => ({ ok: false, json: async () => ({ error: 'already_subscribed' }) }),
        async () => ({ ok: true, json: async () => ({}) })
    ]) {
        const { api, state, answerEl } = harness({ store: { lf_wall_hits: '3' }, fetchImpl: impl });
        await api.cimPriceBranch();
        assert.ok(answerEl.innerHTML.includes(CALENDLY), 'must fall back to the call');
        assert.ok(!/LF40/.test(answerEl.innerHTML), 'must not show a code');
        assert.ok(state.captured.some(c => c.n === 'discount_code_failed'));
    }
});

test('support falls back to mail when no widget is present', () => {
    const { api, state } = harness({ window: { location: { set href(v) {} } } });
    api.cimRescueSupport();
    assert.equal(state.captured.find(c => c.n === 'credits_wall_rescue_cta_clicked').p.via, 'mail');
});


// --- the other paywalls: bulk export gate and returning at zero ---

test('the bulk export gate opens the rescue, tagged as its own source', () => {
    const { api, state } = harness();
    assert.equal(api.cimOpenRescue('bulk_export'), true);
    const ev = state.captured.find(c => c.n === 'credits_wall_rescue_shown');
    assert.equal(ev.p.source, 'bulk_export');
});

test('the reason is recorded against the gate it came from, not pooled', () => {
    const { api, state } = harness();
    api.cimOpenRescue('zero_balance');
    api.cimRescuePick('stuck');
    const ev = state.captured.find(c => c.n === 'credits_wall_rescue_answered');
    assert.equal(ev.p.source, 'zero_balance');
    assert.equal(ev.p.reason, 'stuck');
});

test('subscribers are never asked', () => {
    const { api, state } = harness({ subscriber: true });
    assert.equal(api.cimOpenRescue('bulk_export'), false);
    assert.equal(state.captured.length, 0);
});

test('someone who just picked a plan is not interrupted', () => {
    const { api } = harness({ window: { __lfPlanSelectedThisSession: true } });
    assert.equal(api.cimOpenRescue('bulk_export'), false);
});

test('it asks once per session, not at every gate', () => {
    const session = {};
    const first = harness({ session });
    assert.equal(first.api.cimOpenRescue('bulk_export'), true);
    const second = harness({ session });
    assert.equal(second.api.cimOpenRescue('zero_balance'), false,
        'a second gate in the same session must not re-ask');
});


// --- the tier that cannot buy is offered work, not a discount ---

test('low_conversion is offered credits to earn, never a discount', async () => {
    let workerCalled = false;
    const { api, state, answerEl } = harness({
        geoTier: 'low_conversion',
        store: { lf_wall_hits: '5', lf_plan_selected_ever: '1' },   // would otherwise qualify
        fetchImpl: async () => { workerCalled = true; return okWorker(); }
    });
    await api.cimPriceBranch();

    assert.equal(workerCalled, false, 'must not mint a code for someone who cannot buy at all');
    assert.ok(!/LF40/.test(answerEl.innerHTML), 'no discount code');
    assert.ok(/1,000 credits/.test(answerEl.innerHTML), 'must name the G2 reward');
    assert.ok(/earn/i.test(answerEl.innerHTML));
    assert.ok(answerEl.innerHTML.includes('openOnboardingTasksPopupManually()'),
        'must open the task list that already exists');
    assert.ok(state.captured.some(c => c.n === 'credits_wall_earn_offered'));
});

test('standard tier is unaffected by the earn branch', async () => {
    const { api, answerEl } = harness({ store: { lf_wall_hits: '2' }, fetchImpl: okWorker });
    await api.cimPriceBranch();
    assert.ok(/LF40ABCD2345/.test(answerEl.innerHTML), 'standard still gets the code');
    assert.ok(!/1,000 credits/.test(answerEl.innerHTML));
});
