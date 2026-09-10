// The sales-led motion: a quoted Enterprise tier that books a call instead of
// taking a card, one page both offers land on, and a page CTA routed by intent
// rather than sprayed. These tests pin the parts that are easy to break by
// accident -- above all that the DISPLAY rename to "Scale" never reaches the
// plan KEY, which is the database plan_number, the Dodo product and every
// ?plan=enterprise link already sitting in an inbox.
//
// Background, numbers and the audience caveat: docs/sales-led-motion.md.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('app.html');
const pricing = read('pricing.html');
const cta = read('js/lf-highticket-cta.js');
const sales = read('talk-to-sales.html');
const dfy = read('done-for-you-outbound.html');
const migration = read('supabase/migrations/20260910120000_sales_leads.sql');
const library = JSON.parse(read('workers/lifecycle-email/variants.json'));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('sales-led motion');

// ------------------------------------------------------- the rename is display-only
test('the top self-serve plan is displayed as Scale but keyed enterprise', () => {
  const plans = app.match(/const plans = \[[\s\S]*?\];/);
  assert.ok(plans, 'plans[] not found in app.html');
  assert.match(plans[0], /name:'Scale',\s*key:'enterprise'/, 'Scale must keep key enterprise');
  assert.equal(/name:'Enterprise'/.test(plans[0]), false,
    'Enterprise must NOT be a checkout plan — it is quoted on a call');
});

test('both ?plan=enterprise and ?plan=scale still resolve', () => {
  const aliases = app.match(/const PLAN_PARAM_ALIASES = \{[\s\S]*?\};/)[0];
  assert.match(aliases, /enterprise:\s*'enterprise'/, 'old links must keep working');
  assert.match(aliases, /scale:\s*'enterprise'/, 'the new name must resolve to the same plan');
});

test('the $149 plan price and credit figures are untouched', () => {
  assert.match(app, /monthlyPrice:149,\s*credits:600000/);
  assert.match(pricing, /data-monthly="149" data-annual="89"/);
});

// -------------------------------------------------------------- the fourth card
test('app pricing modal renders a fourth, quoted Enterprise card', () => {
  assert.match(app, /\}\)\.join\(''\) \+ renderEnterpriseCard\(\);/);
  assert.match(app, /function renderEnterpriseCard\(\)/);
  assert.match(app, /function openEnterpriseCall\(source\)/);
  // The card is built inside a JS string, so the quotes are backslash-escaped
  // in the file. assert.ok rather than assert.match: a failed match on a
  // 470KB haystack prints the whole file.
  assert.ok(app.includes("openEnterpriseCall(\\'pricing_modal\\')"),
    'the card button must call openEnterpriseCall');
  // No price, no checkout call on this card.
  const card = app.match(/function renderEnterpriseCard\(\)[\s\S]*?\n\}/)[0];
  assert.equal(/proceedToCheckoutDirect/.test(card), false,
    'the Enterprise card must never open a checkout');
  assert.match(card, /Custom/);
});

