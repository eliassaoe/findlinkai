import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { findFollowedBadge } from './worker.js';

function makeKV(seed = {}) {
    const store = new Map(Object.entries(seed));
    return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}

function post(site_url, token = 'tok_abcdefgh') {
    return new Request('https://b.example.com/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_token: token, site_url })
    });
}

function serve(html, { status = 200, type = 'text/html', location = null } = {}) {
    global.fetch = async () => new Response(location ? '' : html, {
        status, headers: location ? { location } : { 'content-type': type }
    });
}

const BADGE = '<a href="https://linkfinderai.com/?ref=badge"><img src="/b.svg" alt="LinkFinder AI"></a>';

// --- rel parsing: the whole payout hinges on this ---

test('a plain link counts as followed', () => {
    assert.equal(findFollowedBadge(BADGE).found, true);
});

test('nofollow, sponsored and ugc each disqualify', () => {
    for (const rel of ['nofollow', 'sponsored', 'ugc', 'noopener nofollow', 'UGC']) {
        const html = `<a rel="${rel}" href="https://linkfinderai.com/">x</a>`;
        const r = findFollowedBadge(html);
        assert.equal(r.found, false, `rel="${rel}" should not count`);
        assert.equal(r.why, 'link_is_nofollow');
    }
});

test('harmless rel values still count as followed', () => {
    for (const rel of ['noopener', 'noreferrer', 'noopener noreferrer', '']) {
        assert.equal(findFollowedBadge(`<a rel="${rel}" href="https://linkfinderai.com/">x</a>`).found, true, rel);
    }
});

test('one followed link is enough even beside a nofollowed one', () => {
    const html = '<a rel="nofollow" href="https://linkfinderai.com/a">x</a>' + BADGE;
    assert.equal(findFollowedBadge(html).found, true);
});

test('links to other sites are ignored, and absence is reported as such', () => {
    const r = findFollowedBadge('<a href="https://example.com/linkfinderai.com">x</a>');
    assert.equal(r.found, false);
    assert.equal(r.why, 'no_link', 'a lookalike path must not count as our host');
});

test('subdomains of our host count', () => {
    assert.equal(findFollowedBadge('<a href="https://www.linkfinderai.com/x">x</a>').found, true);
});

// --- SSRF: these must be refused before any fetch happens ---

test('private, local and non-http targets are refused without fetching', async () => {
    const blocked = [
        'http://127.0.0.1/', 'http://localhost/', 'http://10.0.0.5/admin',
        'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/',
        'http://[::1]/', 'http://2130706433/', 'http://0x7f000001/',
        'file:///etc/passwd', 'gopher://x/', 'http://box.local/', 'http://svc.internal/',
        'http://user:pw@example.com/', 'http://nodot/'
    ];
    for (const url of blocked) {
        let fetched = false;
        global.fetch = async () => { fetched = true; return new Response(''); };
        const r = await worker.fetch(post(url), { BADGES: makeKV() });
        assert.equal(r.status, 400, `${url} should be rejected`);
        assert.equal(fetched, false, `${url} must never be fetched`);
    }
});

test('our own domain cannot be used to claim the badge', async () => {
    const r = await worker.fetch(post('https://linkfinderai.com/'), { BADGES: makeKV() });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).detail, 'own_site');
});

test('a redirect into private space is caught at the hop', async () => {
    let hop = 0;
    global.fetch = async () => {
        hop++;
        return hop === 1
            ? new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } })
            : new Response(BADGE, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    const r = await worker.fetch(post('https://good.example/'), { BADGES: makeKV() });
    const b = await r.json();
    assert.equal(b.verified, false);
    assert.equal(b.detail, 'ip_not_allowed', 'the redirect target must be re-validated');
});

// --- payout guards ---

test('a real followed badge verifies and is recorded once', async () => {
    const kv = makeKV();
    serve(BADGE);
    const r = await worker.fetch(post('https://mysite.example/'), { BADGES: kv });
    const b = await r.json();
    assert.equal(b.verified, true);
    assert.equal(b.domain, 'mysite.example');
    assert.ok(kv.store.has('badge:acct:tok_abcdefgh'));
    assert.ok(kv.store.has('badge:domain:mysite.example'));
});

test('the same account cannot claim twice', async () => {
    const kv = makeKV();
    serve(BADGE);
    await worker.fetch(post('https://mysite.example/'), { BADGES: kv });
    const r = await worker.fetch(post('https://other.example/'), { BADGES: kv });
    assert.equal(r.status, 409);
});

test('two accounts cannot claim the same domain', async () => {
    const kv = makeKV();
    serve(BADGE);
    await worker.fetch(post('https://shared.example/', 'tok_aaaaaaaa'), { BADGES: kv });
    const r = await worker.fetch(post('https://www.shared.example/', 'tok_bbbbbbbb'), { BADGES: kv });
    assert.equal(r.status, 409, 'www should normalise to the same domain');
});

test('a page without the badge does not pay out', async () => {
    const kv = makeKV();
    serve('<html><body>nothing here</body></html>');
    const b = await (await worker.fetch(post('https://bare.example/'), { BADGES: kv })).json();
    assert.equal(b.verified, false);
    assert.equal(b.error, 'no_link');
    assert.equal(kv.store.size, 0, 'a failed check must not burn the claim');
});

test('a nofollowed badge is refused with a distinguishable reason', async () => {
    serve('<a rel="nofollow" href="https://linkfinderai.com/">x</a>');
    const b = await (await worker.fetch(post('https://cheeky.example/'), { BADGES: makeKV() })).json();
    assert.equal(b.verified, false);
    assert.equal(b.error, 'link_is_nofollow', 'the user needs to know which fix to make');
});

test('non-html responses are refused', async () => {
    serve('{}', { type: 'application/json' });
    const b = await (await worker.fetch(post('https://api.example/'), { BADGES: makeKV() })).json();
    assert.equal(b.verified, false);
    assert.equal(b.detail, 'not_html');
});

test('a short token is refused before anything else', async () => {
    let fetched = false;
    global.fetch = async () => { fetched = true; return new Response(''); };
    const r = await worker.fetch(post('https://mysite.example/', 'short'), { BADGES: makeKV() });
    assert.equal(r.status, 401);
    assert.equal(fetched, false);
});
