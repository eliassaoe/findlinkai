/**
 * Ships the add-on through the Apps Script REST API instead of the editor.
 *
 * Why this exists alongside deploy.sh: clasp needs a terminal, node and a
 * browser on the same machine. This needs only an access token, so the whole
 * deploy can be driven from anywhere — including by an agent that has the token
 * but no Google session of its own.
 *
 *   LF_TOKEN=<access token> node tools/push-via-api.mjs <scriptId> --dry-run
 *   LF_TOKEN=<access token> node tools/push-via-api.mjs <scriptId>
 *
 * The token needs the https://www.googleapis.com/auth/script.projects scope and
 * must belong to the account that owns the script. Get one in two minutes at
 * developers.google.com/oauthplayground — no OAuth client to create. It expires
 * in an hour, which is the point: nothing long-lived needs to be handed over.
 *
 * WHAT IT WILL NOT DO
 *   - touch appsscript.json. It reads the live manifest and sends it back
 *     byte-identical. Apps Script infers the add-on's OAuth scopes from the
 *     code, and a scope change pulls the add-on from the store until Google
 *     re-verifies it. updateContent replaces EVERY file, so a manifest that is
 *     merely absent from the request is a manifest that gets deleted.
 *   - create a new deployment. A new deployment id disables the triggers on the
 *     old one. It updates the deployment that is already live.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
// Overridable so the tests can point it at a stub. This writes to a live,
// published add-on; it should not be the one thing here with no coverage.
const API = process.env.LF_API_BASE ?? 'https://script.googleapis.com/v1';

const TOKEN = process.env.LF_TOKEN;
const SCRIPT_ID = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');

const die = (msg) => {
  console.error(`\n\x1b[31m${msg}\x1b[0m\n`);
  process.exit(1);
};

if (!TOKEN) die('Set LF_TOKEN to an access token with the script.projects scope.');
if (!SCRIPT_ID || SCRIPT_ID.startsWith('--')) die('Pass the script id: node tools/push-via-api.mjs <scriptId>');

// The files this repo owns. The manifest is deliberately not here.
const FILES = [
  { name: 'Code', type: 'SERVER_JS', file: 'Code.gs' },
  { name: 'Operations', type: 'SERVER_JS', file: 'Operations.gs' },
  { name: 'Sidebar', type: 'HTML', file: 'Sidebar.html' },
  { name: 'Settings', type: 'HTML', file: 'Settings.html' },
  { name: 'Help', type: 'HTML', file: 'Help.html' },
];

async function call(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401) die(`The token was rejected — it has expired or is for the wrong account.\n${reason}`);
    if (res.status === 403) {
      die(
        `Refused: ${reason}\n\n` +
          'Two usual causes:\n' +
          '  - the Apps Script API is off for this account. Switch it on once at\n' +
          '    https://script.google.com/home/usersettings\n' +
          "  - the token lacks the script.projects scope, or is not the script's owner.",
      );
    }
    if (res.status === 404) die(`No script with id ${SCRIPT_ID} on this account.\n${reason}`);
    die(`${options.method ?? 'GET'} ${path} failed: ${reason}`);
  }
  return body;
}

// ── the scope guard, same rule deploy.sh enforces ───────────────────────────
const ALLOWED = new Set(['SpreadsheetApp', 'PropertiesService', 'UrlFetchApp', 'Utilities', 'HtmlService', 'Logger']);

function assertScopesUnchanged(sources) {
  const code = sources.filter((f) => f.type === 'SERVER_JS').map((f) => f.source).join('\n');
  const used = new Set(code.match(/\b[A-Z][A-Za-z]+App\b|\bPropertiesService\b|\bUtilities\b|\bLogger\b/g) ?? []);
  const extra = [...used].filter((s) => !ALLOWED.has(s));

  if (extra.length) {
    die(
      `New Apps Script service(s) in use: ${extra.join(', ')}\n\n` +
        'Apps Script infers the add-on\'s OAuth scopes from its code, so this widens\n' +
        'them — which pulls the add-on from the store until Google re-verifies it,\n' +
        'and makes every existing user re-authorize. Nothing was pushed.',
    );
  }
  // Matched as an annotation on its own line. `includes` would also match the
  // comment further down that merely explains the rule, so deleting the real
  // annotation would have slipped through the check meant to catch exactly that.
  if (!/^\s*\*\s*@OnlyCurrentDoc\s*$/m.test(code)) {
    die(
      'The @OnlyCurrentDoc annotation is missing from Code.gs.\n\n' +
        'Without it the add-on asks for access to every spreadsheet rather than the\n' +
        'open one — a scope change, so the store pulls it until Google re-verifies.\n' +
        'Nothing was pushed.',
    );
  }
}

// ── 1. read what is live ────────────────────────────────────────────────────
console.log(`\nReading the live project…`);
const current = await call(`/projects/${SCRIPT_ID}/content`);
const live = current.files ?? [];

const manifest = live.find((f) => f.name === 'appsscript' || f.type === 'JSON');
if (!manifest) {
  die(
    'The live project has no manifest, which should be impossible.\n' +
      'Refusing to push: updateContent replaces every file, so this would delete it.',
  );
}
console.log(`  ${live.length} files live: ${live.map((f) => f.name).join(', ')}`);
console.log(`  manifest preserved byte-for-byte (${manifest.source.length} bytes, untouched)`);

// ── 2. build the new content ────────────────────────────────────────────────
const sources = FILES.map(({ name, type, file }) => ({
  name,
  type,
  source: readFileSync(join(HERE, file), 'utf8'),
}));

assertScopesUnchanged(sources);
console.log('  scope check: only the six services already in use. Unchanged.');

const files = [manifest, ...sources];

// ── 3. say what changes, before changing it ─────────────────────────────────
console.log('\nChanges:');
for (const next of sources) {
  const before = live.find((f) => f.name === next.name);
  if (!before) console.log(`  + ${next.name}.${next.type === 'HTML' ? 'html' : 'gs'}  (new)`);
  else if (before.source !== next.source) {
    const delta = next.source.length - before.source.length;
    console.log(`  ~ ${next.name}  (${delta >= 0 ? '+' : ''}${delta} bytes)`);
  } else console.log(`  = ${next.name}  (identical, no change)`);
}
for (const gone of live.filter((f) => f !== manifest && !sources.some((s) => s.name === f.name))) {
  console.log(`  - ${gone.name}  (in the project but not in this repo — WILL BE DELETED)`);
}

if (DRY_RUN) {
  console.log('\n--dry-run: nothing was sent.\n');
  process.exit(0);
}

// ── 4. push ─────────────────────────────────────────────────────────────────
console.log('\nPushing…');
await call(`/projects/${SCRIPT_ID}/content`, { method: 'PUT', body: JSON.stringify({ files }) });
console.log('  content updated.');

// ── 5. cut a version ────────────────────────────────────────────────────────
const description = process.env.LF_VERSION_NOTE ?? 'All 20 lookups; per-row writes; skip filled rows';
const version = await call(`/projects/${SCRIPT_ID}/versions`, {
  method: 'POST',
  body: JSON.stringify({ description }),
});
console.log(`  version ${version.versionNumber} created — "${description}"`);

// ── 6. point the LIVE deployment at it ──────────────────────────────────────
const { deployments = [] } = await call(`/projects/${SCRIPT_ID}/deployments`);
// @HEAD is the editor's own deployment and is not what anyone installed.
const live_deployments = deployments.filter((d) => d.deploymentId !== 'HEAD' && d.deploymentConfig?.versionNumber);

if (!live_deployments.length) {
  console.log(
    '\n  No versioned deployment found. Create one once in the editor\n' +
      '  (Deploy > Manage deployments), then re-run this and it will be updated in place.',
  );
} else {
  for (const d of live_deployments) {
    const config = d.deploymentConfig ?? {};
    await call(`/projects/${SCRIPT_ID}/deployments/${d.deploymentId}`, {
      method: 'PUT',
      body: JSON.stringify({
        deploymentConfig: {
          scriptId: SCRIPT_ID,
          versionNumber: version.versionNumber,
          manifestFileName: config.manifestFileName ?? 'appsscript',
          description: config.description ?? description,
        },
      }),
    });
    console.log(`  deployment ${d.deploymentId} now serves version ${version.versionNumber}`);
  }
}

console.log(`
──────────────────────────────────────────────────────────────────────────
Pushed, versioned and deployed.

ONE step left, and it is not in this API:

  Google Cloud -> APIs & Services -> Google Workspace Marketplace SDK
    -> App Configuration -> set the version to ${version.versionNumber} -> Save

That is what makes installed users get it. No review — the scopes did not change.

Then revoke the token you used: myaccount.google.com/permissions
(It expires within the hour anyway.)
──────────────────────────────────────────────────────────────────────────
`);
