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
            capture(inGate ? 'free_limit_cta_clicked' : 'widget_result_cta_clicked', {
                placement: inGate ? 'gate_modal' : 'page'
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchGate);
    } else {
        watchGate();
    }
})();
