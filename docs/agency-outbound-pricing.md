# Outbound pricing (Agency / Agency Pro)

**Built:** 2026-10-07 · **Tests:** `tests/agency-outbound-plans.test.mjs` ·
**Price list:** `js/lf-agency-plans.js` · **Status: OFF until the Dodo products exist (checklist below)**

People who come from outbound see two plans that nobody else sees. They replace
Pro/Business for the agency segment. Who is in that segment hasn't changed:
`utm_campaign=agency*`, an `email=` link, or `/agency`. See
`docs/agency-pricing.md`. The Instantly links already carry
`utm_campaign=agency_annual`.

| Plan | Yearly | Quarterly | Credits |
|---|---|---|---|
| **Agency** | $1,428 ($119/mo) | $417 every 3 months ($139/mo) | 30,000/mo: 360,000 per year, 90,000 per quarter |
| **Agency Pro** | $2,988 ($249/mo) | not sold | 75,000/mo: 900,000 per year |

- **Billing:** there is no month-to-month option. The billing toggle and the pay-as-you-go packs are hidden for these accounts.
- **Credits:** all of a term's credits are granted at purchase, the same way annual Pro/Scale already work. That's what "all credits up front" on the cards means. There's no rollover mechanism to build.
- **Setup call:** every plan includes it (we run their first client list with them). The booking prompt is shown after payment (`AGENCY_PLAN_KEYS` in `app.html`).
- **Refund:** the 30-day money-back guarantee covers the yearly plans only (`refund-policy.html#annual-guarantee`).
- **Custom plans:** the "Need more? Book a custom plan" card stays.

## Why these numbers

Assumptions, set on 7 Oct 2026:

- A hot reply costs $25.
- Pessimistic conversion from hot reply to paid is 5%, so each customer costs $500. That rate matches the 5% of `upgrade_clicked` users who paid over the 90 days to Oct 2026.
- Gross margin is 50%.

In the pessimistic case the expected mix is:
- 40% Agency yearly
- 10% Agency Pro yearly
- 50% quarterly, cancelling after one quarter

That averages $1,079 of revenue, or $540 of gross profit, per customer. So the pessimistic case breaks even (1.08×), and a 10% conversion rate returns 2.2×. Break-even is 4.6% of hot replies paying.

These prices are deliberately not the public ones:
- **No $49 tier and no packs.** A cheap entry point costs more to acquire than it earns before churn. 31 Starter/Pro subscribers used a median of 0 credits in 90 days, and the top cancel reason is "not using".
- **No monthly.** The cheapest option still brings in $417 upfront.

**Stop rule:** after 40 hot replies you need 2 or more paid. If you have 0 or 1, the real rate is very likely under 10%: change the offer or the audience before spending more.

## How it works

`LF_AGENCY_PLANS.live` is true only when all three `product` ids in
`js/lf-agency-plans.js` start with `pdt_`. While it is false, nothing in this
document changes what anyone sees.

| Surface | With `live` true, for an agency account |
|---|---|
| `app.html` pricing modal | `renderPlansGrid()` → `LF_AGENCY_PLANS.cardsHtml()` + custom-plan card; toggle and packs hidden |
| `app.html` credits wall | `showInsufficientCreditsModal()` opens the pricing modal instead of the pack picker |
| `app.html` `?action=upgrade&plan=agency_*`, `lf_pending_plan` | `agencyPlanParam()` → `proceedToAgencyCheckout()` |
| `account.html` billing modal | same cards, toggle and packs hidden |
| `/pricing` | Pro/Business cards replaced, toggle and packs section hidden |
| `/agency` | plan section, fine print and two FAQ answers rewritten (DOM calls only: the page forbids `innerHTML`) |
| `workers/dodo-checkout/worker.js` | `PRODUCT_IDS.agency_quarterly / agency_annual / agency_pro_annual`; an empty id answers `Plan not configured` |

Checkout uses the existing `launchCheckout()`. The plan keys are
`agency_annual`, `agency_quarterly` and `agency_pro_annual`. `plan_selected`,
`checkout_session_created` and `checkout_payment_success` carry them in
`plan_key`. `LFSegment.planId()` turns them into `agency` / `agency_pro`.

## Turning it on (checklist)

1. **Dodo dashboard:** create three subscription products.
   - Agency: $1,428, billed every 12 months.
   - Agency: $417, billed every 3 months.
   - Agency Pro: $2,988, billed every 12 months.
2. **Paste the three `pdt_…` ids** into both places:
   - `js/lf-agency-plans.js` (`product: ''`)
   - `workers/dodo-checkout/worker.js` (`PRODUCT_IDS`)

   The test fails if the two disagree.
3. **n8n `dodo-webhook-handler`:** this is not in this repo, and nothing grants credits without it. It must map each new product, on its first payment and on every renewal, to:

   | Product | `plan_type` | Credits granted |
   |---|---|---|
   | Agency quarterly | 11 | 90,000 |
   | Agency yearly | 12 | 360,000 |
   | Agency Pro yearly | 13 | 900,000 |

   It must also set `subscription_id`, exactly like the existing subscription products. The plan numbers have to match `planNumber` in `js/lf-agency-plans.js`, because the modal uses them to mark "Current plan".
4. **Deploy the checkout worker:** paste `workers/dodo-checkout/worker.js` into Cloudflare → Workers & Pages → `dodo-checkout`.
5. **Merge the site.** GitHub Pages serves it.
6. **Test with a fresh account** that landed on `/agency`:
   - buy the quarterly plan;
   - check that `plan_type = 11` and the credits arrived;
   - refund it.

## Not covered

- **Packs can still be bought by API.** Auto top-up on `account.html` and the `payg_*` keys in the worker still sell packs to anyone who calls them directly. Only the pricing surfaces hide them.
- **Pages that still show public prices.** The SEO tool pages, `crm-audit` / `crm-sync` and the `*-beta*.html` copies still quote the public plans. That gap is the same one `docs/agency-pricing.md` lists.
- **Accounts already in the segment.** They switch to these plans as soon as `live` is true. Before turning it on, check whether any of them already pays for Pro/Business: `select plan_type, count(*) from linkfinderai_users where segment = 'agency' group by 1;`. Their plan keeps working, but the modal won't mark it as "Current plan".
