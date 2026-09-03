/**
 * Service worker: the only place the API key is ever read.
 *
 * The content script asks for a lookup by operation type and URL; this reads the
 * key, calls the API, and sends back a result. The key is never part of any
 * message, so nothing on linkedin.com can reach it even if the page is hostile.
 *
 * It also remembers which LinkedIn page each tab is on, reported by the content
 * script on load. That is why the manifest asks for neither "tabs" nor
 * "activeTab": the popup asks the worker what page the user is on rather than
 * reading the tab URL itself. Fewer permissions is not only hygiene here — every
 * additional one is another thing a Chrome Web Store reviewer has to justify.
 */
import { runOperation, ApiError, presentResult, toCsv, rowCount } from './api.js';
import { operationByType, operationsFor, pageTypeOf, SPEC_VERSION } from './generated/operations.js';

const KEY_STORAGE = 'apiKey';

// tabId -> { url, page }. In-memory only; a worker restart loses it and the next
// content-script report refills it.
const tabPages = new Map();

async function getApiKey() {
    const stored = await chrome.storage.local.get(KEY_STORAGE);
    const key = stored[KEY_STORAGE];
    return typeof key === 'string' && key.trim() ? key.trim() : null;
}

async function handleLookup({ type, url, params }) {
    const operation = operationByType(type);
    if (!operation) throw new ApiError(`Unknown operation: ${type}`);

    const apiKey = await getApiKey();
    const { result, charged } = await runOperation({ apiKey, type, inputData: url, params });

    const lines = presentResult(operation, result);
    const rows = operation.outputKind === 'list' ? rowCount(result) : 0;

    return {
        ok: true,
        type,
        credits: operation.credits,
        perEmployeeBilling: operation.perEmployeeBilling,
        // Nothing found is a real, billed outcome, not a failure. The UI says so
        // rather than showing an empty panel that reads like a bug.
        found: lines.length > 0,
        charged,
        lines,
        rows,
        // The CSV is built here rather than in the content script so the row data
        // never has to cross into the page at all — only the finished text does.
        csv: rows > 0 ? toCsv(operation, result) : null,
        // What it actually cost, computed from rows returned rather than rows
        // asked for: an export capped at 200 that finds 60 is billed for 60.
        chargedCredits: operation.perEmployeeBilling && rows > 0 ? operation.credits + 0.5 * rows : operation.credits,
        raw: null,
    };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.kind !== 'string') return false;

    if (message.kind === 'page-context') {
        if (sender.tab && typeof sender.tab.id === 'number') {
            tabPages.set(sender.tab.id, { url: message.url, page: message.page });
        }
        sendResponse({ ok: true });
        return false;
    }

    if (message.kind === 'get-page-context') {
        // The popup has no tab id of its own; it asks for the active one, which the
        // worker knows only from content-script reports.
        //
        // chrome.tabs.query works WITHOUT the "tabs" permission — it just redacts
        // url and title from what it returns. Only tab.id is read here, which is
        // never redacted, so do not add "tabs" to the manifest to make this work:
        // it already works, and the URL comes from the content script instead.
        chrome.tabs
            .query({ active: true, currentWindow: true })
            .then((tabs) => {
                const tab = tabs && tabs[0];
                const context = tab && tabPages.get(tab.id);
                sendResponse({ ok: true, context: context || null });
            })
            .catch(() => sendResponse({ ok: true, context: null }));
        return true;
    }

    if (message.kind === 'connect') {
        // Only the content script running on linkfinderai.com may set a key. Any
        // other sender is rejected outright: a key arriving from anywhere else is
        // either a bug or an attempt to point the extension at someone else's
        // account, and neither should be stored.
        const origin = sender.origin || (sender.url ? new URL(sender.url).origin : '');
        if (origin !== 'https://linkfinderai.com') {
            sendResponse({ ok: false, error: 'rejected: unexpected origin' });
            return false;
        }
        if (typeof message.apiKey !== 'string' || !message.apiKey.trim()) {
            sendResponse({ ok: false, error: 'rejected: empty key' });
            return false;
        }

        const key = message.apiKey.trim();
        chrome.storage.local.get(KEY_STORAGE).then((stored) => {
            // Do not thrash storage on every page view of the site.
            if (stored[KEY_STORAGE] === key) return sendResponse({ ok: true, changed: false });
            chrome.storage.local.set({ [KEY_STORAGE]: key }).then(() => sendResponse({ ok: true, changed: true }));
        });
        return true;
    }

    if (message.kind === 'has-key') {
        getApiKey().then((key) => sendResponse({ ok: true, hasKey: Boolean(key), specVersion: SPEC_VERSION }));
        return true;
    }

    if (message.kind === 'page-type') {
        // The content script asks rather than deciding, so the URL-to-page rules
        // live in the generated module and cannot drift between the two.
        const page = pageTypeOf(message.url || '');
        sendResponse({ ok: true, page, operations: page ? operationsFor(page) : [] });
        return false;
    }

    if (message.kind === 'open-options') {
        chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        return false;
    }

    if (message.kind === 'lookup') {
        handleLookup(message)
            .then(sendResponse)
            .catch((error) => {
                const isApi = error instanceof ApiError || error.name === 'ApiError';
                sendResponse({
                    ok: false,
                    // An unexpected error's message can carry internals, so only
                    // ApiError text — which is written for users — is passed through.
                    error: isApi ? error.message : 'Something went wrong running that lookup.',
                    status: isApi ? error.status : null,
                    retryable: isApi ? error.retryable : false,
                });
            });
        return true; // response is async
    }

    return false;
});

chrome.tabs.onRemoved.addListener((tabId) => tabPages.delete(tabId));

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    // Send a first-run user to the site, not to the options page. Landing on
    // linkfinderai.com connects them automatically if they are signed in, and
    // signs them up if they are not — either way they never see the word "key".
    // The options page still exists for anyone who wants to paste one by hand.
    if (reason === 'install' && !(await getApiKey())) {
        chrome.tabs.create({
            url: 'https://linkfinderai.com/app?utm_source=chrome_extension&utm_medium=extension&utm_campaign=install',
        });
    }
});
