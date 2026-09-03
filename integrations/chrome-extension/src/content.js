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

const APP_URL = 'https://linkfinderai.com/app';

/**
 * A link into the web app, tagged so the surface that sent them is knowable.
 *
 * The extension is an acquisition hook: it gives one answer on the page, and the
 * volume work — a whole list, a CSV, the CRM — happens at linkfinderai.com. Every
 * exit from this panel therefore goes to the app, and every one carries a
 * DISTINCT utm_campaign.
 *
 * That last part is deliberate. `docs/youtube-decision-record.md` records 535 of
 * 561 tagged pageviews collapsing into a single `utm_campaign=tutorials`, which
 * made it impossible to judge any individual video. Same mistake, same cost: if
 * every CTA here said "extension", nobody could tell whether people arrive
 * because a lookup delighted them or because they hit a credit wall.
 *
 * app.html's captureUTMs() reads these into PostHog person properties and fires
 * `utm_landing`, so nothing extra is needed on the other side.
 */
function appLink(campaign, content) {
    const params = new URLSearchParams({
        utm_source: 'chrome_extension',
        utm_medium: 'extension',
        utm_campaign: campaign,
    });
    if (content) params.set('utm_content', content);
    return `${APP_URL}?${params.toString()}`;
}

/** The upsell row. Always the last thing in the panel, never a modal. */
function appCta(text, campaign, content) {
    const link = el('a', { class: 'lf-cta', href: appLink(campaign, content), target: '_blank', rel: 'noopener', text });
    return link;
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
        out.appendChild(appCta('Try a different angle in LinkFinder →', 'no_result', op.type));
        return;
    }

    if (response.csv && response.rows > 0) {
        // For an export the useful summary is the row count and what it cost, not
        // a preview of names the user is about to open in a spreadsheet anyway.
        setStatus(`${response.rows} rows found${response.chargedCredits ? ` · ${response.chargedCredits} credits` : ''}.`, 'info');
        out.appendChild(el('div', { class: 'lf-result-head', text: op.label }));
        for (const line of response.lines.slice(0, 3)) {
            out.appendChild(el('div', { class: 'lf-row' }, [el('span', { class: 'lf-value', text: line.value })]));
        }
        if (response.rows > 3) out.appendChild(el('div', { class: 'lf-more', text: `…and ${response.rows - 3} more` }));
        out.appendChild(appCta('Do this for 50 companies at once →', 'after_export', op.type));
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

    // One answer is the hook. The list is the product, and the list lives in the app.
    out.appendChild(appCta('Do this for a whole list →', 'after_lookup', op.type));
}

/** What the operation will cost with the currently chosen row cap. */
function estimate(op, rows) {
    if (!op.perEmployeeBilling) return op.credits;
    const n = Number(rows);
    if (!Number.isFinite(n) || n <= 0) return null;
    return op.credits + 0.5 * n;
}

