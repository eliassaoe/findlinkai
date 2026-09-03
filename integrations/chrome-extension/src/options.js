/** Options page: the only surface that writes the API key. */
import { OPERATIONS } from './generated/operations.js';

const KEY_STORAGE = 'apiKey';
const keyInput = document.getElementById('key');
const status = document.getElementById('status');

function say(text, tone = 'info') {
    status.textContent = text;
    status.dataset.tone = tone;
    status.hidden = !text;
}

// The cost list is generated, so it cannot drift from what the API actually
// charges — the number one thing users get angry about.
const costs = document.getElementById('costs');
for (const op of [...OPERATIONS].sort((a, b) => a.credits - b.credits)) {
    const li = document.createElement('li');
    const suffix = op.perEmployeeBilling ? ' + 0.5 per employee returned' : '';
    li.textContent = `${op.label} — ${op.credits} credit${op.credits === 1 ? '' : 's'}${suffix}`;
    costs.appendChild(li);
}

chrome.storage.local.get(KEY_STORAGE).then((stored) => {
    if (stored[KEY_STORAGE]) {
        keyInput.value = stored[KEY_STORAGE];
        say('A key is saved for this browser.');
    }
});

document.getElementById('save').addEventListener('click', async () => {
    const value = keyInput.value.trim();
    if (!value) {
        say('Paste a key first.', 'error');
        return;
    }
    await chrome.storage.local.set({ [KEY_STORAGE]: value });
    say('Saved. Open a LinkedIn profile and the panel will appear bottom-right.');
});

document.getElementById('clear').addEventListener('click', async () => {
    await chrome.storage.local.remove(KEY_STORAGE);
    keyInput.value = '';
    say('Key removed from this browser.');
});
