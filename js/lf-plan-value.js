/* lf-plan-value.js — what a plan actually buys, in phone numbers, emails and
 * LinkedIn URLs, not credits.
 *
 * WHY
 * ---
 * People write in asking "how much for 100 phone numbers?". The pricing modal
 * answered "5,000 credits/mo ≈ $0.0098/credit", which is a number nobody can
 * turn into a decision without knowing that a phone costs 50 credits, an
 * email 10 and a LinkedIn URL 1. In PostHog, 293 people opened the pricing
 * modal in 60 days and 65 picked a plan (22%). The step that leaks is the
 * one where the card has to explain itself.
 *
 * This module is the single place those conversions live. It is loaded by
 * pricing.html, app.html and account.html so all three say the same thing.
 *
 *   LFPlanValue.allowance(5000)        -> { phones: 100, emails: 500, linkedin: 5000, profiles: 500 }
 *   LFPlanValue.creditsFor({phones:100}) -> 5000
 *   LFPlanValue.recommend({phones:100}) -> { kind:'plan', plan:{...}, ... }
 *   LFPlanValue.allowanceHTML(5000)    -> compact "what you get" list markup
 *   LFPlanValue.mountCalculator(el, {onPlan, onPack, onEnterprise, source})
 *
 * The credit costs mirror `creditCosts` in app.html. If one changes there it
 * must change here, or the promise on the card stops matching the meter.
 */
