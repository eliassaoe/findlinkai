// CHECKOUT DOCTOR — paste this into the browser console on https://linkfinderai.com/app
//
// Why this exists: every client-side guard passes on the way to Dodo (valid URL,
// right host, matching env, zero checkout_error), and the visitor still comes
// back seconds later having typed nothing. That means the failure is in the
// worker's response or in the session Dodo builds from it — neither of which is
// visible from the browser today, and neither of which lives in a git repo.
//
// This calls the exact same worker the app calls, with the exact same payload,
// and prints the raw answer. Copy the whole output back.
//
// It does NOT charge anything. Creating a checkout session moves no money.

(async () => {
  const WORKER = 'https://dodo-checkout.hamoureliasse.workers.dev/';
  const out = [];
  const log = (...a) => { out.push(a.join(' ')); console.log(...a); };

  const token = localStorage.getItem('linkFinderToken')
    || new URLSearchParams(location.search).get('token');

  log('=== CHECKOUT DOCTOR ===');
  log('time      :', new Date().toISOString());
  log('origin    :', location.origin);
  log('token     :', token ? `present (${token.length} chars)` : 'MISSING — log in first');
  if (!token) return console.log(out.join('\n'));

  // Same payload shape as createCheckoutSessionViaWorker() in app.html.
  const payload = {
    plan: 'starter_monthly',
    user_token: token,
    force_new_session: true,
    request_id: 'doctor_' + Date.now(),
    requested_at: new Date().toISOString()
  };

  let resp, bodyText;
  const startedAt = performance.now();
  try {
    resp = await fetch(WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    bodyText = await resp.text();
  } catch (e) {
    log('WORKER FETCH FAILED:', e.name, e.message);
    return console.log('\n' + out.join('\n'));
  }

  log('elapsed   :', Math.round(performance.now() - startedAt) + 'ms');
  log('HTTP      :', resp.status, resp.statusText);
  resp.headers.forEach((v, k) => log('header    :', k + ': ' + v));

  let data = {};
  try { data = JSON.parse(bodyText); } catch (_) {}

  log('--- RAW BODY ---');
  log(bodyText.slice(0, 2000));
  log('--- PARSED ---');
  log('checkout_url :', data.checkout_url || '(none)');
  log('env          :', data.env || '(not returned)');
  log('error        :', data.error || '(none)');
  log('other keys   :', Object.keys(data).join(', ') || '(none)');

  // The single most important line: is the session Dodo built actually alive?
  // A cross-origin fetch cannot read the response, but "opaque vs network error"
  // still separates "the page exists" from "the session is dead".
  if (data.checkout_url) {
    try {
      new URL(data.checkout_url);
      await fetch(data.checkout_url, { mode: 'no-cors', redirect: 'follow' });
      log('reachability : Dodo responded (session URL resolves)');
    } catch (e) {
      log('reachability : FAILED —', e.name, e.message);
    }
    log('');
    log('>>> NOW OPEN THIS URL IN A NEW TAB AND SAY WHAT YOU SEE <<<');
    log(data.checkout_url);
    try { window.open(data.checkout_url, '_blank', 'noopener'); } catch (_) {}
  }

  log('=== END ===');
  console.log('\n' + out.join('\n'));
  try {
    await navigator.clipboard.writeText(out.join('\n'));
    console.log('%c(copied to clipboard — just paste it back)', 'color:#16a34a;font-weight:bold');
  } catch (_) {
    console.log('%c(select the block above and copy it)', 'color:#b45309;font-weight:bold');
  }
})();
