// Verification tests for the onboarding tasks worker.
//   node workers/onboarding-tasks/test-review-urls.mjs
import { classifyReviewUrl, reviewUrlKey, fetchVerifyReview } from './worker.js';

let pass = 0, fail = 0;
const v = (t, u, o) => classifyReviewUrl(t, u, o).verdict;

function is(label, actual, expected) {
    if (actual === expected) { pass++; console.log(`  pass  ${label}`); }
    else { fail++; console.log(`  FAIL  ${label}: expected ${expected}, got ${actual}`); }
}

console.log('\nG2 — product identity is in the URL, so it is fully checkable');
is('permalink accepted', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-10432117'), 'auto_approve');
is('/fr/ locale accepted', v('g2_review','https://www.g2.com/fr/products/linkfinder-ai/reviews/linkfinder-ai-review-104'), 'auto_approve');
is('survey_responses accepted', v('g2_review','https://www.g2.com/survey_responses/linkfinder-ai-review-9981234'), 'auto_approve');
is('reviews index page rejected', v('g2_review','https://www.g2.com/fr/products/linkfinder-ai/reviews'), 'reject');
is('review of another product rejected', v('g2_review','https://www.g2.com/products/apollo-io/reviews/apollo-io-review-765'), 'reject');
is('near-miss slug rejected', v('g2_review','https://www.g2.com/products/not-linkfinder-ai/reviews/r-1'), 'reject');
is('homepage rejected', v('g2_review','https://www.g2.com/'), 'reject');

console.log('\nTrustpilot — company is NOT in the URL; only shape and uniqueness');
is('permalink accepted', v('trustpilot_review','https://www.trustpilot.com/reviews/6512a4f1c9d2b30011a7e881'), 'auto_approve');
is('lang subdomain accepted', v('trustpilot_review','https://fr.trustpilot.com/reviews/6512a4f1c9d2b30011a7e882'), 'auto_approve');
is('our company page rejected', v('trustpilot_review','https://fr.trustpilot.com/review/linkfinderai.com'), 'reject');
is('other company page rejected', v('trustpilot_review','https://www.trustpilot.com/review/apollo.io'), 'reject');
is('short id rejected', v('trustpilot_review','https://www.trustpilot.com/reviews/abc123'), 'reject');
is('policy=manual queues it', v('trustpilot_review','https://www.trustpilot.com/reviews/6512a4f1c9d2b30011a7e883',{trustpilotPolicy:'manual'}), 'manual');
is('policy does not affect G2', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-9',{trustpilotPolicy:'manual'}), 'auto_approve');

console.log('\nKill switches');
is('G2_POLICY=manual queues G2', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-1',{g2Policy:'manual'}), 'manual');
is('G2_POLICY does not affect Trustpilot', v('trustpilot_review','https://www.trustpilot.com/reviews/6512a4f1c9d2b30011a7e885',{g2Policy:'manual'}), 'auto_approve');

console.log('\nFabricated ids still pass SHAPE — which is why existence is checked separately');
// The real URL that exposed this: correct product, invented review id.
is('fabricated id passes shape', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-13270299'), 'auto_approve');
is('fabricated id yields a key to check',
   reviewUrlKey('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-13270299'),
   'g2:linkfinder-ai-review-13270299');
// Shape alone cannot separate these two, so nothing downstream may trust it.
is('incrementing the id also passes shape', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-13270300'), 'auto_approve');

console.log('\nJunk and evasion');
is('empty rejected', v('g2_review',''), 'reject');
is('null rejected', v('g2_review', null), 'reject');
is('prose rejected', v('g2_review','i left a review honest'), 'reject');
is('javascript: rejected', v('g2_review','javascript:alert(1)'), 'reject');
is('lookalike host rejected', v('g2_review','https://g2.com.evil.example/products/linkfinder-ai/reviews/x-1'), 'reject');
is('prefixed host rejected', v('g2_review','https://notg2.com/products/linkfinder-ai/reviews/x-1'), 'reject');
is('trustpilot lookalike rejected', v('trustpilot_review','https://trustpilot.com.evil.example/reviews/6512a4f1c9d2b30011a7e884'), 'reject');
is('unknown task rejected', v('some_other_task','https://www.g2.com/products/linkfinder-ai/reviews/r-1'), 'reject');
is('cross-task url rejected', v('trustpilot_review','https://www.g2.com/products/linkfinder-ai/reviews/r-1'), 'reject');

console.log('\nCanonicalisation — one review must yield exactly one key');
const base = reviewUrlKey('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555');
is('key value', base, 'g2:linkfinder-ai-review-555');
for (const [label, url] of [
    ['no www',        'https://g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555'],
    ['http',          'http://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555'],
    ['locale',        'https://www.g2.com/fr/products/linkfinder-ai/reviews/linkfinder-ai-review-555'],
    ['query string',  'https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555?utm_source=x'],
    ['fragment',      'https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555#top'],
    ['uppercase',     'HTTPS://WWW.G2.COM/PRODUCTS/LINKFINDER-AI/REVIEWS/LINKFINDER-AI-REVIEW-555'],
    ['surrounding ws','  https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555  '],
    ['trailing slash','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555/'],
]) is(`same key: ${label}`, reviewUrlKey('g2_review', url), base);

const tp = reviewUrlKey('trustpilot_review','https://www.trustpilot.com/reviews/6512a4f1c9d2b30011a7e881');
is('trustpilot key', tp, 'tp:6512a4f1c9d2b30011a7e881');
is('trustpilot same key across langs',
   reviewUrlKey('trustpilot_review','https://de.trustpilot.com/reviews/6512a4f1c9d2b30011a7e881?utm=1'), tp);

console.log('\nRejections must tell the user what to do');
const landing = classifyReviewUrl('trustpilot_review','https://fr.trustpilot.com/review/linkfinderai.com');
is('landing-page message names the mistake', /address bar/.test(landing.reason), true);
is('rejected keys are not claimed', landing.key, null);

console.log('\nThe write form is not a review — this is the bypass people were using');
// We told people to go to /reviews/start, and pasting that same link back
// classified as auto_approve with the key "g2:start". The hard part of the
// task was writing a review; this skipped it entirely.
for (const slug of ['start','new','write','edit','video','videos','take_survey','survey','thank_you','thanks']) {
    is(`/reviews/${slug} rejected`, v('g2_review', `https://www.g2.com/products/linkfinder-ai/reviews/${slug}`), 'reject');
}
is('arbitrary slug rejected', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/anything-at-all'), 'reject');
is('single letter rejected', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/x'), 'reject');
is('non-numeric review id rejected', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-abc'), 'reject');
is('survey_responses needs a numeric id too', v('g2_review','https://www.g2.com/survey_responses/linkfinder-ai-whatever'), 'reject');
is('write form claims no key', reviewUrlKey('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/start'), null);
is('write-form rejection names the mistake',
   classifyReviewUrl('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/start').reason.includes('form for writing a review'),
   true);

console.log('\nReal permalinks still pass, including query strings and trailing slashes');
is('trailing slash ok', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-10432117/'), 'auto_approve');
is('query string ok', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-10432117?utm_source=x'), 'auto_approve');
is('fragment ok', v('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-10432117#top'), 'auto_approve');
is('key is stable across those',
   reviewUrlKey('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-10432117?utm_source=x'),
   'g2:linkfinder-ai-review-10432117');


// ---------------------------------------------------------------------------
// Live page verification. The property that matters is that it fails SAFE:
// every failure mode must leave the review unconfirmed, never confirmed.
// ---------------------------------------------------------------------------
console.log('\nLive G2 verification fails safe');

const realFetch = globalThis.fetch;
async function withFetch(impl, fn) {
    globalThis.fetch = impl;
    try { return await fn(); } finally { globalThis.fetch = realFetch; }
}
// Response.url is read-only, so stub the shape fetchVerifyReview reads.
const resp = (body, url, status = 200) => async () => ({
    ok: status >= 200 && status < 300, status, url,
    text: async () => body,
});

const KEY = 'g2:linkfinder-ai-review-10432117';
const URL_OK = 'https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-10432117';
const check = (impl) => withFetch(impl, () => fetchVerifyReview({}, 'g2_review', URL_OK, KEY));

is('a page naming product and review id confirms',
   (await check(resp('<html>LinkFinder AI review 10432117 great tool</html>', URL_OK))).confirmed, true);
is('403 from bot protection does not confirm',
   (await check(resp('denied', URL_OK, 403))).confirmed, false);
is('404 does not confirm',
   (await check(resp('not found', URL_OK, 404))).confirmed, false);
is('network error does not confirm',
   (await check(async () => { throw new Error('blocked'); })).confirmed, false);
is('redirect to the product page does not confirm',
   (await check(resp('<html>LinkFinder AI</html>', 'https://www.g2.com/products/linkfinder-ai/reviews'))).confirmed, false);
is('page without the review id does not confirm',
   (await check(resp('<html>LinkFinder AI, great tool</html>', URL_OK))).confirmed, false);
is('page about another product does not confirm',
   (await check(resp('<html>Apollo review 10432117</html>', URL_OK))).confirmed, false);
is('G2_FETCH_VERIFY=false disables it',
   (await withFetch(resp('<html>LinkFinder 10432117</html>', URL_OK),
      () => fetchVerifyReview({ G2_FETCH_VERIFY: 'false' }, 'g2_review', URL_OK, KEY))).confirmed, false);
is('trustpilot is not fetch-verified',
   (await withFetch(resp('<html>whatever</html>', URL_OK),
      () => fetchVerifyReview({}, 'trustpilot_review', URL_OK, 'tp:abc'))).confirmed, false);
is('a key with no numeric id does not fetch',
   (await withFetch(() => { throw new Error('should not be called'); },
      () => fetchVerifyReview({}, 'g2_review', URL_OK, 'g2:start'))).confirmed, false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
