import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// LinkedIn profile + email (linkedin_profile_to_profile_email), 8 Nov 2026.
// See docs/profile-email.md. The n8n branch lives in "linkfinder ai app v 4"
// (Switch1 rule 22, nodes prefixed "PE ·"); this pins the app side.

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../supabase/functions/csv-batch-runner/shared-export.js', import.meta.url), 'utf8');
const runnerIdx = readFileSync(new URL('../supabase/functions/csv-batch-runner/index.ts', import.meta.url), 'utf8');

test('costs 15 credits in the app and in the background runner', () => {
  assert.match(app, /'linkedin_profile_to_profile_email':15/);
  assert.match(runnerIdx, /linkedin_profile_to_profile_email: 15/);
});

test('offered as an output of a LinkedIn profile URL, in the picker and the smart start', () => {
  assert.match(app, /profile_email:"LinkedIn Profile \+ Email"/);
  assert.match(app, /\['linkedin_profile', 'profile_email', /);
  assert.match(app, /\['profile_email', 'Full profile \+ email'\]/);
});

test('renders and exports exactly like LinkedIn Profile Data (which has an Email column)', () => {
  assert.match(app, /function lfProfileOut\(\)\{ return currentOutputType === 'linkedin_info' \|\| currentOutputType === 'profile_email'; \}/);
  assert.doesNotMatch(app, /currentInputType *=== *'linkedin_profile' *&& *currentOutputType *=== *'linkedin_info'/);
  assert.equal((runner.match(/outputType === 'linkedin_info' \|\| outputType === 'profile_email'/g) || []).length, 2);
});

test('the free-list panel in the app pre-sets it, in list mode, right under the panel', () => {
  assert.match(app, /function lfFreeListPreset\(source\)/);
  assert.match(app, /outputSel\.value = 'linkedin_profile__profile_email'/);
  assert.match(app, /lfFreeListPreset\('free_list_preset'\)/);
  assert.match(app, /getCreditCost\('linkedin_profile', 'profile_email'\)/);
});
