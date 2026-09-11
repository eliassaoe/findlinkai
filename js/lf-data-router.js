/* lf-data-router.js — "where does your data live?" for the marketing pages.
 *
 * The app already asks this (ROUTE_INTENTS = csv | sheets | api | crm) and
 * routes accordingly. Asking the same question on the tool and landing pages
 * does two things:
 *
 *   1. Anyone who answers "a list" gets the bulk uploader opened right there,
 *      instead of having to discover it later. Someone holding a list is the
 *      customer; the whole point is to catch them at the moment they say so.
 *   2. The answer is written to the same localStorage key the app reads
 *      (lf_route_picked), so the app does not ask a second time.
 *
 * The single-lookup tool above this stays untouched. These pages only rank
 * because they answer the query instantly, so the list path is offered
 * alongside rather than placed in front.
 *
 * Usage:
 *   <div id="lfRouter"></div>
 *   <script src="/js/lf-csv.js"></script>
 *   <script src="/js/lf-tools-key.js"></script>
 *   <script src="/js/lf-upload-preview.js"></script>
 *   <script src="/js/lf-data-router.js"></script>
 *   <script>lfDataRouter.mount({ container: '#lfRouter', tool: 'email_permutator' });</script>
 */
(function (w, d) {
  var ROUTE_KEY = 'lf_route_picked';
  var SITE = 'https://linkfinderai.com';

  var ROUTES = [
    {
      id: 'csv',
      icon: 'fa-file-csv',
      label: 'A list or CSV',
      hint: 'Sales Navigator, an ATS export, a spreadsheet'
    },
    {
      id: 'crm',
      icon: 'fa-database',
      label: 'In my CRM',
      hint: 'HubSpot or Salesforce',
      href: SITE + '/enrich-crm-contact-list'
    },
    {
      id: 'sheets',
      icon: 'fa-table',
      label: 'A Google Sheet',
      hint: 'Enrich in place, column by column',
      href: SITE + '/linkedIn-enrichment-google-sheets'
    },
    {
      id: 'api',
      icon: 'fa-code',
      label: 'In my own system',
      hint: 'One endpoint, documented',
      href: SITE + '/api-access'
    }
  ];

  function capture(name, props) {
    try { if (w.posthog) w.posthog.capture(name, props || {}); } catch (e) {}
  }

  function injectStyle() {
    if (d.getElementById('lf-data-router-style')) return;
    var st = d.createElement('style');
    st.id = 'lf-data-router-style';
    st.textContent = [
      '.lfdr{--lfdr-p:#2563eb;--lfdr-bd:#e5e7eb;--lfdr-mut:#6b7280;',
      'font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827;}',
      '.lfdr-q{font-weight:600;font-size:1rem;margin:0 0 .2rem;}',
      '.lfdr-sub{font-size:.855rem;color:var(--lfdr-mut);margin:0 0 .9rem;line-height:1.55;}',
      '.lfdr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:.6rem;}',
      '.lfdr-card{display:block;text-align:left;background:#fff;border:1px solid var(--lfdr-bd);',
      'border-radius:10px;padding:.8rem .85rem;cursor:pointer;font:inherit;color:inherit;',
      'text-decoration:none;transition:border-color .15s,box-shadow .15s;}',
      '.lfdr-card:hover{border-color:var(--lfdr-p);box-shadow:0 2px 10px rgba(37,99,235,.10);}',
      '.lfdr-card:focus-visible{outline:2px solid var(--lfdr-p);outline-offset:2px;}',
      '.lfdr-card[aria-pressed="true"]{border-color:var(--lfdr-p);background:#eff6ff;}',
      '.lfdr-i{color:var(--lfdr-p);font-size:1rem;margin-bottom:.35rem;}',
      '.lfdr-l{font-weight:600;font-size:.92rem;line-height:1.3;}',
      '.lfdr-h{font-size:.775rem;color:var(--lfdr-mut);line-height:1.4;margin-top:.15rem;}',
      '.lfdr-slot{margin-top:1rem;}',
      '.lfdr-slot:empty{display:none;}'
    ].join('');
    d.head.appendChild(st);
  }

  function mount(opts) {
    opts = opts || {};
    var host = typeof opts.container === 'string'
      ? d.querySelector(opts.container) : opts.container;
    if (!host) return;

    injectStyle();

    var tool = opts.tool || 'page';
    var question = opts.question || 'Got more than one to look up?';
    var sub = opts.sub || 'Tell us where your data lives and we will take it from there.';
    var enrichType = opts.enrichType || 'business_email_finder';

    host.classList.add('lfdr');

    var cards = ROUTES.map(function (r) {
      var inner = '<div class="lfdr-i"><i class="fas ' + r.icon + '"></i></div>'
                + '<div class="lfdr-l">' + r.label + '</div>'
                + '<div class="lfdr-h">' + r.hint + '</div>';
      return r.href
        ? '<a class="lfdr-card" data-route="' + r.id + '" href="' + r.href + '">' + inner + '</a>'
        : '<button type="button" class="lfdr-card" data-route="' + r.id
            + '" aria-pressed="false">' + inner + '</button>';
    }).join('');

    host.innerHTML = '<p class="lfdr-q">' + question + '</p>'
      + '<p class="lfdr-sub">' + sub + '</p>'
      + '<div class="lfdr-grid">' + cards + '</div>'
      + '<div class="lfdr-slot" id="lfdrSlot"></div>';

    var slot = host.querySelector('#lfdrSlot');

    host.querySelectorAll('.lfdr-card').forEach(function (el) {
      el.addEventListener('click', function () {
        var route = el.getAttribute('data-route');
        // Same key the app reads, so it does not ask this again after signup.
        try { localStorage.setItem(ROUTE_KEY, route); } catch (e) {}
        capture('onboarding_route_picked', { route: route, source: 'tool_page:' + tool });

        if (route !== 'csv') return; // the anchors navigate on their own

        host.querySelectorAll('.lfdr-card[aria-pressed]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === el));
        });

        if (slot.getAttribute('data-mounted') === '1') return;
        if (!w.lfUploadPreview) {
          slot.innerHTML = '<p class="lfdr-sub" style="margin:0;">'
            + 'Bulk enrichment lives on the '
            + '<a href="' + SITE + '/csv-email-finder">CSV email finder</a>.</p>';
          return;
        }
        slot.setAttribute('data-mounted', '1');
        w.lfUploadPreview.mount({
          container: slot,
          tool: tool + '_router',
          enrichType: enrichType
        });
        if (slot.scrollIntoView) slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  w.lfDataRouter = { mount: mount };
})(window, document);
