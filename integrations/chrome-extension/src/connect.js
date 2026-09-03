/**
 * Runs on linkfinderai.com and hands the signed-in user's API key to the
 * extension, so nobody ever has to find and paste one.
 *
 * The paste step was the whole bet. Install -> open LinkedIn -> "add an API key"
 * -> go to the app -> sign up -> find the key -> paste it is six steps before any
 * value, against Apollo's "sign in with Google". Most installs would never have
 * got past it.
 *
 * No change to the web app was needed for this. `api-access.html` derives the API
 * key from the auth token with transformerToken(), a reversible encoding rather
 * than a separate secret, so the same derivation here produces the same key from
 * the token the user already has in localStorage. A test pins this copy against
 * the one in api-access.html so the two cannot drift apart silently.
 */

/**
 * The API key derivation, copied verbatim from api-access.html.
 * DO NOT "improve" this — it must match the app byte for byte or the key it
 * produces is not the user's key. test/extension.test.mjs asserts they agree.
 */
function transformerToken(t) {
    let r = '';
    for (let i = 0; i < t.length; i++) {
        let c = t.charCodeAt(i);
        c += 7;
        r += c.toString(16).padStart(2, '0') + 'Z';
    }
    return r.slice(0, -1);
}

/**
 * The auth token, whichever spelling this page used to store it.
 *
 * app.html, account.html and history.html write `linkFinderToken`;
 * api-access.html writes `LinkFinderToken` with a capital L. localStorage keys
 * are case-sensitive, so both are read rather than guessing which page the user
 * came through.
 */
function authToken() {
    try {
        return localStorage.getItem('linkFinderToken') || localStorage.getItem('LinkFinderToken') || null;
    } catch {
        return null; // storage blocked
    }
}

async function sync() {
    const token = authToken();
    if (!token) return false;

    try {
        const response = await chrome.runtime.sendMessage({
            kind: 'connect',
            apiKey: transformerToken(token),
        });
        return Boolean(response && response.ok);
    } catch {
        // Worker asleep or extension reloaded; the next page view retries.
        return false;
    }
}

function banner(text) {
    const existing = document.getElementById('lf-connected-banner');
    if (existing) return;
    const el = document.createElement('div');
    el.id = 'lf-connected-banner';
    el.textContent = text;
    el.setAttribute(
        'style',
        [
            'position:fixed', 'right:20px', 'bottom:20px', 'z-index:2147483000',
            'padding:12px 16px', 'border-radius:10px',
            'font:600 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
            'color:#065f46', 'background:#ecfdf5', 'border:1px solid #a7f3d0',
            'box-shadow:0 8px 28px rgba(15,23,42,.16)',
        ].join(';')
    );
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
}

(async () => {
    if (await sync()) banner('LinkFinder extension connected — open any LinkedIn profile.');
})();

// The token lands after an async auth check on some pages, so one attempt at
// document_idle can be too early. A short bounded retry costs nothing and is the
// difference between connecting on this visit and on the next one.
let tries = 0;
const timer = setInterval(async () => {
    if (++tries > 10) return clearInterval(timer);
    if (await sync()) {
        clearInterval(timer);
        banner('LinkFinder extension connected — open any LinkedIn profile.');
    }
}, 1000);