test('the modal grid can hold four cards and three packs', () => {
  assert.match(app, /\.plans-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(/);
  assert.equal(/\.plans-grid\{display:grid;grid-template-columns:repeat\(3,1fr\)/.test(app), false);
});

test('the modal footer offers the call, not a mailto', () => {
  assert.match(app, /openEnterpriseCall\('pricing_modal_footer'\)/);
  assert.equal(/Need more credits\?.*mailto:support@linkfinderai\.com/s.test(app), false,
    'the custom-plan mailto should be the Enterprise call now');
});

test('pricing.html carries the sales-led card and no stale Enterprise price claim', () => {
  assert.match(pricing, /<div class="plan-name">Scale<\/div>/);
  assert.match(pricing, /class="pricing-card sales-led"/);
  assert.match(pricing, /talk-to-sales\?src=pricing_enterprise/);
  assert.equal(/Enterprise:\s*\$89\/mo vs \$149\/mo/.test(pricing), false,
    'the annual-saving FAQ must say Scale, not Enterprise');
  assert.equal(/<strong>Enterprise:<\/strong> 50,000 credits/.test(pricing), false,
    '50,000 credits is Scale now');
});

test('the billing toggle cannot blank a quoted card', () => {
  // The Enterprise card has no data-monthly/data-annual. Without the guard,
  // getAttribute returns null and the toggle wipes "250,000+" on first paint.
  assert.match(pricing, /if \(monthly === null \|\| annual === null\) return;/);
});

// ---------------------------------------------------------------- the destination
test('talk-to-sales stores the lead BEFORE going to the calendar', () => {
  const rpcAt = sales.indexOf('rpc/sales_lead_request');
  const redirectAt = sales.indexOf('location.href = url.toString()');
  assert.ok(rpcAt > 0 && redirectAt > 0, 'both the write and the redirect must exist');
  assert.ok(rpcAt < redirectAt, 'the write has to come first — see docs/ai-sdr-offer.md');
});

test('a failed write never blocks the booking', () => {
  // The booking is worth more than the row: the fetch is wrapped and the
  // redirect happens either way.
  assert.match(sales, /catch \(e\) \{ \/\* falls through to the redirect on purpose \*\/ \}/);
});

test('talk-to-sales serves both offers and fires the conversion event', () => {
  assert.match(sales, /const OFFERS = \{/);
  assert.match(sales, /calendly\.com\/hamoureliasse\/linkfinder-ai/);
  assert.match(sales, /calendly\.com\/hamoureliasse\/offre-linkfinder-ai-clone/);
  assert.match(sales, /posthog\.capture\('sales_lead_submitted'/);
});

test('the done-for-you page can book a call and no longer leaks its form', () => {
  assert.match(dfy, /talk-to-sales\?offer=dfy&amp;src=dfy_page_nav/);
  assert.match(dfy, /talk-to-sales\?offer=dfy&amp;src=dfy_page_form/);
  assert.match(dfy, /async function storeDfyLead\(data\)/);
  const storeAt = dfy.indexOf('if (await storeDfyLead(data))');
  const mailtoAt = dfy.indexOf('"mailto:" + FALLBACK_INBOX');
  assert.ok(storeAt > 0 && storeAt < mailtoAt, 'store the lead before falling back to mailto');
});

// ------------------------------------------------------------------- the migration
test('sales_leads is locked down and callable by the public pages', () => {
  assert.match(migration, /alter table public\.sales_leads enable row level security/);
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute on function public\.sales_lead_request\([^)]*\) to anon, authenticated/);
  assert.match(migration, /if v_recent >= 5 then/, 'an anon-callable insert needs a rate limit');
  assert.match(migration, /left\(btrim\(p_target\), 2000\)/, 'inputs must be length-capped');
});

// ------------------------------------------------------------------ the page CTA
function tierFor(slug) {
  // The module is an IIFE that touches document/location on load, so give it
  // just enough of a DOM to evaluate, then use the routing it exposes.
  const sandbox = { window: {}, location: { pathname: '/' }, document: {
    body: { getAttribute: () => null }, head: { appendChild() {} },
    getElementById: () => null, querySelector: () => null,
    createElement: () => ({}), addEventListener() {}, readyState: 'loading',
  } };
  const fn = new Function('window', 'document', 'location', cta + '\nreturn window.__lfHighTicketCta;');
  return fn(sandbox.window, sandbox.document, sandbox.location).tierFor(slug);
}

test('single-lookup tool pages never get the high-ticket band', () => {
  // The measured top pages: 7,922 visitors a month who came to do it
  // themselves. docs/traffic-capture-verdict.md.
  for (const page of [
    'linkedin-email-finder', 'linkedin-phone-number-finder',
    'linkedin-search-by-email', 'instagram-profile-url-finder',
    'linkedin-url-finder', 'company-employee-finder',
  ]) {
    assert.equal(tierFor(page), 'self', page + ' must stay on the self-serve CTA');
  }
});

test('vendor-choice and integration pages do get it', () => {
  for (const page of [
    'best-b2b-data-api', 'lead-generation-api', 'zoominfo-alternative',
    'clay-alternative', 'hubspot-crm-enrichment', 'bulk-linkedin-enrichment',
    'data-enrichment-api', 'best-b2b-lead-generation-agencies',
  ]) {
    assert.equal(tierFor(page), 'sales', page + ' should show the book-a-call band');
  }
});

test('pages with their own CTA are left alone', () => {
  for (const page of ['', 'index', 'pricing', 'talk-to-sales', 'app', 'crm-audit',
                      'done-for-you-outbound', 'sign-up', 'log-in', 'privacy-policy']) {
    assert.equal(tierFor(page), 'off', (page || '(homepage)') + ' must not get an injected band');
  }
});

test('a page can be flipped from its own body tag', () => {
  assert.match(cta, /data-lf-cta/);
  assert.match(cta, /if \(forced === 'off' \|\| forced === 'sales' \|\| forced === 'self'\) return forced;/);
});

test('the band is inline and never an interrupt', () => {
  // Every interrupt on this site converted at ~1%; every surface after an
  // earned result at 18-34%. docs/next-step-routing.md.
  assert.equal(/position:fixed/.test(cta), false, 'no fixed positioning');
  assert.equal(/position:sticky/.test(cta), false, 'no sticky positioning');
  assert.equal(/setTimeout/.test(cta), false, 'no timed popup');
  assert.match(cta, /footer\.parentNode\.insertBefore\(band, footer\)/);
  assert.match(cta, /if \(document\.getElementById\('lf-htc'\)\) return;/, 'never inject twice');
});

test('the injected tag is on the marketing pages and off the app', () => {
  const TAG = 'lf-highticket-cta.js';
  for (const page of ['best-b2b-data-api.html', 'linkedin-email-finder.html',
                      'zoominfo-alternative.html', 'pricing.html']) {
    assert.ok(read(page).includes(TAG), page + ' should load the CTA script');
  }
  for (const page of ['app.html', 'sign-up.html', 'log-in.html', 'account.html',
                      'talk-to-sales.html', 'done-for-you-outbound.html']) {
    assert.equal(read(page).includes(TAG), false, page + ' must NOT load it');
  }
});

// --------------------------------------------------------------------- the emails
test('the three high-ticket steps exist, are wired to a workflow, and point at the form', () => {
  for (const key of ['enterprise_volume', 'enterprise_api', 'dfy_idle_pack']) {
    const step = library.steps[key];
    assert.ok(step, key + ' missing from variants.json');
    assert.match(String(step.workflow_id), /^[0-9a-f-]{36}$/, key + ' has no PostHog workflow id');
    assert.equal(step.goal_event, 'sales_lead_submitted',
      key + ' must exit on a booked/submitted lead');
    const champions = step.variants.filter(v => v.status === 'champion');
    assert.equal(champions.length, 1, key + ' needs exactly one champion');
    for (const v of step.variants) {
      assert.match(v.url, /linkfinderai\.com\/talk-to-sales/, key + '/' + v.id + ' must link the form');
      assert.match(v.url, /src=email_/, key + '/' + v.id + ' must carry an src for attribution');
      for (const field of ['subject', 'preheader', 'body', 'cta', 'after', 'reason', 'angle', 'hypothesis']) {
        assert.ok(v[field], key + '/' + v.id + ' is missing ' + field);
      }
    }
  }
});

test('the done-for-you email is aimed at pack buyers, not at subscribers', () => {
  // Selling a service to an active subscriber trades a subscription for a
  // one-off conversation. docs/ai-sdr-offer.md / docs/dfy-activation-campaign.md.
  assert.match(library.steps.dfy_idle_pack.audience, /pack buyers/i);
  assert.match(library.steps.dfy_idle_pack.variants[0].url, /offer=dfy/);
});

console.log('\n' + passed + ' passed');
