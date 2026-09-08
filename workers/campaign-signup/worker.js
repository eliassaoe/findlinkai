// campaign-signup
//
// Static assets in ./public are served before this runs (run_worker_first is
// off), so the signup page, the Google return page and the attribution script
// never reach here. Anything else is a path this domain does not host: hand it
// to the real site. That keeps the throwaway domain from ever showing a 404,
// which is what a curious recipient (or a filter) would see if they trimmed
// the link.
const MAIN_SITE = 'https://linkfinderai.com';

export default {
    async fetch(request) {
        const url = new URL(request.url);
        return Response.redirect(MAIN_SITE + url.pathname + url.search, 302);
    }
};
