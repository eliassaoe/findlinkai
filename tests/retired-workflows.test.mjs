import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');
const htmlFiles = (dir) => readdirSync(root + dir).filter((f) => f.endsWith('.html')).map((f) => `${dir}/${f}`);

const RETIRED = [...htmlFiles('workflow'), 'clusters/workflows.html'];

test('the Workflows app page and its templates are gone', () => {
    for (const p of ['app-workflows.html', 'workflows']) {
        assert.equal(existsSync(root + p), false, `${p} is back`);
    }
});

test('nothing in the repo points at the deleted app page', () => {
    const offenders = [];
    for (const dir of ['', 'clusters', 'workflow', 'support-worker']) {
        for (const f of readdirSync(root + dir)) {
            if (!/\.(html|json|py|js|txt)$/.test(f)) continue;
            const path = dir ? `${dir}/${f}` : f;
            if (/app-workflows/.test(read(path))) offenders.push(path);
        }
    }
    assert.deepEqual(offenders, [], 'these still reference app-workflows');
});

test('every retired workflow URL redirects somewhere that exists', () => {
    // Deleting them outright would 404 the inbound links these pages had earned,
    // so each one is a stub pointing at the closest surviving page on its topic.
    for (const p of RETIRED) {
        const s = read(p);
        const canonical = s.match(/<link rel="canonical" href="https:\/\/linkfinderai\.com\/([^"]+)">/);
        assert.ok(canonical, `${p} has no canonical`);
        const target = canonical[1];
        assert.ok(existsSync(root + target + '.html') || existsSync(root + target),
            `${p} redirects to ${target}, which does not exist`);

        // Meta refresh, canonical, visible link and the script must agree, or the
        // three signals send readers and crawlers to different places.
        assert.match(s, new RegExp(`<meta http-equiv="refresh" content="0; url=https://linkfinderai\\.com/${target}">`),
            `${p} refresh disagrees with its canonical`);
        // noindex would contradict the canonical and block consolidation onto it.
        assert.ok(!/noindex/.test(s), `${p} sets noindex alongside a canonical`);
    }
});

test('no page links into a retired workflow URL', () => {
    const offenders = [];
    for (const dir of ['', 'clusters']) {
        for (const f of readdirSync(root + dir)) {
            if (!f.endsWith('.html')) continue;
            const path = dir ? `${dir}/${f}` : f;
            if (RETIRED.includes(path)) continue;
            if (/href="[^"]*(workflow\/|clusters\/workflows)/.test(read(path))) offenders.push(path);
        }
    }
    assert.deepEqual(offenders, [], 'these still link to retired workflow pages');
});

test('the sitemap does not advertise the retired URLs', () => {
    assert.ok(!/workflow/.test(read('sitemap.xml')), 'sitemap still lists a workflow URL');
});

test('the support worker no longer offers to fetch them', () => {
    // It is an allow-list the model reads from; leaving /workflow/ on it means
    // the bot fetches redirect stubs and answers from nothing.
    const w = read('support-worker/worker.js');
    assert.ok(!/["']\/workflow\/["']/.test(w), 'still in FETCHABLE_PREFIXES');
    assert.ok(!/- \/workflow\/\*\.html/.test(w), 'still described in the system prompt');
});
