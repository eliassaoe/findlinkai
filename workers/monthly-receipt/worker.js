/**
 * Monthly value receipt.
 *
 * Once a month, for every account that ran lookups in the last 30 days, this
 * counts what LinkFinder actually FOUND for them (not what they tried - see
 * docs/account-value-summary.md for why that distinction is the whole job)
 * and captures one PostHog event per person, `monthly_value_receipt`, with the
 * numbers as properties. PostHog workflow 12 turns that event into the email.
 *
 * Why an event and not an email from here: the lifecycle emails already live
 * in PostHog workflows, with the audience guard, the unsubscribe handling and
 * the Monday variant loop (workers/lifecycle-email). One more sender would
 * mean one more place to keep those right.
 *
 * Why the receipt exists: the account page has had "What you've found" since
 * September, but only the people who open the account page see it - and the
 * ones who open it are usually there to cancel. The number one cancellation
 * reason is "not using". The receipt puts the number in front of everyone who
 * did use it, once a month, with a link to the data.
 *
 * Nobody gets a receipt for zero. A month with nothing found is the idle case,
 * and workflow 11 (credits sitting there) already covers that with a different
 * message. A receipt that says "0" would be a cancellation prompt.
 *
 * The counting is one RPC, `monthly_value_receipts(p_days)`, defined in
 * README.md next to this file. It reuses `user_value_summary` per active user
 * so the numbers here and on the account page cannot drift apart.
 */

const POSTHOG_HOST = 'https://us.i.posthog.com';
const EVENT = 'monthly_value_receipt';
const SITE = 'https://linkfinderai.com';

// Same categories, same order and labels, as VALUE_TILES on account.html.
// `other` is counted by the RPC but not shown there, and not here.
const CATEGORIES = ['emails', 'phones', 'profiles', 'profiles_full', 'websites', 'companies', 'people'];

// Two minutes per manual lookup is a deliberately conservative figure: a
// name-to-email hunt is usually longer, a website lookup shorter. The email
// says how it was worked out.
const MINUTES_PER_FOUND = 2;

async function supabaseRpc(env, fn, body) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Supabase rpc/${fn} failed: ${res.status} ${text}`);
    }
    return res.json();
}

function monthLabel(now) {
    // The receipt goes out on the 1st and describes the month that just ended.
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
}

function monthKey(now) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function receiptFor(row, now, periodDays) {
    const summary = row.summary || {};
    const period = summary.last_30 || {};
    const counts = {};
    let found = 0;
    for (const c of CATEGORIES) {
        counts[c] = Number(period[c] || 0);
        found += counts[c];
    }
    const foundAllTime = CATEGORIES.reduce((n, c) => n + Number((summary.all_time || {})[c] || 0), 0);
    const hours = Math.round((found * MINUTES_PER_FOUND) / 60 * 10) / 10;
    const token = row.token;
    return {
        distinct_id: token,
        found_total: found,
        found_all_time: foundAllTime,
        lookups: Number(row.lookups || 0),
        csv_batches: Number(row.csv_batches || 0),
        ...counts,
        hours_saved: hours,
        is_subscriber: !!row.is_subscriber,
        plan_type: row.plan_type == null ? null : Number(row.plan_type),
        month_label: monthLabel(now),
        month_key: monthKey(now),
        period_days: periodDays,
        account_url: `${SITE}/account?token=${encodeURIComponent(token)}&src=monthly_receipt#what-you-found`,
        history_url: `${SITE}/history?token=${encodeURIComponent(token)}&src=monthly_receipt`,
    };
}

async function captureBatch(env, events) {
    for (let i = 0; i < events.length; i += 100) {
        const chunk = events.slice(i, i + 100);
        const res = await fetch(`${POSTHOG_HOST}/batch/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: env.POSTHOG_API_KEY,
                batch: chunk.map((e) => ({
                    event: EVENT,
                    distinct_id: e.distinct_id,
                    properties: e,
                    timestamp: new Date().toISOString(),
                })),
            }),
        });
        if (!res.ok) throw new Error(`PostHog batch failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
}

export async function runReceipts(env, { dry = false, now = new Date() } = {}) {
    const periodDays = Number(env.PERIOD_DAYS || 30);
    const minFound = Number(env.MIN_FOUND || 1);
    const rows = await supabaseRpc(env, 'monthly_value_receipts', { p_days: periodDays });
    const receipts = [];
    let skipped = 0;
    for (const row of rows || []) {
        if (!row || !row.token) continue;
        const r = receiptFor(row, now, periodDays);
        if (r.found_total < minFound) { skipped += 1; continue; }
        receipts.push(r);
    }
    if (!dry && receipts.length) {
        if (!env.POSTHOG_API_KEY) throw new Error('POSTHOG_API_KEY not set');
        await captureBatch(env, receipts);
    }
    const summary = {
        month: monthKey(now),
        active_accounts: (rows || []).length,
        receipts: receipts.length,
        skipped_zero: skipped,
        found_total: receipts.reduce((n, r) => n + r.found_total, 0),
        dry,
    };
    console.log(`[receipt] ${JSON.stringify(summary)}`);
    // The dry run returns the receipts without the token-bearing URLs, so a
    // preview never prints a session credential.
    return dry
        ? { ...summary, sample: receipts.slice(0, 20).map(({ distinct_id, account_url, history_url, ...rest }) => rest) }
        : summary;
}

export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(runReceipts(env).catch((e) => console.error('[receipt] run failed', e)));
    },

    // GET /run?dry=1  with  Authorization: Bearer <ADMIN_API_KEY>
    // Dry: compute and return the summary and a sample, capture nothing.
    // Without dry: capture for real, outside the schedule.
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname !== '/run') return new Response('monthly-receipt', { status: 200 });
        const auth = request.headers.get('Authorization') || '';
        if (!env.ADMIN_API_KEY || auth !== `Bearer ${env.ADMIN_API_KEY}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        try {
            const result = await runReceipts(env, { dry: url.searchParams.get('dry') === '1' });
            return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    },
};
