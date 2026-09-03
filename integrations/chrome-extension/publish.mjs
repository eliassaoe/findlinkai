#!/usr/bin/env node
/**
 * Uploads the packed extension to the Chrome Web Store and publishes it.
 *
 * Runs only from CI, where the four credentials live as secrets. It is a separate
 * file rather than inline YAML so it can be read, reviewed and reasoned about —
 * a publish step that pushes a new version to every existing user is not the
 * place for a shell one-liner.
 *
 * Without CWS_EXTENSION_ID it CREATES a new item, which is what the very first
 * publish needs; with one it updates that item. The new item's id is printed, and
 * it must then be stored as CWS_EXTENSION_ID or the next run creates a second,
 * duplicate listing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, EXTENSION_ID, PUBLISH_TARGET = 'trustedTesters' } = process.env;

for (const [name, value] of Object.entries({ CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN })) {
    if (!value) {
        console.error(`Missing ${name}. See integrations/chrome-extension/SUBMITTING.md.`);
        process.exit(1);
    }
}

const manifest = JSON.parse(readFileSync(join(HERE, 'src', 'manifest.json'), 'utf8'));
const zipName = readdirSync(HERE).find((f) => f.endsWith('.zip'));
if (!zipName) {
    console.error('No .zip found — run pack.mjs first.');
    process.exit(1);
}
const zip = readFileSync(join(HERE, zipName));

/** Never let a credential reach the log, whatever Google returns. */
const scrub = (text) =>
    [CLIENT_SECRET, REFRESH_TOKEN].filter(Boolean).reduce((acc, secret) => acc.split(secret).join('***'), String(text));

async function accessToken() {
    const res = await fetch('https://accounts.google.com/o/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: REFRESH_TOKEN,
            grant_type: 'refresh_token',
        }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
        console.error(`Token exchange failed (HTTP ${res.status}): ${scrub(JSON.stringify(body))}`);
        console.error('A refresh token is revoked by changing the Google account password or removing app access.');
        process.exit(1);
    }
    return body.access_token;
}

const token = await accessToken();
const auth = { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2' };

const creating = !EXTENSION_ID;
const uploadUrl = creating
    ? 'https://www.googleapis.com/upload/chromewebstore/v1.1/items'
    : `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}`;

console.log(`${creating ? 'Creating a new item' : `Updating ${EXTENSION_ID}`} — ${zipName}, version ${manifest.version}`);

const upload = await fetch(uploadUrl, { method: creating ? 'POST' : 'PUT', headers: auth, body: zip });
const uploadBody = await upload.json().catch(() => ({}));

if (!upload.ok || uploadBody.uploadState === 'FAILURE') {
    console.error(`Upload failed (HTTP ${upload.status}): ${scrub(JSON.stringify(uploadBody, null, 2))}`);
    // The most common cause by far, and the error text for it is not obvious.
    if (JSON.stringify(uploadBody).includes('version')) {
        console.error('A version already on the store cannot be re-uploaded. Bump manifest.json version.');
    }
    process.exit(1);
}

const itemId = uploadBody.id || EXTENSION_ID;
console.log(`Uploaded. Item ${itemId}, state ${uploadBody.uploadState}.`);

if (creating) {
    console.log(`\n::notice::Store this as the CWS_EXTENSION_ID secret: ${itemId}`);
    console.log('Without it the next run creates a SECOND listing instead of updating this one.\n');
}

const publish = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${itemId}/publish?publishTarget=${PUBLISH_TARGET}`,
    { method: 'POST', headers: { ...auth, 'Content-Length': '0' } }
);
const publishBody = await publish.json().catch(() => ({}));

if (!publish.ok) {
    console.error(`Publish failed (HTTP ${publish.status}): ${scrub(JSON.stringify(publishBody, null, 2))}`);
    console.error('The upload succeeded, so the version is in the dashboard as a draft and can be published by hand.');
    process.exit(1);
}

console.log(`Publish requested to "${PUBLISH_TARGET}": ${(publishBody.status || []).join(', ') || 'OK'}`);
for (const detail of publishBody.statusDetail || []) console.log(`  ${detail}`);
console.log('\nA first submission sits in review for a few days. Watch it at');
console.log('https://chrome.google.com/webstore/devconsole');
