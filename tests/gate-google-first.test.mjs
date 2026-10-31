// The free-limit gate on the tool pages leads with Google and keeps email one
// link below. Background: docs/gate-google-first.md.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gate = readFileSync(new URL('../js/lf-gate.js', import.meta.url), 'utf8');
const signUp = readFileSync(new URL('../sign-up.html', import.meta.url), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('gate: Google first');

test('the gate adds a Google button that goes straight to the account picker', () => {
  assert.ok(gate.includes("SIGN_UP + '?google=1&source=gate'"));
  assert.ok(gate.includes("setAttribute('data-lf-method', 'google')"));
  assert.ok(/watchGate\(\) \{[\s\S]*?addGoogleToGate\(modal\);/.test(gate), 'watchGate installs it');
});

test('email stays available under it', () => {
  assert.ok(gate.includes("emailLink.textContent = 'or sign up with email'"));
});

test('gate clicks say which method was chosen', () => {
  assert.ok(gate.includes("props.method = el.getAttribute('data-lf-method') || 'email'"));
});

test('sign-up starts Google on ?google=1 and tags the gate as the source', () => {
  assert.ok(signUp.includes("urlParams.get('google') === '1' && !error"), 'never after a Google error');
  assert.ok(signUp.includes("urlParams.get('source') === 'gate' ? 'gate_modal' : 'agency'"));
  assert.ok(signUp.includes("async function signUpWithGoogle(source)"));
});

console.log(`${passed} passed`);
