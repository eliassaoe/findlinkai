// The $49 Starter plan, and nothing else.
//
// It lives in this file, not in any page's HTML, so it can be kept out of the
// page source of agency visitors: LFSegment.writeStarterScript() (bottom of
// js/lf-attribution.js) loads this file only for visitors who are NOT in the
// agency segment. Agency browsers never fetch it. docs/agency-pricing.md.
//
// Read by:
//   app.html      -> plans[] and DODO_DIRECT_PRODUCTS (the second-door links)
//   account.html  -> its plans[]
//   pricing.html  -> the Starter card, written in place by LF_STARTER_CARD_HTML
//
// Prices: app.html stores the ANNUAL credit figure and divides by 12 (CLAUDE.md).

window.LF_STARTER_PLAN = { name:'Starter', key:'starter', monthlyPrice:49, credits:60000 };

// Live Dodo product ids, read from the Dodo dashboard on 14 Sep 2026.
// tests/checkout-second-door.test.mjs pins them.
window.LF_STARTER_PRODUCTS = {
    starter_monthly:    'pdt_0Nfl5LZfppnjJBM2mvons',   // Starter Plan            $49/mo
    starter_annual:     'pdt_0Nfl5q5bWWWymf2XQnJUD'    // Annual Starter          $348/yr
};

// The /pricing card. Same markup the page carried inline until the agency
// segment shipped; the page's updatePricing() toggles its monthly/annual text.
window.LF_STARTER_CARD_HTML = "    <div class=\"pricing-card\" data-plan=\"starter\">\n      <span class=\"best-for\">Solo prospectors</span>\n      <div class=\"plan-name\">Starter</div>\n      <p class=\"plan-description\">For individuals doing occasional enrichment and outreach</p>\n      <div class=\"price-row\">\n        <span class=\"price-currency\">$</span>\n        <span class=\"price-amount\" data-monthly=\"49\" data-annual=\"29\">49</span>\n      </div>\n      <p class=\"price-period\">\n        <span class=\"monthly-text\">per month</span>\n        <span class=\"annual-text hidden\">per month, billed annually</span>\n      </p>\n      <p class=\"price-was annual-text hidden\"><s>$49/mo billed monthly</s> <span class=\"save-tag\">Save $240/yr</span></p>\n      <p class=\"price-was monthly-text\">&nbsp;</p>\n      <div class=\"credits-info\">\n        <div class=\"credits-amount\" data-monthly=\"5,000\" data-annual=\"60,000\">5,000</div>\n        <div class=\"credits-label\">\n          <span class=\"monthly-text\">credits per month</span>\n          <span class=\"annual-text hidden\">credits per year</span>\n        </div>\n        <div class=\"credit-cost\">= <span class=\"cost-per-credit\" data-monthly=\"$0.0098\" data-annual=\"$0.0058\">$0.0098</span> per credit</div>\n      </div>\n      <ul class=\"plan-features\">\n        <li><span class=\"check\">&#10003;</span> Bulk CSV, unlimited list size, full export</li>\n        <li><span class=\"check\">&#10003;</span> Google Sheets add-on</li>\n        <li><span class=\"check\">&#10003;</span> REST API + MCP server, n8n / Make / Zapier</li>\n        <li><span class=\"check\">&#10003;</span> HubSpot sync</li>\n        <li><span class=\"check\">&#10003;</span> Business email and phone discovery</li>\n        <li><span class=\"check\">&#10003;</span> All 17 enrichment types, verified data</li>\n      </ul>\n      <a href=\"https://linkfinderai.com/sign-up?plan=starter\" class=\"btn-trial\">Start Free Trial \u2192</a>\n      <p class=\"no-cc\"><i class=\"fas fa-lock\"></i> No credit card required \u00b7 Free credits</p>\n      <p class=\"guarantee-line\"><i class=\"fas fa-shield-alt\"></i> 14-day money-back guarantee</p>\n    </div>\n";

// The two FAQ lines on /pricing that quote this plan, written in place.
window.LF_STARTER_FAQ = {
    credits: '<li><strong>Starter:</strong> 5,000 credits/mo — roughly 250 fully enriched leads</li>',
    annual:  '<li>Starter: $29/mo annual vs $49/mo monthly → <strong>save $240/year</strong></li>'
};
