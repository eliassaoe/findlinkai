/**
 * The in-page panel. This is the whole point of the extension: the LinkedIn URL
 * is already in the address bar, so the lookup should be one click from the
 * profile rather than a copy-paste into a web app.
 *
 * Two deliberate choices about LinkedIn's DOM:
 *
 * 1. Nothing is injected into their markup. The panel is our own fixed-position
 *    element. Every LinkedIn extension that grafts a button into their action bar
 *    breaks on their next deploy, because those class names are compiled hashes.
 *    A floating panel is uglier and it survives.
 *
 * 2. LinkedIn is a single-page app, so a profile change does not reload the page.
 *    The URL is watched rather than trusted once.
 *
 * The API key is never here. This script asks the service worker for a lookup by
 * operation type and URL; the worker holds the key.
 */
const PANEL_ID = 'linkfinder-ai-panel';
const POLL_URL_MS = 700;

let currentUrl = null;
let operations = [];
let busy = false;

/** Mirrors generated/operations.js, fetched from the worker so there is one source. */
async function ask(message) {
    try {
        return await chrome.runtime.sendMessage(message);
    } catch {
        // The worker is asleep or the extension was reloaded mid-session.
        return null;
    }
}

function cleanProfileUrl(url) {
    // Strip LinkedIn's tracking and sub-tabs: /in/someone/recent-activity/all/ and
    // ?originalSubdomain=fr both resolve to the same person, and the API wants the
    // canonical profile. Country subdomains are left alone — they are valid, and
    // rejecting them was a real bug the win-back email had to apologise for.
    try {
        const u = new URL(url);
        u.search = '';
        u.hash = '';
        const m = u.pathname.match(/^(\/(?:in|company|posts)\/[^/]+)/);
        if (m) u.pathname = m[1];
        return u.toString().replace(/\/$/, '');
    } catch {
        return url;
    }
}

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v);
    }
    for (const child of children) node.appendChild(child);
    return node;
}

function creditLabel(op) {
    if (op.perEmployeeBilling) return `${op.credits} credit + 0.5 each`;
    return `${op.credits} credit${op.credits === 1 ? '' : 's'}`;
}

function removePanel() {
    document.getElementById(PANEL_ID)?.remove();
}

function setStatus(text, tone = 'info') {
    const status = document.querySelector(`#${PANEL_ID} .lf-status`);
    if (!status) return;
    status.textContent = text || '';
    status.dataset.tone = tone;
    status.hidden = !text;
}

function showResult(op, response) {
    const out = document.querySelector(`#${PANEL_ID} .lf-results`);
    if (!out) return;
    out.replaceChildren();

    if (!response.found) {
        // Saying this out loud matters: openapi.json documents that a nothing-found
        // call is still billed. Letting a user discover that from their balance is
        // how a tool gets a one-star review.
        setStatus(`Nothing found for ${op.short.toLowerCase()}. This lookup was still charged.`, 'warn');
        return;
    }

    setStatus('', 'info');
    out.appendChild(el('div', { class: 'lf-result-head', text: `${op.label} · ${creditLabel(op)}` }));

    for (const line of response.lines.slice(0, 25)) {
        const value = el('span', { class: 'lf-value', text: line.value });
        const copy = el('button', { class: 'lf-copy', type: 'button', text: 'Copy' });
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(line.value);
                copy.textContent = 'Copied';
                setTimeout(() => (copy.textContent = 'Copy'), 1200);
            } catch {
                copy.textContent = 'Press ⌘C';
            }
        });
        out.appendChild(el('div', { class: 'lf-row' }, [el('span', { class: 'lf-key', text: line.label }), value, copy]));
    }

    if (response.lines.length > 25) {
        out.appendChild(el('div', { class: 'lf-more', text: `+${response.lines.length - 25} more — see your LinkFinder history` }));
    }
}

async function run(op) {
    if (busy) return;
    busy = true;
    document.querySelectorAll(`#${PANEL_ID} .lf-op`).forEach((b) => (b.disabled = true));
    setStatus(`Looking up ${op.short.toLowerCase()}…`, 'info');

    const response = await ask({ kind: 'lookup', type: op.type, url: cleanProfileUrl(currentUrl), params: {} });

    busy = false;
    document.querySelectorAll(`#${PANEL_ID} .lf-op`).forEach((b) => (b.disabled = false));

    if (!response) {
        setStatus('The extension needs reloading — open chrome://extensions and reload LinkFinder AI.', 'error');
        return;
    }
    if (!response.ok) {
        setStatus(response.error, 'error');
        return;
    }
    showResult(op, response);
}

function buildPanel(page, ops, hasKey) {
    removePanel();

    const body = el('div', { class: 'lf-body' });

    if (!hasKey) {
        body.appendChild(el('p', { class: 'lf-hint', text: 'Add your LinkFinder API key to use this.' }));
        const open = el('button', { class: 'lf-primary', type: 'button', text: 'Add API key' });
        open.addEventListener('click', () => ask({ kind: 'open-options' }) || chrome.runtime.openOptionsPage?.());
        body.appendChild(open);
    } else {
        const row = el('div', { class: 'lf-ops' });
        for (const op of ops) {
            const button = el('button', { class: 'lf-op', type: 'button', title: `${op.label} — ${creditLabel(op)}` }, [
                el('span', { class: 'lf-op-label', text: op.short }),
                el('span', { class: 'lf-op-cost', text: creditLabel(op) }),
            ]);
            button.addEventListener('click', () => run(op));
            row.appendChild(button);
        }
        body.appendChild(row);
        body.appendChild(el('div', { class: 'lf-status', hidden: 'hidden' }));
        body.appendChild(el('div', { class: 'lf-results' }));
    }

    const collapse = el('button', { class: 'lf-collapse', type: 'button', title: 'Hide', text: '–' });
    const panel = el('div', { id: PANEL_ID, class: 'lf-collapsed-no' }, [
        el('div', { class: 'lf-head' }, [
            el('span', { class: 'lf-brand', text: 'LinkFinder AI' }),
            el('span', { class: 'lf-page', text: page }),
            collapse,
        ]),
        body,
    ]);

    collapse.addEventListener('click', () => {
        const hidden = body.hasAttribute('hidden');
        if (hidden) body.removeAttribute('hidden');
        else body.setAttribute('hidden', 'hidden');
        collapse.textContent = hidden ? '–' : '+';
        try {
            localStorage.setItem('lf_panel_collapsed', hidden ? '0' : '1');
        } catch {
            /* private mode */
        }
    });

    try {
        if (localStorage.getItem('lf_panel_collapsed') === '1') {
            body.setAttribute('hidden', 'hidden');
            collapse.textContent = '+';
        }
    } catch {
        /* private mode */
    }

    document.body.appendChild(panel);
}

async function sync() {
    const url = location.href;
    if (url === currentUrl) return;
    currentUrl = url;

    const context = await ask({ kind: 'page-type', url });
    const page = context && context.page;

    if (!page) {
        removePanel();
        return;
    }

    operations = context.operations || [];
    const key = await ask({ kind: 'has-key' });
    buildPanel(page, operations, Boolean(key && key.hasKey));

    // Tell the worker where we are, so the popup can describe this tab without the
    // extension needing permission to read tab URLs.
    ask({ kind: 'page-context', url, page });
}

sync();
setInterval(sync, POLL_URL_MS);