(function (global) {
  'use strict';

  // Credits per lookup, as charged by the app (app.html `creditCosts`).
  var COSTS = {
    phone: 50,      // linkedin_profile_to_phone
    email: 10,      // linkedin_profile_to_email
    profile: 10,    // linkedin_profile_to_linkedin_info
    linkedin: 1     // lead_full_name_to_linkedin_url
  };

  // Self-serve subscriptions. Keys match app.html `plans[]` / checkout worker.
  var PLANS = [
    { key: 'starter',    name: 'Starter',      monthlyPrice: 49,  annualMonthly: 29, creditsPerMonth: 5000  },
    { key: 'pro',        name: 'Professional', monthlyPrice: 89,  annualMonthly: 53, creditsPerMonth: 20000 },
    { key: 'enterprise', name: 'Scale',        monthlyPrice: 149, annualMonthly: 89, creditsPerMonth: 50000 }
  ];

  // One-time packs. Index order matches proceedToPaygCheckout(index) in the app.
  var PACKS = [
    { key: 'payg_small',  name: 'Small',  price: 25,  credits: 1000  },
    { key: 'payg_medium', name: 'Medium', price: 75,  credits: 3500  },
    { key: 'payg_large',  name: 'Large',  price: 200, credits: 10000 }
  ];

  var ENTERPRISE_CREDITS_FROM = 250000;
  var SALES_URL = 'https://linkfinderai.com/talk-to-sales';

  function fmt(n) { return Math.floor(n).toLocaleString('en-US'); }

  function allowance(credits) {
    return {
      phones:   Math.floor(credits / COSTS.phone),
      emails:   Math.floor(credits / COSTS.email),
      profiles: Math.floor(credits / COSTS.profile),
      linkedin: Math.floor(credits / COSTS.linkedin)
    };
  }

  function creditsFor(need) {
    need = need || {};
    return (need.phones || 0) * COSTS.phone
         + (need.emails || 0) * COSTS.email
         + (need.profiles || 0) * COSTS.profile
         + (need.linkedin || 0) * COSTS.linkedin;
  }

  // Smallest thing that covers the need. Subscriptions are per month; a pack
  // is offered alongside when the need is small enough that a one-off makes
  // sense (it always covers at least one month).
  function recommend(need) {
    var credits = creditsFor(need);
    var out = { credits: credits, plan: null, pack: null, kind: 'none' };
    if (credits <= 0) return out;
    for (var i = 0; i < PLANS.length; i++) {
      if (PLANS[i].creditsPerMonth >= credits) { out.plan = PLANS[i]; out.planIndex = i; break; }
    }
    for (var j = 0; j < PACKS.length; j++) {
      if (PACKS[j].credits >= credits) { out.pack = PACKS[j]; out.packIndex = j; break; }
    }
    out.kind = out.plan ? 'plan' : 'enterprise';
    return out;
  }

  // Per-unit price on a plan, for the "that's $0.49 a phone number" line.
  function unitPrice(plan, unit, annual) {
    var price = annual ? plan.annualMonthly : plan.monthlyPrice;
    var count = Math.floor(plan.creditsPerMonth / COSTS[unit]);
    return count ? price / count : 0;
  }

  function money(n) {
    if (n >= 1) return '$' + n.toFixed(2);
    return (n * 100).toFixed(n * 100 < 10 ? 1 : 0) + '¢';
  }

  /* "What you get" block. `credits` is the allowance for the period shown.
   * opts.period: 'mo' | 'yr' | '' (packs have no period)
   * opts.compact: single line instead of a list
   */
  function allowanceHTML(credits, opts) {
    opts = opts || {};
    var a = allowance(credits);
    var per = opts.period ? ' <span class="lfpv-per">/ ' + opts.period + '</span>' : '';
    if (opts.compact) {
      return '<span class="lfpv-inline">'
        + '<b>' + fmt(a.phones) + '</b> phone numbers <i>or</i> '
        + '<b>' + fmt(a.emails) + '</b> emails <i>or</i> '
        + '<b>' + fmt(a.linkedin) + '</b> LinkedIn URLs' + (opts.period ? ' / ' + opts.period : '')
        + '</span>';
    }
    return '<div class="lfpv-block">'
      + '<div class="lfpv-title">' + (opts.title || 'Enough for, each ' + (opts.period === 'yr' ? 'year' : 'month')) + '</div>'
      + '<div class="lfpv-row"><span class="lfpv-ico">📞</span><b>' + fmt(a.phones) + '</b> phone numbers' + per + '</div>'
      + '<div class="lfpv-or">or</div>'
      + '<div class="lfpv-row"><span class="lfpv-ico">✉️</span><b>' + fmt(a.emails) + '</b> verified emails' + per + '</div>'
      + '<div class="lfpv-or">or</div>'
      + '<div class="lfpv-row"><span class="lfpv-ico">🔗</span><b>' + fmt(a.linkedin) + '</b> LinkedIn URLs' + per + '</div>'
      + '<div class="lfpv-note">' + (opts.note || 'Any mix. ' + fmt(credits) + ' credits' + (opts.period ? '/' + opts.period : '') + ' · phone 50 · email 10 · LinkedIn URL 1') + '</div>'
      + '</div>';
  }

  /* The calculator: three inputs, one answer.
   * opts.onPlan(planIndex, plan)  — called when the recommended plan CTA is clicked
   * opts.onPack(packIndex, pack)  — one-time pack CTA
   * opts.onEnterprise()           — "talk to sales" CTA
   * opts.source                   — analytics label ('pricing_page' | 'app_modal' | 'account_modal')
   * opts.annual                   — show annual price on the answer (default true); may be a function read at render time
   * opts.defaults                 — {phones, emails, linkedin}
   */
  function mountCalculator(container, opts) {
    if (!container) return;
    opts = opts || {};
    var d = opts.defaults || { phones: 100, emails: 0, linkedin: 0 };
    var annualNow = function () { return typeof opts.annual === 'function' ? opts.annual() !== false : opts.annual !== false; };
    var id = 'lfpv' + Math.random().toString(36).slice(2, 8);

    container.innerHTML = ''
      + '<div class="lfpv-calc">'
      + '  <div class="lfpv-calc-head">'
      + '    <div class="lfpv-calc-title">How many do you need each month?</div>'
      + '    <div class="lfpv-calc-sub">Type it in, we\'ll tell you the plan and the price. Most people ask "how much for 100 phone numbers?" — that\'s the first box.</div>'
      + '  </div>'
      + '  <div class="lfpv-calc-grid">'
      + '    <label class="lfpv-field"><span>📞 Phone numbers</span><input type="number" min="0" step="10" inputmode="numeric" id="' + id + '-phones" value="' + (d.phones || 0) + '"></label>'
      + '    <label class="lfpv-field"><span>✉️ Emails</span><input type="number" min="0" step="50" inputmode="numeric" id="' + id + '-emails" value="' + (d.emails || 0) + '"></label>'
      + '    <label class="lfpv-field"><span>🔗 LinkedIn URLs</span><input type="number" min="0" step="100" inputmode="numeric" id="' + id + '-linkedin" value="' + (d.linkedin || 0) + '"></label>'
      + '  </div>'
      + '  <div class="lfpv-answer" id="' + id + '-answer"></div>'
      + '</div>';

    var inPhones = container.querySelector('#' + id + '-phones');
    var inEmails = container.querySelector('#' + id + '-emails');
    var inLinkedin = container.querySelector('#' + id + '-linkedin');
    var answer = container.querySelector('#' + id + '-answer');
    var lastTracked = '';

    function read() {
      return {
        phones: Math.max(0, parseInt(inPhones.value, 10) || 0),
        emails: Math.max(0, parseInt(inEmails.value, 10) || 0),
        linkedin: Math.max(0, parseInt(inLinkedin.value, 10) || 0)
      };
    }

    function render() {
      var need = read();
      var r = recommend(need);
      var html = '';
      if (r.credits <= 0) {
        html = '<div class="lfpv-answer-empty">Enter a number above to see which plan covers it.</div>';
      } else if (r.kind === 'enterprise') {
        html = '<div class="lfpv-answer-main">'
          + '<div class="lfpv-answer-label">That\'s ' + fmt(r.credits) + ' credits a month — above Scale (50,000).</div>'
          + '<div class="lfpv-answer-plan">Enterprise, volume pricing</div>'
          + '<div class="lfpv-answer-sub">Contracted allocation, invoicing, SLA. Quoted on a 15-minute call.</div>'
          + '</div>'
          + '<div class="lfpv-answer-ctas"><button type="button" class="lfpv-btn lfpv-btn-dark" data-act="enterprise">Talk to sales →</button></div>';
      } else {
        var p = r.plan;
        var annual = annualNow();
        var price = annual ? p.annualMonthly : p.monthlyPrice;
        var unit = need.phones > 0 ? 'phone' : (need.emails > 0 ? 'email' : 'linkedin');
        var unitLabel = unit === 'phone' ? 'phone number' : (unit === 'email' ? 'email' : 'LinkedIn URL');
        var headroom = p.creditsPerMonth - r.credits;
        var a = allowance(headroom);
        html = '<div class="lfpv-answer-main">'
          + '<div class="lfpv-answer-label">That\'s ' + fmt(r.credits) + ' credits a month. The plan that covers it:</div>'
          + '<div class="lfpv-answer-plan">' + p.name + ' — $' + price + '/mo' + (annual ? ' <span class="lfpv-muted">billed annually · $' + p.monthlyPrice + ' monthly</span>' : '') + '</div>'
          + '<div class="lfpv-answer-sub">About ' + money(unitPrice(p, unit, annual)) + ' per ' + unitLabel
          + (headroom > 0 ? ' · room left for ' + fmt(a.phones) + ' more phone numbers or ' + fmt(a.emails) + ' more emails' : '')
          + '</div>'
          + '</div>'
          + '<div class="lfpv-answer-ctas">'
          + '<button type="button" class="lfpv-btn lfpv-btn-primary" data-act="plan">Get ' + p.name + ' →</button>'
          + (r.pack ? '<button type="button" class="lfpv-btn lfpv-btn-ghost" data-act="pack">One-off instead: $' + r.pack.price + ' pack (' + fmt(r.pack.credits) + ' credits, never expires)</button>' : '')
          + '<button type="button" class="lfpv-btn lfpv-btn-link" data-act="enterprise">Prefer to talk it through? Talk to sales</button>'
          + '</div>';
      }
      answer.innerHTML = html;
      answer.__lfpvRec = r;
      answer.__lfpvNeed = need;

      var key = need.phones + '/' + need.emails + '/' + need.linkedin;
      if (key !== lastTracked && r.credits > 0) {
        lastTracked = key;
        track('pricing_calculator_used', {
          source: opts.source || 'unknown',
          phones: need.phones, emails: need.emails, linkedin: need.linkedin,
          credits: r.credits,
          recommended: r.plan ? r.plan.key : 'enterprise'
        });
      }
    }

    [inPhones, inEmails, inLinkedin].forEach(function (el) {
      el.addEventListener('input', render);
      el.addEventListener('focus', function () { try { el.select(); } catch (e) {} });
    });

    answer.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) return;
      var r = answer.__lfpvRec || {};
      var act = btn.getAttribute('data-act');
      track('pricing_calculator_cta_clicked', { source: opts.source || 'unknown', action: act, recommended: r.plan ? r.plan.key : 'enterprise', credits: r.credits || 0 });
      if (act === 'plan' && r.plan) {
        if (opts.onPlan) opts.onPlan(r.planIndex, r.plan); else location.href = 'https://linkfinderai.com/sign-up?plan=' + (r.plan.key === 'enterprise' ? 'scale' : r.plan.key === 'pro' ? 'professional' : r.plan.key);
      } else if (act === 'pack' && r.pack) {
        if (opts.onPack) opts.onPack(r.packIndex, r.pack); else location.href = 'https://linkfinderai.com/sign-up?payg=' + r.pack.name.toLowerCase();
      } else if (act === 'enterprise') {
        if (opts.onEnterprise) opts.onEnterprise(); else window.open(SALES_URL + '?src=' + encodeURIComponent('calc_' + (opts.source || 'unknown')), '_blank', 'noopener');
      }
    });

    render();
    return { render: render, read: read };
  }

  function track(name, props) {
    try { if (global.posthog && typeof global.posthog.capture === 'function') global.posthog.capture(name, props || {}); } catch (e) {}
  }

  // Shared styles, injected once. Uses the site's CSS variables (--primary,
  // --gray-*) which all three host pages define.
  function injectStyles() {
    if (document.getElementById('lfpv-styles')) return;
    var css = ''
      + '.lfpv-block{margin-top:.6rem;padding:.6rem .55rem;border-radius:8px;background:#f8fafc;border:1px solid var(--gray-200,#e5e7eb);text-align:left;font-size:.74rem;color:var(--gray-700,#374151);line-height:1.45}'
      + '.lfpv-title{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500,#6b7280);margin-bottom:.35rem}'
      + '.lfpv-row{display:flex;align-items:center;gap:.4rem;white-space:nowrap}'
      + '.lfpv-row b{color:var(--gray-900,#111827);font-size:.86rem}'
      + '.lfpv-ico{width:1.1rem;text-align:center;flex-shrink:0}'
      + '.lfpv-per{color:var(--gray-400,#9ca3af);font-size:.66rem}'
      + '.lfpv-or{font-size:.6rem;color:var(--gray-400,#9ca3af);text-transform:uppercase;letter-spacing:.08em;padding-left:1.5rem;line-height:1.1}'
      + '.lfpv-note{margin-top:.4rem;padding-top:.35rem;border-top:1px dashed var(--gray-200,#e5e7eb);font-size:.62rem;color:var(--gray-400,#9ca3af);white-space:normal}'
      + '.lfpv-inline b{color:var(--gray-900,#111827)}.lfpv-inline i{color:var(--gray-400,#9ca3af);font-style:normal;margin:0 .15rem}'
      + '.lfpv-calc{background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:1rem 1.1rem;margin:0 0 1rem;text-align:left}'
      + '.lfpv-calc-title{font-size:.95rem;font-weight:700;color:var(--gray-900,#111827)}'
      + '.lfpv-calc-sub{font-size:.76rem;color:var(--gray-600,#4b5563);margin-top:.15rem;line-height:1.45}'
      + '.lfpv-calc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem;margin-top:.8rem}'
      + '.lfpv-field{display:flex;flex-direction:column;gap:.25rem;font-size:.72rem;font-weight:600;color:var(--gray-700,#374151)}'
      + '.lfpv-field input{width:100%;box-sizing:border-box;font:inherit;font-size:1rem;font-weight:600;padding:.5rem .6rem;border:1.5px solid var(--gray-300,#d1d5db);border-radius:8px;background:#fff;color:var(--gray-900,#111827)}'
      + '.lfpv-field input:focus{outline:none;border-color:var(--primary,#2563eb);box-shadow:0 0 0 3px rgba(37,99,235,.15)}'
      + '.lfpv-answer{margin-top:.8rem;background:#fff;border:1px solid #bfdbfe;border-radius:10px;padding:.8rem .9rem;display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between}'
      + '.lfpv-answer-empty{font-size:.8rem;color:var(--gray-500,#6b7280)}'
      + '.lfpv-answer-main{flex:1 1 260px;min-width:0}'
      + '.lfpv-answer-label{font-size:.74rem;color:var(--gray-500,#6b7280)}'
      + '.lfpv-answer-plan{font-size:1.05rem;font-weight:700;color:var(--gray-900,#111827);margin-top:.1rem}'
      + '.lfpv-muted{font-size:.72rem;font-weight:500;color:var(--gray-400,#9ca3af)}'
      + '.lfpv-answer-sub{font-size:.76rem;color:var(--gray-600,#4b5563);margin-top:.15rem;line-height:1.45}'
      + '.lfpv-answer-ctas{display:flex;flex-direction:column;gap:.35rem;align-items:stretch;flex:0 1 auto;min-width:200px}'
      + '.lfpv-btn{font:inherit;font-size:.8rem;font-weight:600;padding:.6rem .9rem;border-radius:8px;border:1.5px solid transparent;cursor:pointer;text-align:center;line-height:1.3}'
      + '.lfpv-btn-primary{background:var(--primary,#2563eb);color:#fff;border-color:var(--primary,#2563eb)}'
      + '.lfpv-btn-primary:hover{background:var(--primary-hover,#1d4ed8)}'
      + '.lfpv-btn-dark{background:var(--gray-900,#111827);color:#fff;border-color:var(--gray-900,#111827)}'
      + '.lfpv-btn-ghost{background:#fff;color:var(--gray-700,#374151);border-color:var(--gray-300,#d1d5db);font-weight:500;font-size:.72rem}'
      + '.lfpv-btn-ghost:hover{border-color:var(--primary,#2563eb);color:var(--primary,#2563eb)}'
      + '.lfpv-btn-link{background:transparent;color:var(--gray-500,#6b7280);font-weight:500;font-size:.7rem;padding:.2rem;text-decoration:underline}'
      + '.lf-modal-actions{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin-top:.7rem}'
      + '.lf-modal-calc-toggle,.lf-modal-sales{font:inherit;font-size:.78rem;font-weight:600;padding:.45rem .85rem;border-radius:999px;cursor:pointer;border:1.5px solid var(--gray-300,#d1d5db);background:#fff;color:var(--gray-700,#374151)}'
      + '.lf-modal-calc-toggle:hover{border-color:var(--primary,#2563eb);color:var(--primary,#2563eb)}'
      + '.lf-modal-sales{background:var(--gray-900,#111827);border-color:var(--gray-900,#111827);color:#fff}'
      + '.lf-modal-sales:hover{background:#000}'
      + '@media(max-width:600px){.lfpv-calc-grid{grid-template-columns:1fr}.lfpv-answer-ctas{width:100%}}';
    var s = document.createElement('style');
    s.id = 'lfpv-styles';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectStyles);
  else injectStyles();

  global.LFPlanValue = {
    COSTS: COSTS, PLANS: PLANS, PACKS: PACKS,
    ENTERPRISE_CREDITS_FROM: ENTERPRISE_CREDITS_FROM, SALES_URL: SALES_URL,
    allowance: allowance, creditsFor: creditsFor, recommend: recommend,
    unitPrice: unitPrice, money: money, fmt: fmt,
    allowanceHTML: allowanceHTML, mountCalculator: mountCalculator,
    injectStyles: injectStyles
  };
})(window);
