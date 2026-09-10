/* lf-highticket-cta.js — the high-ticket CTA, routed by what the page is for.
 *
 * WHY THIS IS NOT THE SAME CTA EVERYWHERE
 * ---------------------------------------
 * docs/traffic-capture-verdict.md measured who this site's search traffic
 * actually is. The top pages are `/linkedin-email-finder`,
 * `/linkedin-phone-number-finder`, `/linkedin-search-by-email` and even
 * `/instagram-profile-url-finder`. That visitor wants one phone number, now,
 * free. You cannot sell "don't do it yourself" to an audience defined by
 * wanting to do it themselves — and the verdict names the pricing modal
 * specifically as where that mistake was already made once.
 *
 * The traffic is still worth monetising; it just splits in two:
 *
 *   SALES tier   — pages read by someone choosing a vendor or wiring this into
 *                  a system: API pages, enrichment pages, competitor
 *                  comparisons, CRM pages, agency and bulk pages. Budget, a
 *                  team, and a decision to make. These get the book-a-call band.
 *
 *   SELF tier    — single-lookup tool pages. These get a quiet line pointing at
 *                  the free trial, and never a call CTA. The high-ticket band on
 *                  these pages would be noise measured in bounce.
 *
 * PLACEMENT rule, from docs/next-step-routing.md: earn, then show. Every
 * interrupt-style prompt on this site converted at ~1%; every surface rendered
 * after a result the person earned converted at 18-34%. So this is an inline
 * band at the end of the document flow. It is never a popup, never a modal,
 * never sticky, and it never covers anything.
 *
 * TO MOVE A PAGE BETWEEN TIERS
 * ----------------------------
 *   1. add a pattern to SALES_PAGES or SELF_SERVE_PAGES below, or
 *   2. put data-lf-cta="sales" | "self" | "off" on that page's <body>.
 * The body attribute wins, so a single page can be flipped without touching
 * this file.
 */