function offerDownload(op, rows, csv) {
    const out = document.querySelector(`#${PANEL_ID} .lf-results`);
    if (!out) return;

    const company = (() => {
        const m = currentUrl.match(/\/company\/([^/?#]+)/);
        return m ? m[1] : 'linkedin';
    })();
    const name = `${company}-employees-${new Date().toISOString().slice(0, 10)}.csv`;

    const link = el('a', { class: 'lf-download', download: name, text: `Download ${rows} rows (CSV)` });
    // A blob URL rather than chrome.downloads: same result, one less permission to
    // justify to a store reviewer.
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(link.href), 30_000));
    out.appendChild(link);
}

async function run(op, params = {}) {
    if (busy) return;
    busy = true;
    document.querySelectorAll(`#${PANEL_ID} button`).forEach((b) => (b.disabled = true));

    const quoted = estimate(op, params.employee_count);
    setStatus(
        op.perEmployeeBilling && quoted
            ? `Exporting… up to ${quoted} credits.`
            : `Looking up ${op.short.toLowerCase()}…`,
        'info'
    );

    const response = await ask({ kind: 'lookup', type: op.type, url: cleanProfileUrl(currentUrl), params });

    busy = false;
    document.querySelectorAll(`#${PANEL_ID} button`).forEach((b) => (b.disabled = false));

    if (!response) {
        setStatus('The extension needs reloading — open chrome://extensions and reload LinkFinder AI.', 'error');
        return;
    }
    if (!response.ok) {
        setStatus(response.error, 'error');
        // 402 is the highest-intent moment the extension ever sees: they wanted the
        // data enough to spend credits they did not have.
        if (response.status === 402) {
            const out = document.querySelector(`#${PANEL_ID} .lf-results`);
            if (out) {
                out.replaceChildren();
                out.appendChild(appCta('Top up at linkfinderai.com →', 'credit_wall', op.type));
            }
        }
        return;
    }
    showResult(op, response);
    if (response.csv && response.rows > 0) offerDownload(op, response.rows, response.csv);
}

/**
 * The export form, for operations that return a list and take filters.
 *
 * This is the surface the extension exists for. Measured over 120 days: people
 * who only ever ran single lookups paid at 0.35%, people who uploaded a CSV at
 * 4.6%, people who hit the export gate at 8.7%. A one-profile-at-a-time panel
 * optimises for the worst of those three.
 */
function buildExportForm(op) {
    const fields = el('div', { class: 'lf-form' });

    const inputs = {};
    for (const param of op.params) {
        const isNumber = param.type === 'integer';
        const input = el('input', {
            class: 'lf-input',
            type: isNumber ? 'number' : 'text',
            placeholder: isNumber ? '25' : param.help.replace(/^.*e\.g\. /, '').replace(/\.$/, ''),
            title: param.help,
        });
        if (isNumber) {
            input.min = '1';
            input.value = '25'; // A cheap first run: 13.5 credits, not 101.
        }
        inputs[param.name] = input;
        fields.appendChild(el('label', { class: 'lf-field' }, [el('span', { text: param.label }), input]));
    }

    const cost = el('div', { class: 'lf-estimate' });
    const refresh = () => {
        const n = inputs.employee_count ? inputs.employee_count.value : null;
        const c = estimate(op, n);
        cost.textContent = c === null ? 'Enter a row cap to see the cost.' : `About ${c} credits for ${n} rows.`;
    };
    if (inputs.employee_count) {
        inputs.employee_count.addEventListener('input', refresh);
        refresh();
    }

    const go = el('button', { class: 'lf-primary lf-export-run', type: 'button', text: 'Export to CSV' });
    go.addEventListener('click', () => {
        const params = {};
        for (const [name, input] of Object.entries(inputs)) {
            const value = input.value.trim();
            if (!value) continue;
            params[name] = input.type === 'number' ? Number(value) : value;
        }
        run(op, params);
    });

    return el('div', { class: 'lf-export' }, [fields, cost, go]);
}

function buildPanel(page, ops, hasKey) {
    removePanel();

    const body = el('div', { class: 'lf-body' });

    if (!hasKey) {
        body.appendChild(el('p', { class: 'lf-hint', text: 'Connect your LinkFinder account. Free, and no key to copy.' }));
        // The connect link IS the primary action now: opening the site is enough,
        // because connect.js picks the key up from the signed-in session there.
        const connect = appCta('Connect my account →', 'no_key');
        connect.classList.add('lf-connect');
        body.appendChild(connect);
        const manual = el('button', { class: 'lf-secondary', type: 'button', text: 'Paste a key instead' });
        manual.addEventListener('click', () => ask({ kind: 'open-options' }) || chrome.runtime.openOptionsPage?.());
        body.appendChild(manual);
    } else {
        // Exports lead. On a company page the export IS the product; the single
        // lookups are the secondary action, not the other way round.
        const exports = ops.filter((op) => op.outputKind === 'list' && op.params.length);
        const quick = ops.filter((op) => !(op.outputKind === 'list' && op.params.length));

        for (const op of exports) {
            body.appendChild(el('div', { class: 'lf-section', text: op.label }));
            body.appendChild(buildExportForm(op));
        }

        if (quick.length) {
            if (exports.length) body.appendChild(el('div', { class: 'lf-section', text: 'Single lookups' }));
            const row = el('div', { class: 'lf-ops' });
            for (const op of quick) {
                const button = el('button', { class: 'lf-op', type: 'button', title: `${op.label} — ${creditLabel(op)}` }, [
                    el('span', { class: 'lf-op-label', text: op.short }),
                    el('span', { class: 'lf-op-cost', text: creditLabel(op) }),
                ]);
                button.addEventListener('click', () => run(op));
                row.appendChild(button);
            }
            body.appendChild(row);
        }
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
