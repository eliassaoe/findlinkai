// LinkedIn URL parsing shared by the free tool pages.
//
// The per-page validators this replaces only accepted `linkedin.com` and
// `www.linkedin.com`. LinkedIn serves most of the world from a country
// subdomain — fr.linkedin.com, in.linkedin.com, ua.linkedin.com, jp.linkedin.com —
// and that is the URL people copy out of their address bar. So a perfectly good
// profile link was marked invalid, the field turned red, and on two of the pages
// the submit button was disabled outright. The visitor was left clicking a form
// that would not respond, which is exactly what the rage-click data showed:
// ~60 people per fortnight hammering the URL input on linkedin-email-finder alone.
//
// Rejecting a valid URL is far more expensive than accepting a doubtful one — a
// bad URL just returns no result, while a false rejection loses the visitor. So
// these accept anything that plausibly identifies a LinkedIn entity and let the
// API be the judge.

(function () {
    'use strict';

    // Any single-label subdomain (country codes, plus www) or none at all.
    var HOST = /^(?:[a-z0-9-]+\.)?linkedin\.com$/i;

    // /in/ is the modern profile path; /pub/ is the legacy one still in circulation.
    var PROFILE_PATH = /^\/(in|pub)\/[^\/]+/i;
    var COMPANY_PATH = /^\/(company|school|showcase)\/[^\/]+/i;

    // Accepts input with or without a scheme, since people paste both.
    function parse(url) {
        if (typeof url !== 'string') return null;
        var raw = url.trim();
        if (!raw) return null;

        if (!/^https?:\/\//i.test(raw)) {
            if (!/^[a-z0-9-]*\.?linkedin\.com/i.test(raw)) return null;
            raw = 'https://' + raw;
        }

        var parsed;
        try {
            parsed = new URL(raw);
        } catch (e) {
            return null;
        }

        if (!HOST.test(parsed.hostname)) return null;

        // Locale-prefixed paths, e.g. linkedin.com/fr/in/someone
        var path = parsed.pathname.replace(/^\/[a-z]{2}(?=\/(in|pub|company|school|showcase)\/)/i, '');
        // A trailing slash is not part of the identity.
        path = path.replace(/\/+$/, '') || '/';

        return { url: parsed, path: path };
    }

    function isProfileUrl(url) {
        var p = parse(url);
        return !!(p && PROFILE_PATH.test(p.path));
    }

    function isCompanyUrl(url) {
        var p = parse(url);
        return !!(p && COMPANY_PATH.test(p.path));
    }

    // Canonical form: always https, always www, no query string or fragment.
    // Tracking parameters and country subdomains are noise to the lookup API and
    // make otherwise-identical URLs look like different ones in the history.
    function normalize(url) {
        var p = parse(url);
        if (!p) return null;
        if (!PROFILE_PATH.test(p.path) && !COMPANY_PATH.test(p.path)) return null;
        return 'https://www.linkedin.com' + p.path;
    }

    window.LFLinkedIn = {
        parse: parse,
        isProfileUrl: isProfileUrl,
        isCompanyUrl: isCompanyUrl,
        normalize: normalize
    };
})();
