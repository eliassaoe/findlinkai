import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// docs/churn-pause.md (11 Nov 2026): most leavers finished one list; offer a
// pause first, and a last-chance pause for every reason before cancelling.
const html = readFileSync(new URL('../account.html', import.meta.url), 'utf8');

test('"I finished my list" is the first cancel reason and leads to a pause', () => {
    const grid = html.slice(html.indexOf('class="reason-grid"'));
    const first = grid.match(/selectReason\('(\w+)'/)[1];
    assert.equal(first, 'projectDone');
    assert.match(html, /projectDone: `[\s\S]*?retentionAction\('pause'\)/);
});

test('last-chance pause on step 3 uses its own ids and is hidden where step 2 already offered it', () => {
    assert.match(html, /id="lastPauseCard"/);
    assert.match(html, /retentionAction\('pause','lastPauseBtn','lastPauseStatus'\)/);
    assert.match(html, /async function retentionAction\(action, btnIdArg, statusIdArg\)/);
    assert.match(html, /selectedCancellationReason === 'notUsing' \|\| selectedCancellationReason === 'projectDone'/);
});

test('cancelling stays reachable: the cancel buttons are untouched', () => {
    assert.match(html, /id="startExitSurveyBtn"/);
    assert.match(html, /id="confirmCancelBtn"/);
});
