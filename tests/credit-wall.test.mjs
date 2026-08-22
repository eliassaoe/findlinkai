import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pull the rescue block straight out of app.html so the test cannot drift from
// what ships. If the markers move, the test fails loudly rather than silently
// checking nothing.
const src = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const start = src.indexOf('const CIM_DISCOUNT_CODE');
const endMark = 'function cimRescueSupport() {';
const end = src.indexOf('}', src.indexOf('cimHardClose();', src.indexOf(endMark))) + 1;
assert.ok(start > 0 && end > start, 'could not locate the rescue block in app.html');
const block = src.slice(start, end);

function harness(overrides = {}) {
    const state = { captured: [], answerHtml: null, optsDisplay: '', closed: false };
    const answerEl = {
        innerHTML: '',
        classList: { add() {}, remove() {} },
        set _h(v) { this.innerHTML = v; }
    };
    const ctx = {
        isExistingSubscriber: false,
        creditsExhaustedTrigger: 'test',
        currentCredits: 0,
        sessionCreditsUsed: 42,
        posthog: { capture: (n, p) => state.captured.push({ n, p }) },
        document: {
            getElementById: (id) => {
                if (id === 'cimRescueAnswer') return answerEl;
                if (id === 'insufficientCreditsModal') return { classList: { remove() { state.closed = true; } } };
                return { style: {} };
            },
            querySelector: () => ({ style: { set display(v) { state.optsDisplay = v; } } }),
            body: { style: {} }
        },
        window: {},
        ...overrides
    };
    const fn = new Function(...Object.keys(ctx), block + '; return { cimRescuePick, cimRescueSupport, CIM_CALL_URL };');
    const api = fn(...Object.values(ctx));
    return { api, state, answerEl };
}

const CALENDLY = 'https://calendly.com/hamoureliasse/compensated-interview-unlimited-leads-clone';

for (const reason of ['price', 'unsure', 'stuck', 'looking']) {
    test(`rescue branch "${reason}" produces clean, closable html`, () => {
        const { api, state, answerEl } = harness();
        api.cimRescuePick(reason);

        const ev = state.captured.find(c => c.n === 'credits_wall_rescue_answered');
        assert.ok(ev, 'must record why they bailed');
        assert.equal(ev.p.reason, reason);

        const html = answerEl.innerHTML;
        assert.ok(html.length > 0, 'branch must say something');
        assert.ok(html.includes('cimHardClose()'), 'every branch needs a way out');
        // A stray unescaped quote would break the attribute and silently kill the CTA.
        assert.ok(!/onclick="[^"]*"[^">]*"/.test(html), 'malformed onclick attribute');
        assert.ok(!html.includes('&amp;mdash;'), 'double-escaped entity');
    });
}

test('the two call branches point at the real Calendly event', () => {
    for (const reason of ['price', 'unsure']) {
        const { api, answerEl } = harness();
        api.cimRescuePick(reason);
        assert.ok(answerEl.innerHTML.includes(CALENDLY), `${reason} must offer the call`);
    }
});

test('no discount is advertised until a real code is configured', () => {
    const { api, answerEl } = harness();
    api.cimRescuePick('price');
    assert.ok(!/code <strong>/.test(answerEl.innerHTML),
        'an unset CIM_DISCOUNT_CODE must never render a coupon line');
});

test('support falls back to mail when no widget is present', () => {
    let navigated = null;
    const { api, state } = harness({
        window: { location: { set href(v) { navigated = v; } } }
    });
    api.cimRescueSupport();
    const ev = state.captured.find(c => c.n === 'credits_wall_rescue_cta_clicked');
    assert.equal(ev.p.via, 'mail');
});

test('support uses the widget when one is present', () => {
    let opened = false;
    const { api, state } = harness({
        window: { lfOpenSupportChat: () => { opened = true; }, location: { href: '' } }
    });
    api.cimRescueSupport();
    assert.ok(opened, 'should prefer the in-app widget');
    const ev = state.captured.find(c => c.n === 'credits_wall_rescue_cta_clicked');
    assert.equal(ev.p.via, 'widget');
});
