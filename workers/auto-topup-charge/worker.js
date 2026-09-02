// Auto top-up: charge the card on file when a user runs low.
//
// TOPUP_PACKS IS A PRICE LIST. It must equal the pay-as-you-go packs sold in
// app.html and account.html, and shown in api-access.html. It did not, for a
// while: this worker charged $19 for 5,000 credits while the same credits cost
// $200 through PAYG, and $149 bought 60,000 credits when Enterprise charges
// $149/month for 50,000. Auto top-up was the cheapest way to buy credits by a
// factor of eight, and undercut every subscription tier.
//
// tests/auto-topup-pricing.test.mjs compares this table against every other
// place the packs appear and fails on any disagreement. Change one, change all.
const TOPUP_PACKS = {
    payg_small:  { credits: 1000,  amount_cents: 2500  }, // $25 for 1,000 credits
    payg_medium: { credits: 3500,  amount_cents: 7500  }, // $75 for 3,500 credits
    payg_large:  { credits: 10000, amount_cents: 20000 }, // $200 for 10,000 credits
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function callSettingsWorker(env, body) {
    const r = await env.SETTINGS_WORKER.fetch('https://internal/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return r.json();
}

export default {
    async fetch(request, env) {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

        let body;
        try {
            body = await request.json();
        } catch (e) {
            return json({ error: 'Invalid JSON body' }, 400);
        }

        const { token, current_credits } = body;
        if (!token) return json({ error: 'Missing token' }, 400);

        // 1. Fetch settings to confirm auto top-up is actually enabled & configured
        const { settings } = await callSettingsWorker(env, { action: 'get', token });
        if (!settings || !settings.enabled) {
            return json({ skipped: true, reason: 'not_enabled' });
        }
        if (!settings.dodo_subscription_id) {
            return json({ skipped: true, reason: 'no_payment_method_on_file' });
        }
        if (current_credits !== undefined && current_credits >= settings.threshold) {
            return json({ skipped: true, reason: 'above_threshold' });
        }

        // An unknown pack key charges nothing. That is deliberate: the old keys
        // (small/medium/large) named the old, wrong prices, so a settings record
        // written before the repricing fails closed here instead of charging an
        // amount its owner never agreed to.
        const pack = TOPUP_PACKS[settings.pack_key];
        if (!pack) return json({ error: 'Invalid pack_key on settings' }, 400);

        // 2. Acquire lock (guards against concurrent requests double-charging)
        const lockResp = await callSettingsWorker(env, { action: 'acquire_lock', token });
        if (!lockResp.locked) {
            return json({ skipped: true, reason: lockResp.reason || 'lock_unavailable' });
        }

        let chargeSucceeded = false;
        let dodoResponse = null;

        try {
            // 3. Charge the on-demand subscription for this user
            const chargeResp = await fetch(
                `${env.DODO_API_BASE}/subscriptions/${settings.dodo_subscription_id}/charge`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${env.DODO_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        // Dodo's on-demand charge endpoint takes a custom amount for this transaction
                        product_price: pack.amount_cents,
                        metadata: {
                            reason: 'auto_topup',
                            user_token: token,
                            pack_key: settings.pack_key,
                            // The webhook grants exactly this many credits on
                            // payment.succeeded, so credits follow the table above
                            // and no Dodo product needs to change.
                            credits_to_grant: String(pack.credits),
                        },
                    }),
                }
            );

            dodoResponse = await chargeResp.json();

            if (!chargeResp.ok) {
                throw new Error(dodoResponse.message || dodoResponse.error || `Dodo charge failed with status ${chargeResp.status}`);
            }

            // Charge was accepted by Dodo (payment.succeeded webhook will follow and grant credits).
            // Some payment methods are async (e.g. certain bank debits) — we don't grant credits here,
            // we just record that the attempt went through.
            chargeSucceeded = true;

            try {
                // best-effort analytics / notification, never block on this
                if (env.NOTIFY_WORKER_URL) {
                    await fetch(env.NOTIFY_WORKER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'auto_topup_charged',
                            token,
                            pack_key: settings.pack_key,
                            amount_cents: pack.amount_cents,
                        }),
                    });
                }
            } catch (e) { /* swallow */ }

            return json({ success: true, payment_id: dodoResponse.payment_id || dodoResponse.id });
        } catch (err) {
            // Charge attempt itself failed outright (not just "pending") — e.g. card declined synchronously,
            // invalid subscription, network error from Dodo.
            console.error('auto_topup_charge_failed', { token, subscriptionId: settings.dodo_subscription_id, error: err.message });
            await callSettingsWorker(env, { action: 'disable', token, reason: 'card_failed' });

            try {
                if (env.NOTIFY_WORKER_URL) {
                    await fetch(env.NOTIFY_WORKER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'auto_topup_failed',
                            token,
                            error: err.message,
                        }),
                    });
                }
            } catch (e) { /* swallow */ }

            return json({ success: false, error: err.message }, 502);
        } finally {
            // 4. Always release the lock, whether the charge succeeded or failed
            await callSettingsWorker(env, { action: 'release_lock', token, success: chargeSucceeded });
        }
    },
};
