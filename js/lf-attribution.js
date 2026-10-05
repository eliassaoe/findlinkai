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

// ── Referral code capture ───────────────────────────────────────────────────
//
// Affiliates link to whatever page fits their audience (an alternative page, a
// tool page, the API docs), not only the homepage. Until this ran on every
// page, ?ref= was read on three pages (index, sign-up, app), so a partner who
// linked /phantombuster-alternative?ref=abc123xy lost the referral the moment
// the visitor clicked through.
//
// First touch wins, same rule as workers/referral: the code is stored once and
// never overwritten. /app sends it to POST /attribute after signup, and the
// worker is the one that decides whether the code is real.
(function () {
    'use strict';
    var code;
    try {
        code = (new URLSearchParams(window.location.search).get('ref') || '').trim().toLowerCase();
    } catch (e) { return; }
    // Same shape as referral_partners.code; anything else is a v1 marketing tag.
    if (!/^[a-z0-9]{6,24}$/.test(code)) return;

    var host = window.location.hostname;
    var domain = /(^|\.)linkfinderai\.com$/.test(host) ? '; domain=.linkfinderai.com' : '';
    try {
        if (!window.localStorage.getItem('lf_ref')) {
            window.localStorage.setItem('lf_ref', code);
            window.localStorage.setItem('lf_ref_at', String(Date.now()));
            if (!/(?:^|;\s*)lf_ref=/.test(document.cookie)) {
                document.cookie = 'lf_ref=' + code + '; max-age=' + (90 * 86400) + '; path=/; SameSite=Lax' + domain;
            }
            try {
                var ph = window.posthog;
                if (ph && typeof ph.register_once === 'function') ph.register_once({ referral_code: code });
                if (ph && typeof ph.capture === 'function') {
                    ph.capture('referral_link_landed', { code: code, landing_page: window.location.pathname });
                }
            } catch (e) {}
        }
    } catch (e) {}
})();

