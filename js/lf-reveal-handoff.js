// Hands over the result a tool page held back.
//
// In the `reveal` arm of the tool-result-reveal-gate experiment (js/lf-gate.js)
// a visitor's first lookup renders masked and "Reveal it free" sends them to
// sign up. The unmasked values wait in localStorage under lf_reveal_pending;
// this shows them on the visitor's first /app load and then forgets them, so
// the promise on the tool page is kept without asking them to search again.

(function () {
    'use strict';

    var KEY = 'lf_reveal_pending';
    var MAX_AGE_MS = 7 * 24 * 3600 * 1000;

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function capture(event, props) {
        try { if (window.posthog && window.posthog.capture) window.posthog.capture(event, props || {}); } catch (e) {}
    }

    function read() {
        try {
            var raw = localStorage.getItem(KEY);
            if (!raw) return null;
            localStorage.removeItem(KEY);
            var data = JSON.parse(raw);
            if (!data || !data.values || !data.values.length) return null;
            if (Date.now() - (data.ts || 0) > MAX_AGE_MS) return null;
            return data;
        } catch (e) { return null; }
    }

    function copy(text, btn) {
        var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, done); return; }
        } catch (e) {}
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta); done();
    }

    function show(data) {
        var card = document.createElement('div');
        card.id = 'lf-reveal-handoff';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', 'Your unlocked result');
        card.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000;width:min(420px,calc(100vw - 32px));' +
            'background:#fff;border:1px solid #bbf7d0;border-radius:12px;box-shadow:0 20px 40px rgba(15,23,42,.18);' +
            'padding:16px 18px;font-family:inherit;color:#0f172a;';

        var rows = data.values.map(function (v, i) {
            var isLink = /^(https?:\/\/|www\.)|^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(v) && v.indexOf('@') === -1;
            var href = isLink ? (/^https?:\/\//.test(v) ? v : 'https://' + v) : null;
            return '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">' +
                '<div style="flex:1;min-width:0;font-weight:600;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(v) + '">' +
                (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:none;">' + esc(v) + '</a>' : esc(v)) +
                '</div>' +
                '<button type="button" data-i="' + i + '" style="border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:4px 10px;font-size:.8rem;cursor:pointer;">Copy</button>' +
                '</div>';
        }).join('');

        card.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
              '<div style="font-weight:700;color:#14532d;">&#10003; Here&rsquo;s the result you unlocked</div>' +
              '<button type="button" data-close="1" aria-label="Close" style="border:none;background:none;font-size:1.2rem;line-height:1;cursor:pointer;color:#94a3b8;">&times;</button>' +
            '</div>' +
            (data.input ? '<div style="font-size:.8rem;color:#64748b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">For: ' + esc(data.input) + '</div>' : '') +
            rows +
            '<div style="font-size:.8rem;color:#475569;margin-top:12px;">Your free credits are ready. Run the next one below, or drop a CSV to do a whole list.</div>';

        card.addEventListener('click', function (e) {
            var t = e.target;
            if (t.getAttribute('data-close')) {
                card.parentNode.removeChild(card);
                capture('reveal_handoff_closed');
                return;
            }
            var i = t.getAttribute('data-i');
            if (i !== null) {
                copy(data.values[+i], t);
                capture('reveal_handoff_copied', { tool: data.tool });
            }
        });

        document.body.appendChild(card);
        capture('reveal_handoff_shown', { tool: data.tool, values: data.values.length });
    }

    // Only a signed-in load may consume the value: /app bounces visitors
    // without a token to the homepage, and the result must survive that.
    function signedIn() {
        try {
            return !!(new URLSearchParams(window.location.search).get('token') || localStorage.getItem('linkFinderToken'));
        } catch (e) { return false; }
    }

    function start() {
        if (!signedIn()) return;
        var data = read();
        // After the app's own first-load UI has settled.
        if (data) setTimeout(function () { show(data); }, 1200);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
