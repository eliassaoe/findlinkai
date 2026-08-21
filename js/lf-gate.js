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
            capture(event, {
                placement: isOffer ? 'first_result' : inGate ? 'gate_modal' : 'page'
            });
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

    // ---- Offer on the first result -------------------------------------------
    //
    // The gate only fires when someone goes for a second lookup, and most people
    // never do: of 31 visitors who used a widget in the first eight hours after
    // launch, 7 reached the gate. The other 24 got their answer and left without
    // being asked for anything at all.
    //
    // So this asks them, at the one moment they are demonstrably happy — the
    // result is on screen and it worked. It sits under the result rather than
    // over it, it takes nothing away, and it leads with what an account gives
    // (150 credits, one per lookup) instead of what it withholds.

    var OFFER_ID = 'lf-first-result-offer';

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
        var el = document.createElement('div');
        el.id = OFFER_ID;
        el.setAttribute('style', [
            'margin:1rem 0 0', 'padding:1.15rem 1.25rem', 'border-radius:12px',
            'border:1px solid #bfdbfe', 'background:linear-gradient(135deg,#eff6ff,#f5f9ff)',
            'display:flex', 'flex-wrap:wrap', 'gap:.9rem',
            'align-items:center', 'justify-content:space-between'
        ].join(';'));
        el.innerHTML =
            '<div style="flex:1 1 260px;min-width:0;">' +
              '<div style="font-weight:700;color:#1e3a8a;font-size:1rem;margin-bottom:.2rem;">' +
                'Want 150 more lookups?' +
              '</div>' +
              '<div style="color:#3b5b8c;font-size:.875rem;line-height:1.5;">' +
                'A free account comes with 150 credits &mdash; one per lookup &mdash; plus bulk CSV and API access. No card needed.' +
              '</div>' +
            '</div>' +
            '<a href="https://linkfinderai.com/sign-up" data-lf-offer="1" ' +
               'style="background:#2563eb;color:#fff;font-weight:600;font-size:.9rem;' +
               'padding:.7rem 1.15rem;border-radius:8px;text-decoration:none;white-space:nowrap;">' +
              'Create free account &rarr;' +
            '</a>';
        return el;
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
        capture('first_result_offer_shown');
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
