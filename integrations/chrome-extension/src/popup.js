/**
 * The popup is deliberately thin. The real UI is the in-page panel; this exists
 * because Chrome gives every extension a toolbar icon and a user will click it,
 * so it has to say something true about the current state.
 */
import { SPEC_VERSION } from './generated/operations.js';

const state = document.getElementById('state');

function show(text, tone = 'info') {
    state.textContent = text;
    state.dataset.tone = tone;
}

document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('ver').textContent = `API spec ${SPEC_VERSION}`;

(async () => {
    const key = await chrome.runtime.sendMessage({ kind: 'has-key' }).catch(() => null);
    if (!key || !key.hasKey) {
        show('No API key yet. Open Settings to add one.', 'warn');
        return;
    }
    const ctx = await chrome.runtime.sendMessage({ kind: 'get-page-context' }).catch(() => null);
    const page = ctx && ctx.context && ctx.context.page;
    if (!page) {
        show('Open a LinkedIn profile, company or post to use it.', 'warn');
        return;
    }
    show(`Ready on ${page === 'profile' ? 'a profile' : page === 'company' ? 'a company page' : 'a post'}.`);
})();
