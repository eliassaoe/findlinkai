// Referral capture (workers/referral/README.md). Pins the three places a
// referral used to be silently dropped between an affiliate's link and
// POST /attribute: landing pages other than index, the Google signup redirect,
// and email signups that only ever had the code in a cookie.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const attribution = read('js/lf-attribution.js');

function land(url, { stored = {}, cookie = '' } = {}) {
    const u = new URL(url);
    let jar = cookie;
    const cookies = [];
    const calls = [];
    const m = new Map(Object.entries(stored));
    const store = () => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) });
    const posthog = {
        register: () => {}, unregister: () => {}, people: { set: () => {} },
        register_once: (p) => calls.push(['register_once', p]),
        capture: (e, p) => calls.push(['capture', e, p]),
    };
    const document = {
        referrer: '',
        get cookie() { return jar; },
        set cookie(v) { cookies.push(v); jar = v.split(';')[0]; },
        write: () => {},
    };
    const window = {
        location: { href: u.href, search: u.search, pathname: u.pathname, hostname: u.hostname, protocol: u.protocol },
        localStorage: store(), sessionStorage: { getItem: () => null, setItem: () => {} }, posthog,
    };
    vm.runInNewContext(attribution, { window, document, URL, URLSearchParams, JSON, Date, Object, Array, Promise });
    return { local: m, cookies, calls };
}

test('a partner code on any landing page is stored first-touch', () => {
    const r = land('https://linkfinderai.com/phantombuster-alternative?ref=abc123xy');
    assert.equal(r.local.get('lf_ref'), 'abc123xy');
    assert.ok(r.cookies.some((c) => c.startsWith('lf_ref=abc123xy') && c.includes('domain=.linkfinderai.com')));
    assert.ok(r.calls.some(([k, e]) => k === 'capture' && e === 'referral_link_landed'));
    assert.ok(r.calls.some(([k, p]) => k === 'register_once' && p.referral_code === 'abc123xy'));
});

test('a second code never overwrites the first', () => {
    const r = land('https://linkfinderai.com/?ref=zzzzzz99', { stored: { lf_ref: 'abc123xy' } });
    assert.equal(r.local.get('lf_ref'), 'abc123xy');
    assert.equal(r.cookies.filter((c) => c.startsWith('lf_ref=')).length, 0);
});

test('v1 marketing tags and junk are not treated as partner codes', () => {
    for (const ref of ['ph', 'poweredbyai?utm_source=x', '<script>', 'A'.repeat(40)]) {
        const r = land('https://linkfinderai.com/?ref=' + encodeURIComponent(ref));
        assert.equal(r.local.get('lf_ref'), undefined, ref);
    }
});

test('the Google signup redirect no longer clears the code before /app attributes it', () => {
    const page = read('confirmation-signup.html');
    assert.ok(!/localStorage\.removeItem\('lf_ref'\)/.test(page));
});

test('/app falls back to the cookie and validates the code before /attribute', () => {
    const app = read('app.html');
    const fn = app.slice(app.indexOf('async function lfAttributeReferral'), app.indexOf('const UTM_KEYS'));
    assert.match(fn, /lf_ref=\(\[\^;\]\+\)/);
    assert.match(fn, /\^\[a-z0-9\]\{6,24\}\$/);
    assert.match(fn, /referred_by_code/);
});
