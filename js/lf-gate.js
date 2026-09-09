// Free-tool gate and widget instrumentation for the marketing/tool pages.
//
// Two problems this file exists to solve, both measured in PostHog:
//
// 1. The tool pages gave away 3–10 free lookups before asking for anything. For
//    almost every visitor that is the entire job done, so there was never a
//    reason to make an account: ~2,700 widget uses in a fortnight produced 4
//    click-throughs to sign-up. One free lookup still proves the tool works —
//    it just stops the page from being a complete free replacement for the
//    product.
//
// 2. Only 3 of the 26 tool pages captured any widget analytics at all, so the
//    top of the funnel read as a flat zero on pages that were in fact busy.
//    Rather than edit 26 differently-written search functions, this hooks the
//    markup pattern they genuinely share (`button.btn-full` for the primary
//    action, `#limitModal` for the gate) with delegated listeners.

(function () {
    'use strict';

    // Single source of truth for the gate. Every tool page reads this instead of
    // its own hardcoded 3 or 10, so tuning it is a one-line change here.
    window.LF_FREE_LOOKUPS = 1;

    function toolName() {
        var path = window.location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
        return path || 'home';
    }

    function capture(event, props) {
        try {
            if (window.posthog && typeof window.posthog.capture === 'function') {
                window.posthog.capture(event, Object.assign({ tool: toolName() }, props || {}));
            }
        } catch (e) {}
    }

    window.lfTrackWidget = capture;

    // 19 tool pages carry a sticky "Sign Up Free" button whose onclick calls
    // trackEvent(), a function only company-url-finder.html ever defined. Every
    // click on the site's most persistent CTA therefore threw a ReferenceError
    // and recorded nothing — PostHog error tracking caught it on
    // /linkedin-email-finder. One shim here beats editing 19 files, and a page
    // that declares its own trackEvent still wins, because a global function
    // declaration overwrites this assignment.
    if (typeof window.trackEvent !== 'function') {
        window.trackEvent = function (name, props) { capture(name, props); };
    }

    // The action a button triggers is a better label than its visible text,
    // which changes with loading states and translations.
    function actionOf(el) {
        var onclick = el.getAttribute('onclick') || '';
        var match = onclick.match(/([a-zA-Z_$][\w$]*)\s*\(/);
        if (match) return match[1];
        var text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        return text.slice(0, 40) || 'unknown';
    }

    document.addEventListener('click', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('button, a') : null;
        if (!el) return;

        // Sign-up links: the conversion this whole page exists to produce.
        if (el.tagName === 'A' && (el.getAttribute('href') || '').indexOf('/sign-up') !== -1) {
            var inGate = !!(el.closest && el.closest('#limitModal'));
            var isOffer = el.getAttribute('data-lf-offer') === '1';
            var event = isOffer ? 'first_result_offer_clicked'
                      : inGate ? 'free_limit_cta_clicked'
                      : 'widget_result_cta_clicked';
            var props = {
                placement: isOffer ? 'first_result' : inGate ? 'gate_modal' : 'page'
            };
            if (isOffer) {
                props.variant = 'spreadsheet';
                props.route = el.getAttribute('data-lf-route') || 'csv';
            }
            capture(event, props);
            return;
        }

        if (el.tagName !== 'BUTTON') return;

        // "Try example" buttons are the secondary style on every one of these pages.
        if (el.classList.contains('btn-secondary')) {
            capture('widget_example_clicked', { action: actionOf(el) });
            return;
        }

        // The primary widget action is `btn btn-full` across all 26 tool pages.
        // Pages that already fire widget_cta_clicked from inside their own search
        // function set LF_WIDGET_SELF_TRACKED so this doesn't double-count them.
        if (el.classList.contains('btn-full') && !window.LF_WIDGET_SELF_TRACKED) {
            capture('widget_cta_clicked', { action: actionOf(el) });
        }
    }, true);

    // Blur whatever is on the results panel while the gate is up. The visitor
    // keeps their first answer in full — the gate only appears when they go for
    // a second one — so this is their previous result softening behind the
    // paywall, which shows what an account buys without hiding what they were
    // already given.
    var BLUR_STYLE_ID = 'lf-gate-blur-style';

    function ensureBlurStyle() {
        if (document.getElementById(BLUR_STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = BLUR_STYLE_ID;
        style.textContent =
            '.lf-gated-blur{filter:blur(6px);opacity:.55;transition:filter .35s ease,opacity .35s ease;' +
            'pointer-events:none;user-select:none;}' +
            '@media (prefers-reduced-motion: reduce){.lf-gated-blur{transition:none;}}';
        document.head.appendChild(style);
    }

    function setResultsBlurred(on) {
        var results = document.getElementById('resultsSection');
        if (!results) return;
        // Nothing to tease if no result was ever rendered.
        if (on && results.classList.contains('hidden')) return;
        ensureBlurStyle();
        results.classList.toggle('lf-gated-blur', !!on);
    }

    // Opening the gate. Seven tool pages used to answer a spent free lookup with
    // `location.href = '/sign-up'`, which throws the page away: the visitor loses
    // the result they just got, and with it the only reason to make an account.
    // The modal keeps them on the page with that result blurred behind it, which
    // is what the other 19 pages already do. Exposed here so those pages call one
    // implementation rather than seven.
    function openGate() {
        var modal = document.getElementById('limitModal');
        if (!modal) return false;
        modal.style.display = 'flex';
        // watchGate()'s observer fires on the style change and handles both the
        // blur and free_limit_modal_shown, so there is nothing else to do here.
        return true;
    }

    window.lfOpenGate = openGate;

    // ---- Offer on the first result -------------------------------------------
    //
    // The gate only fires when someone goes for a second lookup, and most people
    // never do: of 31 visitors who used a widget in the first eight hours after
    // launch, 7 reached the gate. The other 24 got their answer and left without
    // being asked for anything at all.
    //
    // So this asks them, at the one moment they are demonstrably happy — the
    // result is on screen and it worked. It sits under the result rather than
    // over it, and it takes nothing away.
    //
    // What it asks changed. The first version pitched an account ("Want 50 more
    // lookups?"): 3,283 shown, 31 clicked, 0.9%. People who paid for this
    // product did one of two things first — uploaded a CSV (4.4% go on to pay)
    // or copied an API key (2.8%); those who did neither pay at 0.14%. So the
    // offer no longer describes a feature. It draws the result the visitor just
    // got as row 1 of a spreadsheet, with empty rows under it, and asks them to
    // fill those in — with a CSV, in Google Sheets, from code, or into a CRM.
    // Each route carries an ?intent= that /app honours on first load, so the
    // account they create opens on the thing they came for.

    var OFFER_ID = 'lf-first-result-offer';
    var OFFER_STYLE_ID = 'lf-first-result-offer-style';
    var SIGN_UP = 'https://linkfinderai.com/sign-up';

    function ensureOfferStyle() {
        if (document.getElementById(OFFER_STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = OFFER_STYLE_ID;
        style.textContent =
            '#' + OFFER_ID + '{margin:1rem 0 0;padding:1.15rem 1.25rem;border-radius:12px;border:1px solid #bfdbfe;' +
              'background:linear-gradient(135deg,#eff6ff,#f5f9ff);font-family:inherit;}' +
            '#' + OFFER_ID + ' .lfo-title{font-weight:700;color:#1e3a8a;font-size:1rem;margin-bottom:.15rem;}' +
            '#' + OFFER_ID + ' .lfo-sub{color:#3b5b8c;font-size:.85rem;line-height:1.5;margin-bottom:.8rem;}' +
            '#' + OFFER_ID + ' .lfo-sheet{overflow-x:auto;border:1px solid #c7d7f5;border-radius:8px;background:#fff;margin-bottom:.9rem;}' +
            '#' + OFFER_ID + ' table{border-collapse:collapse;width:100%;font-size:.8rem;min-width:320px;}' +
            '#' + OFFER_ID + ' th{background:#f1f5f9;color:#475569;font-weight:600;text-align:left;padding:.45rem .7rem;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;white-space:nowrap;}' +
            '#' + OFFER_ID + ' td{padding:.45rem .7rem;border-bottom:1px solid #eef2f7;border-right:1px solid #eef2f7;color:#0f172a;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '#' + OFFER_ID + ' th:first-child,#' + OFFER_ID + ' td:first-child{width:2.2rem;text-align:center;color:#94a3b8;background:#f8fafc;}' +
            '#' + OFFER_ID + ' tr.lfo-filled td{background:#f0fdf4;}' +
            '#' + OFFER_ID + ' tr.lfo-ghost td{color:#cbd5e1;font-style:italic;}' +
            '#' + OFFER_ID + ' tr:last-child td{border-bottom:none;}' +
            '#' + OFFER_ID + ' .lfo-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1rem;}' +
            '#' + OFFER_ID + ' .lfo-cta{background:#2563eb;color:#fff;font-weight:600;font-size:.9rem;padding:.7rem 1.15rem;border-radius:8px;text-decoration:none;white-space:nowrap;}' +
            '#' + OFFER_ID + ' .lfo-cta:hover{background:#1d4ed8;}' +
            '#' + OFFER_ID + ' .lfo-routes{color:#64748b;font-size:.8rem;line-height:1.6;}' +
            '#' + OFFER_ID + ' .lfo-routes a{color:#2563eb;font-weight:600;text-decoration:none;}' +
            '#' + OFFER_ID + ' .lfo-routes a:hover{text-decoration:underline;}';
        document.head.appendChild(style);
    }

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function trunc(v, n) { v = String(v == null ? '' : v); return v.length > n ? v.slice(0, n - 1) + '\u2026' : v; }

    // What the visitor typed: the first filled-in text field outside the gate.
    function visitorInput() {
        try {
            if (!document.querySelectorAll) return '';
            var inputs = document.querySelectorAll('input[type="text"],input[type="url"],input[type="email"],input[type="search"],input:not([type])');
            for (var i = 0; i < inputs.length; i++) {
                var v = (inputs[i].value || '').trim();
                if (!v) continue;
                if (inputs[i].closest && inputs[i].closest('#limitModal')) continue;
                return v;
            }
        } catch (e) {}
        return '';
    }

    // What they got back: the first line of the result panel that looks like a
    // value (an address, a URL, a number), else its first line of text.
    function visitorResult() {
        try {
            var el = document.getElementById('singleResultContent') || document.getElementById('resultContent') ||
                     document.getElementById('singleResult') || document.getElementById('resultsSection');
            var text = el ? (el.innerText || el.textContent || '') : '';
            var lines = String(text).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            for (var i = 0; i < lines.length; i++) {
                if (/@|https?:\/\/|linkedin\.com|instagram\.com|\+?\d[\d\s().-]{6,}/.test(lines[i]) && !/account|sign up|free/i.test(lines[i])) {
                    return lines[i];
                }
            }
            for (var j = 0; j < lines.length; j++) {
                if (!/account|sign up|free|result/i.test(lines[j])) return lines[j];
            }
        } catch (e) {}
        return '';
    }

    function route(intent, label) {
        return '<a href="' + SIGN_UP + '?intent=' + intent + '" data-lf-offer="1" data-lf-route="' + intent + '">' + label + '</a>';
    }

    // Tool pages send signed-in visitors to /app, but that redirect races the
    // first paint — checking directly avoids pitching an account to someone who
    // already has one.
    function alreadyHasAccount() {
        try {
            if (localStorage.getItem('linkFinderToken')) return true;
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && /FinderUser$/.test(key)) return true;
            }
        } catch (e) {}
        return false;
    }

    function buildOffer() {
        ensureOfferStyle();
        var input = visitorInput();
        var result = visitorResult() || 'Found';
        var ghost = function (i) { return '<tr class="lfo-ghost"><td>' + i + '</td><td>&mdash;</td><td>&mdash;</td></tr>'; };

        var el = document.createElement('div');
        el.id = OFFER_ID;
        el.innerHTML =
            '<div class="lfo-title">That&rsquo;s row 1. Your whole list is next.</div>' +
            '<div class="lfo-sub">A free account runs this same lookup on every row of a CSV in one go &mdash; credits included, no card needed.</div>' +
            '<div class="lfo-sheet"><table>' +
              '<thead><tr><th></th><th>Input</th><th>Result</th></tr></thead><tbody>' +
              '<tr class="lfo-filled"><td>1</td>' +
                '<td title="' + esc(input) + '">' + esc(trunc(input || 'your lookup', 48)) + '</td>' +
                '<td title="' + esc(result) + '">' + esc(trunc(result, 48)) + '</td></tr>' +
              ghost(2) + ghost(3) + ghost(4) +
            '</tbody></table></div>' +
            '<div class="lfo-actions">' +
              '<a href="' + SIGN_UP + '?intent=csv" data-lf-offer="1" data-lf-route="csv" class="lfo-cta">Enrich my list free &rarr;</a>' +
              '<div class="lfo-routes">Or run it ' +
                route('sheets', 'inside Google Sheets') + ' &middot; ' +
                route('api', 'from the API') + ' &middot; ' +
                route('crm', 'straight into HubSpot') +
              '</div>' +
            '</div>';
        return el;
    }

    // Five tool pages render their own "Save this result" card inside the
    // result. Two asks stacked under one answer is one too many, so that card
    // steps aside when this one is on screen.
    function hideOwnResultCta() {
        try {
            var own = document.querySelector ? document.querySelector('.post-result-cta') : null;
            if (own) own.style.display = 'none';
        } catch (e) {}
    }

    function maybeShowFirstResultOffer() {
        if (document.getElementById(OFFER_ID)) return;   // once per page view
        if (alreadyHasAccount()) return;

        var results = document.getElementById('resultsSection');
        if (!results || results.classList.contains('hidden')) return;

        // Never stack it under the gate — that visitor is already being asked.
        var modal = document.getElementById('limitModal');
        if (modal && modal.style.display === 'flex') return;

        results.parentNode.insertBefore(buildOffer(), results.nextSibling);
        hideOwnResultCta();
        capture('first_result_offer_shown', { variant: 'spreadsheet' });
    }

    function watchForFirstResult() {
        var results = document.getElementById('resultsSection');
        if (!results || typeof MutationObserver === 'undefined') return;

        maybeShowFirstResultOffer();   // in case a result is already rendered

        new MutationObserver(function () {
            maybeShowFirstResultOffer();
        }).observe(results, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    // The gate modal is shown by pages writing style.display directly, in ~26
    // different call sites. Watching the element is cheaper and safer than
    // rewriting all of them, and catches any future call site for free.
    function watchGate() {
        var modal = document.getElementById('limitModal');
        if (!modal || typeof MutationObserver === 'undefined') return;

        function report() {
            capture('free_limit_modal_shown', { free_lookups: window.LF_FREE_LOOKUPS });
        }

        function sync(isVisible) {
            setResultsBlurred(isVisible);
        }

        // A visitor who already spent their free lookup gets the gate during page
        // init, before this observer could attach. That is the single most
        // important moment to measure, so check the state we start in rather than
        // only reacting to changes from it.
        var wasVisible = modal.style.display === 'flex';
        if (wasVisible) { report(); sync(true); }

        new MutationObserver(function () {
            var isVisible = modal.style.display === 'flex';
            if (isVisible && !wasVisible) report();
            if (isVisible !== wasVisible) sync(isVisible);
            wasVisible = isVisible;
        }).observe(modal, { attributes: true, attributeFilter: ['style'] });
    }

    function start() {
        watchGate();
        watchForFirstResult();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