// ── Segment: agency pricing ─────────────────────────────────────────────────
//
// A visitor is "agency" when they land on any URL with utm_campaign=agency*
// or an email= parameter. Agency visitors see two plans (Pro, Business) plus a
// "Book a custom plan" card; the $49 Starter plan does not exist for them.
//
// Where the segment lives:
//   - before signup: a first-party cookie, segment=agency, 365 days;
//   - after signup:  linkfinderai_users.segment, which is the source of truth.
//     LFSegment.sync(token) copies the cookie onto a NEW account (the database
//     refuses accounts that existed before this shipped, or that already pay)
//     and then rewrites the cookie to whatever the database says, so a login
//     on another device gets agency pricing, and an existing $49 customer who
//     clicks an agency link keeps seeing their own plan.
//
// Keeping Starter out of the page source: the plan is not in any page's HTML.
// It lives in /js/lf-starter-plan.js, which LFSegment.writeStarterScript()
// loads only for visitors who are NOT agency. An agency browser never fetches
// it, so neither the card, the price nor the Dodo product ids reach it.
//
// docs/agency-pricing.md has the whole flow, the tracking plan and the checkout
// worker's server-side refusal.
(function () {
    'use strict';

    var COOKIE = 'segment';
    var AGENCY = 'agency';
    var MAX_AGE = 365 * 24 * 60 * 60;
    var SUPABASE_URL = 'https://snxhsboboatjywgwdeds.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_RKidGRs4ch1ixmRfXoYSww_UsQMSe5w';
    var STARTER_SRC = '/js/lf-starter-plan.js';

    // Paths that are redirect targets inside the product, not landing pages.
    // upgrade-confirmation.html sends every buyer to /app?email=..., which must
    // not make every buyer an agency.
    var INTERNAL_EMAIL_PATHS = /^\/(app|account|upgrade-confirmation|confirmation-signup)(\.html)?\/?$/;

    function readCookie() {
        try {
            var m = document.cookie.match(/(?:^|;\s*)segment=([^;]*)/);
            return m ? decodeURIComponent(m[1]) : null;
        } catch (e) {
            return null;
        }
    }

    function cookieDomain() {
        var host = window.location.hostname;
        return /(^|\.)linkfinderai\.com$/.test(host) ? '; Domain=linkfinderai.com' : '';
    }

    function writeCookie(value, maxAge) {
        try {
            document.cookie = COOKIE + '=' + encodeURIComponent(value)
                + '; Max-Age=' + maxAge + '; Path=/; SameSite=Lax'
                + (window.location.protocol === 'https:' ? '; Secure' : '')
                + cookieDomain();
        } catch (e) {}
    }

    function sameSiteReferrer() {
        try {
            return !!document.referrer && new URL(document.referrer).hostname === window.location.hostname;
        } catch (e) {
            return false;
        }
    }

    // Does THIS page view put the visitor in the agency segment?
    function landedAsAgency() {
        var params;
        try { params = new URLSearchParams(window.location.search); } catch (e) { return false; }
        var campaign = (params.get('utm_campaign') || '').trim().toLowerCase();
        if (campaign.indexOf(AGENCY) === 0) return true;
        // agency.html strips email= off the URL before this file runs, and
        // leaves the address in window.__lfLeadEmail.
        var hasEmail = params.has('email') || !!window.__lfLeadEmail;
        if (!hasEmail) return false;
        if (INTERNAL_EMAIL_PATHS.test(window.location.pathname)) return false;
        if (sameSiteReferrer()) return false;
        return true;
    }

    function tellPosthog(isAgency) {
        try {
            var ph = window.posthog;
            if (!ph) return;
            if (isAgency) {
                // Super property: every event from here on carries it.
                if (typeof ph.register === 'function') ph.register({ segment: AGENCY });
                if (ph.people && typeof ph.people.set === 'function') ph.people.set({ segment: AGENCY });
                else if (typeof ph.setPersonProperties === 'function') ph.setPersonProperties({ segment: AGENCY });
            } else if (typeof ph.unregister === 'function') {
                ph.unregister('segment');
            }
        } catch (e) {}
    }

    var agency = readCookie() === AGENCY;
    if (!agency && landedAsAgency()) {
        writeCookie(AGENCY, MAX_AGE);
        agency = true;
    } else if (agency) {
        // Keep the 365 days rolling from the latest visit.
        writeCookie(AGENCY, MAX_AGE);
    }
    if (agency) tellPosthog(true);

    var starterPromise = null;

    var LFSegment = {
        CUSTOM_PLAN_URL: 'https://calendly.com/hamoureliasse/linkfinder-ai',

        isAgency: function () { return agency; },
        get: function () { return agency ? AGENCY : null; },

        // Agency visitors see the plans under these names (keys are unchanged:
        // `pro` and `enterprise` are the Dodo products and database plan numbers).
        planName: function (key, fallback) {
            if (!agency) return fallback;
            if (key === 'pro') return 'Pro';
            if (key === 'enterprise') return 'Business';
            return fallback;
        },

        // The analytics id of a plan: starter / pro / business.
        planId: function (key) {
            var k = String(key || '').replace(/_(monthly|annual)$/, '');
            if (k === 'enterprise' || k === 'scale') return 'business';
            if (k === 'pro' || k === 'professional') return 'pro';
            if (k === 'starter') return 'starter';
            return k || null;
        },

        // Call synchronously from <head>, right after this file: loads the
        // Starter plan for everyone except agency visitors.
        writeStarterScript: function () {
            if (agency || window.LF_STARTER_PLAN) return;
            document.write('<script src="' + STARTER_SRC + '"><\/script>');
        },

        // The same, after the page has loaded (an account the database says is
        // not agency, in a browser whose cookie said it was).
        loadStarter: function () {
            if (window.LF_STARTER_PLAN) return Promise.resolve(window.LF_STARTER_PLAN);
            if (starterPromise) return starterPromise;
            starterPromise = new Promise(function (resolve) {
                var s = document.createElement('script');
                s.src = STARTER_SRC;
                s.onload = function () { resolve(window.LF_STARTER_PLAN || null); };
                s.onerror = function () { starterPromise = null; resolve(null); };
                document.head.appendChild(s);
            });
            return starterPromise;
        },

        // The database's answer wins. Rewrites the cookie and PostHog to match
        // and reports whether anything changed.
        applyServerSegment: function (segment) {
            var next = segment === AGENCY;
            var changed = next !== agency;
            agency = next;
            if (next) writeCookie(AGENCY, MAX_AGE);
            else writeCookie('', 0);
            tellPosthog(next);
            return changed;
        },

        // For a signed-in account: claims the segment if the cookie carries it
        // (accepted only for a brand-new account), then syncs to the database.
        // Resolves to the account's segment, or undefined if the database could
        // not be reached (the cookie is then left alone).
        sync: function (token) {
            if (!token || typeof token !== 'string' || token.length < 8) return Promise.resolve(undefined);
            return fetch(SUPABASE_URL + '/rest/v1/rpc/claim_user_segment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: SUPABASE_KEY,
                    Authorization: 'Bearer ' + SUPABASE_KEY
                },
                body: JSON.stringify({ p_token: token, p_segment: agency ? AGENCY : null })
            })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (d) {
                    if (!d || d.ok !== true) return undefined;
                    var segment = d.segment || null;
                    LFSegment.applyServerSegment(segment);
                    if (d.claimed) {
                        try { window.posthog.capture('segment_claimed', { segment: segment }); } catch (e) {}
                    }
                    return segment;
                })
                .catch(function () { return undefined; });
        }
    };

    window.LFSegment = LFSegment;
})();
