/**
 * The API push, against a stubbed Apps Script API.
 *
 * This tool writes to the live add-on tens of thousands of people have
 * installed, and `projects.updateContent` replaces EVERY file in the project.
 * The two ways that goes badly are silent:
 *
 *   - the manifest is not included in the request, so it is deleted, and with it
 *     the add-on's declared configuration
 *   - a new Apps Script service widens the inferred OAuth scopes, which pulls
 *     the add-on from the store until Google re-verifies it
 *
 * Both are cheap to assert and expensive to discover in production.
 *
 * Run: node --test test/push.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ADDON = dirname(dirname(fileURLToPath(import.meta.url)));

const MANIFEST = {
  name: 'appsscript',
  type: 'JSON',
  // The real one is not committed; this stands in for "whatever is live".
  source: '{\n  "timeZone": "Europe/Paris",\n  "exceptionLogging": "STACKDRIVER",\n  "runtimeVersion": "V8"\n}\n',
};

/** An Apps Script API that records what it was asked to do. */
async function stubApi({ deployments = [] } = {}) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
      const reply = (obj) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };

      if (req.url.endsWith('/content') && req.method === 'GET') {
        return reply({ files: [MANIFEST, { name: 'Code', type: 'SERVER_JS', source: '// the old one\n' }] });
      }
      if (req.url.endsWith('/content') && req.method === 'PUT') return reply({ files: req.body });
      if (req.url.endsWith('/versions')) return reply({ versionNumber: 42 });
      if (req.url.endsWith('/deployments') && req.method === 'GET') return reply({ deployments });
      return reply({});
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/v1`;
  return { base, seen, close: () => new Promise((r) => server.close(r)) };
}

const push = (cwd, base, args = []) =>
  run('node', [join(cwd, 'tools', 'push-via-api.mjs'), 'test-script-id', ...args], {
    cwd,
    env: { ...process.env, LF_TOKEN: 'test-token', LF_API_BASE: base },
  });

test('the live manifest is sent back untouched, never dropped', async () => {
  const api = await stubApi();
  try {
    await push(ADDON, api.base);
    const put = api.seen.find((r) => r.method === 'PUT' && r.url.endsWith('/content'));
    assert.ok(put, 'nothing was pushed');

    const sent = put.body.files.find((f) => f.type === 'JSON');
    assert.ok(sent, 'the manifest is missing from the request — updateContent would delete it');
    assert.strictEqual(sent.source, MANIFEST.source, 'the manifest was modified');
    assert.strictEqual(sent.name, MANIFEST.name);
  } finally {
    await api.close();
  }
});

test('all five files are pushed, with the right Apps Script types', async () => {
  const api = await stubApi();
  try {
    await push(ADDON, api.base);
    const files = api.seen.find((r) => r.method === 'PUT').body.files;

    for (const [name, type] of [
      ['Code', 'SERVER_JS'], ['Operations', 'SERVER_JS'],
      ['Sidebar', 'HTML'], ['Settings', 'HTML'], ['Help', 'HTML'],
    ]) {
      const file = files.find((f) => f.name === name);
      assert.ok(file, `${name} was not pushed`);
      assert.strictEqual(file.type, type, `${name} pushed as the wrong type`);
      assert.ok(file.source.length > 100, `${name} pushed empty`);
    }
    // The repo's Code.gs, not the stub's "old one".
    assert.match(files.find((f) => f.name === 'Code').source, /@OnlyCurrentDoc/);
  } finally {
    await api.close();
  }
});

test('a new Apps Script service stops the push before anything is sent', async () => {
  // A scope change pulls the add-on from the store. Nothing should reach the API.
  const scratch = mkdtempSync(join(tmpdir(), 'addon-'));
  cpSync(ADDON, scratch, { recursive: true });
  const code = join(scratch, 'Code.gs');
  writeFileSync(code, readFileSync(code, 'utf8').replace('function onInstall(e) {', 'function onInstall(e) {\n  DriveApp.getRootFolder();'));

  const api = await stubApi();
  try {
    await assert.rejects(() => push(scratch, api.base), (err) => {
      assert.match(err.stderr, /DriveApp/);
      assert.match(err.stderr, /re-verifies|scopes/i);
      return true;
    });
    assert.ok(!api.seen.some((r) => r.method === 'PUT'), 'it pushed despite the scope change');
  } finally {
    await api.close();
  }
});

test('removing @OnlyCurrentDoc stops the push, even though a comment still mentions it', async () => {
  // Code.gs names @OnlyCurrentDoc twice: the real annotation, and a comment
  // explaining why it matters. A guard that just searched for the string passed
  // when the annotation was deleted and only the prose was left — which is the
  // exact case it exists to catch. This removes only the annotation.
  const scratch = mkdtempSync(join(tmpdir(), 'addon-'));
  cpSync(ADDON, scratch, { recursive: true });
  const code = join(scratch, 'Code.gs');
  const without = readFileSync(code, 'utf8').replace(/^\s*\*\s*@OnlyCurrentDoc\s*$/m, ' *');
  assert.ok(without.includes('@OnlyCurrentDoc'), 'the prose mention should still be there');
  writeFileSync(code, without);

  const api = await stubApi();
  try {
    await assert.rejects(() => push(scratch, api.base), (err) => {
      assert.match(err.stderr, /OnlyCurrentDoc/);
      return true;
    });
    assert.ok(!api.seen.some((r) => r.method === 'PUT'));
  } finally {
    await api.close();
  }
});

test('--dry-run reads but never writes', async () => {
  const api = await stubApi();
  try {
    const { stdout } = await push(ADDON, api.base, ['--dry-run']);
    assert.match(stdout, /nothing was sent/);
    assert.ok(api.seen.every((r) => r.method === 'GET'), 'a dry run sent a write');
  } finally {
    await api.close();
  }
});

test('the live deployment is updated in place, never replaced', async () => {
  // A new deployment id disables the triggers on the old one.
  const api = await stubApi({
    deployments: [
      { deploymentId: 'HEAD', deploymentConfig: {} },   // the editor's own — not what anyone installed
      { deploymentId: 'AKfycb-live', deploymentConfig: { versionNumber: 7, manifestFileName: 'appsscript', description: 'v7' } },
    ],
  });
  try {
    const { stdout } = await push(ADDON, api.base);

    assert.ok(!api.seen.some((r) => r.method === 'POST' && r.url.endsWith('/deployments')),
      'it created a new deployment instead of updating the live one');

    const update = api.seen.find((r) => r.method === 'PUT' && r.url.includes('/deployments/'));
    assert.ok(update, 'the live deployment was never updated');
    assert.ok(update.url.includes('AKfycb-live'), 'it updated the wrong deployment');
    assert.strictEqual(update.body.deploymentConfig.versionNumber, 42);
    assert.ok(!update.url.includes('/HEAD'), 'it updated the editor deployment');

    assert.match(stdout, /version 42/);
    assert.match(stdout, /Marketplace SDK/, 'it must say the Cloud step is still needed');
  } finally {
    await api.close();
  }
});

test('a project with no versioned deployment is explained, not crashed', async () => {
  const api = await stubApi({ deployments: [{ deploymentId: 'HEAD', deploymentConfig: {} }] });
  try {
    const { stdout } = await push(ADDON, api.base);
    assert.match(stdout, /No versioned deployment found/);
    assert.match(stdout, /Manage deployments/);
  } finally {
    await api.close();
  }
});