(function () {
  'use strict';

  // -------------------------------------------------------------- the routing
  // First match wins. Anything matching neither list falls to DEFAULT_TIER.
  var SALES_PAGES = [
    /-api(-|$|\.)/,            // best-linkedin-api, lead-generation-api, ...
    /^api-/,                   // api-overview, api-documentation, api-access
    /-alternative$/,           // someone comparing vendors is someone buying
    /-competitors$/,
    /^best-b2b-/,
    /^best-.*(provider|agenc|platform|software|tool)s?$/,
    /^b2b-data-/,
    /enrichment/,              // *-enrichment, enrichment-api, bulk-*-enrichment
    /^crm-/,
    /crm/,                     // hubspot-crm-enrichment, best-software-for-crm
    /^bulk-/,
    /^prospection-b2b/,
    /^done-for-you/,
    /^integrations/,
    /^migrate-from-/,
    /^intent-data/,
    /^best-intent-/,
    /^best-lead-scoring/,
    /^real-time-lead-/,
    /^how-to-enrich-/,
    /^linkedin-job-posts-into/,
    /^enriches-crm-contacts/,
    /^best-integrated-/,
    /^best-ai-sales-/,
    /^ai-tools-for-sales-teams/,
    /^recruiting-enrichment/,
    /^n8n-/,
    /^clay-/,
    /^apify-alternative/,
  ];

  var SELF_SERVE_PAGES = [
    /finder$/,                 // linkedin-email-finder, company-phone-finder
    /^find-/,
    /^extract-/,
    /scraper$/,
    /^linkedin-(email|phone|url|search|profile)/,
    /^instagram-/,
    /^email-(extractor|lookup|to-phone)/,
    /^name-to-email/,
    /^company-(name|founded|industry|description|url|employee)/,
    /^scrape-/,
    /^export-linkedin-/,
    /^best-free-/,
    /^100free/,
    /^redeem-code/,
    /^badge/,
  ];

  // A page nobody has classified is far more likely to be one of the ~200
  // single-lookup tool pages than an enterprise page, so the quiet CTA is the
  // safe default.
  var DEFAULT_TIER = 'self';

  // Pages that already carry their own, better CTA. Adding a second one would
  // compete with a converting surface, which docs/next-step-routing.md is
  // emphatic about not doing.
  var NEVER = [
    /^$/,                      // the homepage has its own hero and pricing
    /^index/,
    /^pricing/,
    /^talk-to-sales/,
    /^app/,
    /^account/,
    /^log-in/, /^login/, /^sign-up/, /^signup/,
    /^confirmation-/, /^verify-email/, /^reset-password/, /^update-password/,
    /^upgrade-confirmation/, /^say-goodbye/, /^avant-votre-appel/,
    /^privacy/, /^terms/, /^refund-policy/, /^mention-legales/,
    /^crm-audit/,              // its own funnel, already books calls
    /^done-for-you-outbound$/, // this page IS the offer; it has its own CTA
    /^history/, /^gtm-console/, /^autogtm-report/, /^linkfinder-vip/,
    /^beta-/, /-beta$/, /-beta-2$/,
  ];

  var SALES_URL = 'https://linkfinderai.com/talk-to-sales';
  var TRIAL_URL = 'https://linkfinderai.com/sign-up';
  var PRICING_URL = 'https://linkfinderai.com/pricing';

  // ---------------------------------------------------------------- helpers
  function slug() {
    var p = (location.pathname || '/').replace(/^\/+/, '').replace(/\/+$/, '');
    return p.replace(/\.html$/, '').toLowerCase();
  }

  function matches(list, s) {
    for (var i = 0; i < list.length; i++) { if (list[i].test(s)) return true; }
    return false;
  }

  function tierFor(s) {
    var body = document.body;
    var forced = (body && body.getAttribute('data-lf-cta') || '').toLowerCase();
    if (forced === 'off' || forced === 'sales' || forced === 'self') return forced;
    if (matches(NEVER, s)) return 'off';
    if (matches(SALES_PAGES, s)) return 'sales';
    if (matches(SELF_SERVE_PAGES, s)) return 'self';
    return DEFAULT_TIER;
  }

  function track(event, props) {
    try { if (window.posthog && posthog.capture) posthog.capture(event, props); } catch (e) {}
  }

  // ------------------------------------------------------------------ styles
  function injectStyles() {
    if (document.getElementById('lf-htc-styles')) return;
    var css = [
      '.lf-htc{max-width:1080px;margin:3rem auto;padding:0 1.25rem;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box}',
      '.lf-htc *{box-sizing:border-box}',
      '.lf-htc-sales{border:2px solid #0b1220;border-radius:16px;padding:1.75rem;background:linear-gradient(180deg,#fbfbfd 0%,#fff 60%);display:grid;grid-template-columns:1.5fr auto;gap:1.75rem;align-items:center}',
      '.lf-htc-eyebrow{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin:0 0 .45rem}',
      '.lf-htc-sales h2{font-size:1.35rem;line-height:1.25;font-weight:800;letter-spacing:-.02em;color:#0b1220;margin:0 0 .5rem}',
      '.lf-htc-sales p{font-size:.9375rem;color:#4b5563;margin:0 0 .75rem;line-height:1.55}',
      '.lf-htc-meta{font-size:.8125rem;color:#6b7280;margin:0}',
      '.lf-htc-actions{display:flex;flex-direction:column;gap:.6rem;min-width:210px}',
      '.lf-htc-btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;background:#0b1220;color:#fff;text-decoration:none;font-size:.9rem;font-weight:700;padding:.8rem 1.1rem;border-radius:9px;transition:transform .15s,background .15s}',
      '.lf-htc-btn:hover{background:#000;transform:translateY(-1px);color:#fff}',
      '.lf-htc-link{font-size:.8125rem;color:#4b5563;text-decoration:none;text-align:center}',
      '.lf-htc-link:hover{color:#0b1220;text-decoration:underline}',
      '.lf-htc-self{border:1px solid #e5e7eb;border-left:3px solid #2563eb;border-radius:12px;padding:1.1rem 1.35rem;background:#f9fafb;display:flex;flex-wrap:wrap;gap:.75rem 1.25rem;align-items:center;justify-content:space-between}',
      '.lf-htc-self p{font-size:.9rem;color:#374151;margin:0;line-height:1.5}',
      '.lf-htc-self p strong{color:#111827}',
      '.lf-htc-self a.lf-htc-btn{background:#2563eb;padding:.65rem 1rem;font-size:.85rem}',
      '.lf-htc-self a.lf-htc-btn:hover{background:#1d4ed8}',
      '@media(max-width:760px){.lf-htc-sales{grid-template-columns:1fr;padding:1.4rem}.lf-htc-actions{min-width:0}.lf-htc-sales h2{font-size:1.15rem}}',
    ].join('');
    var el = document.createElement('style');
    el.id = 'lf-htc-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ------------------------------------------------------------------ markup
  function salesBand(page) {
    var q = '?src=' + encodeURIComponent('page_' + (page || 'unknown'));
    return ''
      + '<div class="lf-htc-sales">'
      +   '<div>'
      +     '<p class="lf-htc-eyebrow">At volume, this stops being a subscription</p>'
      +     '<h2>Running this across a whole database, or a whole team?</h2>'
      +     '<p>Above 50,000 credits a month we quote it instead of listing it: volume pricing, '
      +       'a contracted allocation, a 99.9% uptime SLA, dedicated rate limits, invoicing and a PO. '
      +       'Or skip the tooling entirely and we run the outbound for you, priced per meeting held.</p>'
      +     '<p class="lf-htc-meta">15 minutes with the founder. Enterprise agreements from $999/month · '
      +       'Done-for-you from $750/month.</p>'
      +   '</div>'
      +   '<div class="lf-htc-actions">'
      +     '<a class="lf-htc-btn" data-lf-htc-cta="enterprise" href="' + SALES_URL + q + '">Book a call &rarr;</a>'
      +     '<a class="lf-htc-link" data-lf-htc-cta="dfy" href="' + SALES_URL + '?offer=dfy&amp;src=' + encodeURIComponent('page_' + (page || 'unknown')) + '">Or have us run it for you &rarr;</a>'
      +     '<a class="lf-htc-link" data-lf-htc-cta="pricing" href="' + PRICING_URL + '">See self-serve plans</a>'
      +   '</div>'
      + '</div>';
  }

  function selfBand() {
    return ''
      + '<div class="lf-htc-self">'
      +   '<p><strong>Doing these one at a time?</strong> Upload a CSV and enrich the whole list at once — '
      +     'free credits on signup, no card.</p>'
      +   '<a class="lf-htc-btn" data-lf-htc-cta="trial" href="' + TRIAL_URL + '?src=tool_page_cta">Try it free &rarr;</a>'
      + '</div>';
  }

  // -------------------------------------------------------------------- mount
  function mount() {
    if (document.getElementById('lf-htc')) return;         // never twice
    var page = slug();
    var tier = tierFor(page);
    if (tier === 'off') return;

    injectStyles();
    var band = document.createElement('div');
    band.className = 'lf-htc';
    band.id = 'lf-htc';
    band.setAttribute('data-lf-htc-tier', tier);
    band.innerHTML = (tier === 'sales') ? salesBand(page) : selfBand();

    // End of the content, before the footer — part of the page, not over it.
    var footer = document.querySelector('footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(band, footer);
    else document.body.appendChild(band);

    track('highticket_cta_shown', { page: page, tier: tier });

    band.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('[data-lf-htc-cta]');
      if (!a) return;
      track('highticket_cta_clicked', {
        page: page, tier: tier, cta: a.getAttribute('data-lf-htc-cta'),
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // Exposed for the test suite and for flipping a page from the console.
  window.__lfHighTicketCta = { tierFor: tierFor, slug: slug, mount: mount,
                               SALES_PAGES: SALES_PAGES, SELF_SERVE_PAGES: SELF_SERVE_PAGES,
                               NEVER: NEVER, DEFAULT_TIER: DEFAULT_TIER };
})();
