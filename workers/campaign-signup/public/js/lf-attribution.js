// Attribution capture for LinkFinder AI.
//
// Every signup in PostHog used to report an unknown UTM source: the marketing
// pages never read the campaign parameters, and `person_profiles: 'identified_only'`
// means an anonymous visitor gets no person properties to hold them either. So a
// campaign could send traffic that signed up and paid, and none of it was
// attributable to anything more specific than a referring domain.
//
// This script runs before the visitor does anything. It reads the campaign
// parameters off the landing URL, keeps both the first and the most recent touch,
// and registers them as PostHog super properties so every subsequent event on
// every page carries them — including signup_success and checkout_payment_success.
//
// First touch is the one that gets credit for discovery and is never overwritten.
// Last touch is refreshed whenever a visitor arrives with new campaign parameters,
// which is what you want for "which ad closed this deal".

(function () {
    'use strict';

    var FIRST_KEY = 'lf_attr_first';
    var LAST_KEY = 'lf_attr_last';

    var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    // Ad platforms stamp their own click ids; they identify the exact click even
    // when the UTM parameters are missing or were stripped by a redirect.
    var CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id', 'twclid'];

    function readStore(store, key) {
        try {
            var raw = store.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeStore(store, key, value) {
        try {
            store.setItem(key, JSON.stringify(value));
        } catch (e) {}
    }

    function referrerHost() {
        try {
            if (!document.referrer) return null;
            var host = new URL(document.referrer).hostname;
            // A same-site referrer is internal navigation, not an acquisition source.
            return host === window.location.hostname ? null : host;
        } catch (e) {
            return null;
        }
    }

    // Reads the current URL and referrer. Returns null when this page view carries
    // no acquisition signal at all, so internal navigation never overwrites a touch.
    function readCurrentTouch() {
        var params;
        try {
            params = new URLSearchParams(window.location.search);
        } catch (e) {
            return null;
        }

        var touch = {};
        var sawSignal = false;

        UTM_KEYS.concat(CLICK_ID_KEYS).forEach(function (key) {
            var value = params.get(key);
            if (value) {
                touch[key] = value.slice(0, 200);
                sawSignal = true;
            }
        });

        var ref = referrerHost();
        if (ref) {
            touch.referrer_domain = ref;
            sawSignal = true;
        }

        if (!sawSignal) return null;

        touch.landing_page = window.location.pathname;
        touch.landed_at = new Date().toISOString();
        return touch;
    }

    // A visitor who types the URL or opens a bookmark has no signal at all. That
    // is still a real acquisition channel and needs a name, otherwise it silently
    // reappears as "unknown" — the exact problem this file exists to fix.
    function directTouch() {
        return {
            utm_source: '(direct)',
            landing_page: window.location.pathname,
            landed_at: new Date().toISOString()
        };
    }

    function prefixed(touch, prefix) {
        var out = {};
        if (!touch) return out;
        Object.keys(touch).forEach(function (key) {
            out[prefix + key] = touch[key];
        });
        return out;
    }

    var current = readCurrentTouch();

    var first = readStore(window.localStorage, FIRST_KEY);
    if (!first) {
        first = current || directTouch();
        writeStore(window.localStorage, FIRST_KEY, first);
    }

    // Only a page view that actually carries campaign parameters or an external
    // referrer counts as a new touch; otherwise keep whatever this session had.
    var last = current || readStore(window.sessionStorage, LAST_KEY) || first;
    if (current) writeStore(window.sessionStorage, LAST_KEY, current);

    var properties = {};
    Object.assign(properties, prefixed(first, 'first_'));
    Object.assign(properties, prefixed(last, 'last_'));

    // Flat aliases for the two fields worth breaking down by in almost every
    // report, so a query does not have to pick between first_ and last_.
    properties.attribution_source = first.utm_source || first.referrer_domain || '(direct)';
    properties.attribution_campaign = first.utm_campaign || null;

    window.LF_ATTRIBUTION = properties;

    // Exposed for events that are worth stamping explicitly (payments), even
    // though super properties already attach this to everything.
    window.getAttributionProperties = function () {
        return Object.assign({}, window.LF_ATTRIBUTION || {});
    };

    // register() writes into PostHog's own persistence, so every event captured
    // from here on — on this page and every later page — carries attribution.
    // The snippet queues calls made before the SDK finishes loading, so this is
    // safe to run immediately.
    try {
        if (window.posthog && typeof window.posthog.register === 'function') {
            window.posthog.register(properties);
        }
    } catch (e) {}
})();
