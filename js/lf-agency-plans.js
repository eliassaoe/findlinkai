// The outbound (agency segment) plans, and nothing else.
//
// Who sees them: accounts in the agency segment (js/lf-attribution.js,
// docs/agency-pricing.md) -- people who arrived from outbound. Everyone else
// keeps the public plans. Spec and the numbers behind them:
// docs/agency-outbound-pricing.md.
//
// One price list for every surface that sells these plans:
//   app.html      -> the pricing modal
//   account.html  -> the billing modal
//   pricing.html  -> the agency view of /pricing
//   agency.html   -> the plan section of /agency
// workers/dodo-checkout/worker.js keeps its own copy of the product ids (a
// Worker cannot load this file); tests/agency-outbound-plans.test.mjs fails if
// the two disagree.
//
// SWITCH: these plans replace Pro/Business for agency visitors only once every
// `product` below holds a live Dodo product id. Until then `live` is false and
// agency visitors keep seeing Pro/Business, so nothing can send someone to a
// checkout that does not exist. Fill the ids (and the same ids in the worker)
// to turn it on.
//
// Credits: every option grants ALL its credits at purchase (12 months' worth on
// annual, 3 months' on quarterly), the same way annual Pro/Scale already do.
// That is what "use them whenever in your term" on the cards means -- there is
// no monthly reset to explain or build.

(function () {
    var plans = [
        {
            key: 'agency',
            name: 'Agency',
            creditsPerMonth: 30000,
            options: [
                { billing: 'annual',    planKey: 'agency_annual',    price: 1428, months: 12, planNumber: 12, product: '' },
                { billing: 'quarterly', planKey: 'agency_quarterly', price: 417,  months: 3,  planNumber: 11, product: '' }
            ]
        },
        {
            key: 'agency_pro',
            name: 'Agency Pro',
            creditsPerMonth: 75000,
            options: [
                { billing: 'annual', planKey: 'agency_pro_annual', price: 2988, months: 12, planNumber: 13, product: '' }
            ]
        }
    ];

    var byPlanKey = {};
    var byPlanNumber = {};
    var live = true;
    plans.forEach(function (plan) {
        plan.options.forEach(function (o) {
            o.perMonth = Math.round(o.price / o.months);
            o.credits = plan.creditsPerMonth * o.months;
            o.plan = plan;
            byPlanKey[o.planKey] = o;
            byPlanNumber[o.planNumber] = o;
            if (!/^pdt_/.test(o.product)) live = false;
        });
    });

    function money(n) { return '$' + n.toLocaleString('en-US'); }

    // The plan cards for the app's pricing modal and the account billing
    // modal, which share the plan-item-* markup. Each button calls the page's
    // proceedToAgencyCheckout(planKey, button). currentPlanKey disables the
    // button of the plan the account already has.
    function cardsHtml(currentPlanKey) {
        return plans.map(function (plan, index) {
            var yearly = plan.options[0];
            var perks = window.LF_AGENCY_PLANS.perks.map(function (p) { return '&#10003; ' + p; }).join('<br>');
            var buttons = plan.options.map(function (o, i) {
                var isCurrent = currentPlanKey === o.planKey;
                var label = isCurrent ? 'Current plan'
                    : (o.billing === 'annual' ? 'Pay yearly: ' : 'Pay quarterly: ') + money(o.price);
                var cls = 'plan-item-cta' + (i === 0 && index === 0 ? ' plan-item-cta-popular' : '');
                var style = i > 0 ? ' style="margin-top:0.4rem;background:#fff;color:var(--primary);border:1px solid var(--primary);"' : '';
                return '<button class="' + cls + '"' + style + ' onclick="proceedToAgencyCheckout(\'' + o.planKey + '\', this)"' + (isCurrent ? ' disabled' : '') + '>' + label + '</button>'
                    + (o.billing === 'quarterly' ? '<div class="plan-item-annual" style="margin-top:0.2rem;">' + money(o.perMonth) + '/mo, billed every 3 months</div>' : '');
            }).join('');
            return '<div class="plan-item' + (index === 0 ? ' plan-item-popular' : '') + '">'
                + (index === 0 ? '<div class="plan-popular-badge">Most agencies</div>' : '')
                + '<div class="plan-item-name">' + plan.name + '</div>'
                + '<div class="plan-item-price"><span class="plan-item-amount">' + money(yearly.perMonth) + '</span><span class="plan-item-period">/mo</span></div>'
                + '<div class="plan-item-annual">billed ' + money(yearly.price) + '/year</div>'
                + '<div class="plan-item-credits">' + plan.creditsPerMonth.toLocaleString('en-US') + ' credits/mo</div>'
                + '<div class="plan-item-per-credit">' + yearly.credits.toLocaleString('en-US') + ' credits on yearly</div>'
                + '<div style="font-size:0.68rem;color:var(--gray-500);line-height:1.5;margin-top:0.5rem;padding-top:0.5rem;border-top:1px dashed var(--gray-200);text-align:left;">' + perks + '</div>'
                + buttons
                + '</div>';
        }).join('');
    }

    window.LF_AGENCY_PLANS = {
        plans: plans,
        cardsHtml: cardsHtml,
        live: live,
        option: function (planKey) { return byPlanKey[planKey] || null; },
        byPlanNumber: function (n) { return byPlanNumber[n] || null; },
        // The free first list is run with them on the setup call. The money-back
        // guarantee is /refund-policy#annual-guarantee, which names these plans:
        // yearly only, never quarterly.
        perks: [
            'All credits up front: use them whenever in your term',
            'We run your first client list with you on a setup call',
            '30-day money-back guarantee on yearly'
        ]
    };
})();
