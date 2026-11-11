// Black Friday 2026 lifetime-deal banner (docs/black-friday-ltd-2026.md).
// Loaded by js/lf-attribution.js on every page that includes it (app, home,
// every free tool). It removes itself after END, so nothing needs undoing.
//
//   until 26 Nov 08:00 UTC  "Early Black Friday" bar, no timer
//   last 5 days             countdown (a 19-day timer builds no urgency)
//   after END               nothing
//
// Hidden on the deal and redeem pages, after a dismiss (for 24 h), and for
// accounts that already paid or already hold a lifetime plan: the deal page
// refuses them anyway (ltd_eligibility), so showing it would only frustrate.
(function () {
    'use strict';
    var END = Date.parse('2026-12-01T07:59:00Z');
    var TIMER_FROM = END - 5 * 864e5;
    var now = Date.now();
    if (!(now < END)) return;
    var path = location.pathname.replace(/\.html$/, '');
    if (/^\/(lifetime-deal|redeem-code|redeem|account|account-beta|verify-email)\/?$/.test(path)) return;
    // The deal page is English-only: no banner on the /fr/ /de/ /es/ tool pages (seo_2026_11/i18n).
    if (/^\/(fr|de|es)\//.test(path)) return;
    var DISMISS_KEY = 'lf_bf26_banner_dismissed';
    try { var d = Number(localStorage.getItem(DISMISS_KEY) || 0); if (d && now - d < 864e5) return; } catch (e) {}

    var SUPABASE_URL = 'https://snxhsboboatjywgwdeds.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_RKidGRs4ch1ixmRfXoYSww_UsQMSe5w';
    var token = null;
    try { token = localStorage.getItem('linkFinderToken') || localStorage.getItem('lf_token_backup'); } catch (e) {}
    if (token && token.length < 8) token = null;

    function capture(ev, props) { try { if (window.posthog && posthog.capture) posthog.capture(ev, props || {}); } catch (e) {} }

    function eligible() {
        if (!token) return Promise.resolve(true);
        return fetch(SUPABASE_URL + '/rest/v1/rpc/ltd_eligibility', {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_token: token })
        }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (e) { return !(e && e.known && (e.paid_before || e.has_ltd)); })
          .catch(function () { return true; });
    }

    function pad(n) { return String(n).padStart(2, '0'); }
    function left() {
        var ms = END - Date.now();
        if (ms <= 0) return '';
        var dd = Math.floor(ms / 864e5), hh = Math.floor(ms / 36e5) % 24, mm = Math.floor(ms / 6e4) % 60, ss = Math.floor(ms / 1e3) % 60;
        return (dd ? dd + 'd ' : '') + pad(hh) + 'h ' + pad(mm) + 'm ' + pad(ss) + 's';
    }

    function render() {
        if (document.getElementById('lf-bf26')) return;
        var early = Date.now() < Date.parse('2026-11-27T08:00:00Z');
        var href = '/lifetime-deal?utm_source=site_banner&utm_medium=banner&utm_campaign=bf2026&utm_content=' + encodeURIComponent(path || '/');
        var bar = document.createElement('div');
        bar.id = 'lf-bf26';
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'Black Friday offer');
        bar.style.cssText = 'position:relative;z-index:60;background:#111827;color:#fff;font:600 14px/1.4 Inter,system-ui,-apple-system,sans-serif;padding:10px 44px 10px 16px;text-align:center';
        var label = early ? 'Early Black Friday' : 'Black Friday';
        bar.innerHTML =
            '<a href="' + href + '" style="color:#fff;text-decoration:none">' +
            '<span style="background:#f59e0b;color:#111827;border-radius:999px;padding:2px 9px;margin-right:8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase">' + label + '</span>' +
            'LinkFinder AI for life: pay once, get credits every month. From $149.' +
            '<span id="lf-bf26-t" style="color:#fcd34d;margin-left:8px"></span>' +
            '<span style="text-decoration:underline;margin-left:8px">See the deal &rarr;</span></a>' +
            '<button type="button" aria-label="Hide this offer" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:0;color:#9ca3af;font-size:20px;line-height:1;cursor:pointer">&times;</button>';
        bar.querySelector('a').addEventListener('click', function () { capture('bf_banner_clicked', { page: path }); });
        bar.querySelector('button').addEventListener('click', function () {
            try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
            bar.remove();
            capture('bf_banner_dismissed', { page: path });
        });
        document.body.insertBefore(bar, document.body.firstChild);
        capture('bf_banner_shown', { page: path, early: early });
        var t = document.getElementById('lf-bf26-t');
        function tick() {
            if (Date.now() >= END) { bar.remove(); return; }
            t.textContent = Date.now() >= TIMER_FROM ? 'Ends in ' + left() : '';
        }
        tick();
        setInterval(tick, 1000);
    }

    eligible().then(function (ok) {
        if (!ok) return;
        if (document.body) render(); else document.addEventListener('DOMContentLoaded', render);
    });
})();
