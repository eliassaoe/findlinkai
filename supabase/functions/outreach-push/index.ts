// Sends already-enriched leads into a cold-outreach tool.
//
// The twelve destination adapters in integrations/outreach/ were written, tested
// and then called by nothing: there was no server to run them, nowhere to keep a
// user's Instantly key, and no way to trigger a push. This is that missing half.
//
// Two rules shape it.
//
// It NEVER enriches. Every caller arrives with results the user has already paid
// for — a bulk run on screen, a CSV, a history row. Re-running the lookup so the
// server could own the whole flow would charge them twice for data they are
// looking at. `vendor/outreach.mjs` carries the push half only; the enriching
// half stays in the library and is not vendored here.
//
// It NEVER hands a credential back. outreach_connections has RLS on with no anon
// policy, so only this function's service key reaches it. A destination API key
// is a credential to somebody else's system: the browser sends one in and gets a
// masked hint out, and a leaked LinkFinder token is not enough to read it.

import { pushLeads, checkDestination, DESTINATIONS, BUNDLE_SHA } from './vendor/outreach.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// A push is a write to somebody's live email campaign. One request may not send
// an unbounded number of them, and the function has a wall clock besides.
const MAX_LEADS_PER_PUSH = 200;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const db = (path: string, init: RequestInit = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    });

/** A token is this app's whole credential, so it is checked against a real account. */
async function resolveUser(token: unknown): Promise<string | null> {
    if (typeof token !== 'string' || token.length < 8) return null;
    const r = await db(`linkfinderai_users?token=eq.${encodeURIComponent(token)}&select=token&limit=1`);
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.token ?? null;
}

/** What the browser is allowed to see about a stored credential. */
function maskCredentials(credentials: Record<string, string> = {}) {
    const masked: Record<string, string> = {};
    for (const [field, value] of Object.entries(credentials)) {
        const text = String(value ?? '');
        // A base URL or workspace id is not a secret and is worth showing in full
        // so someone can tell one connection from another.
        if (field !== 'apiKey' && field !== 'accessToken') {
            masked[field] = text;
            continue;
        }
        masked[field] = text.length > 4 ? `••••${text.slice(-4)}` : '••••';
    }
    return masked;
}

const publicRow = (row: any) => ({
    destination: row.destination,
    label: row.label,
    target: row.target,
    credentials: maskCredentials(row.credentials),
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    last_error: row.last_error,
});

/** The catalogue the UI renders — what each destination needs before it can run. */
const catalogue = () =>
    Object.values(DESTINATIONS).map((d: any) => ({
        id: d.id,
        label: d.label,
        auth: d.auth,
        docs: d.docs,
        targetLabel: d.targetLabel,
        extraCredentials: d.extraCredentials ?? [],
        prefers: d.prefers ?? 'email',
    }));

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

    const { action } = body ?? {};
    if (action === 'catalogue') return json({ destinations: catalogue() });

    // The bundle is uploaded as text, so the deployed copy could differ from the
    // repo's and nothing would say so. It hashes itself; this reports the hash.
    if (action === 'version') return json({ bundle_sha: BUNDLE_SHA, destinations: Object.keys(DESTINATIONS).length });

    const userId = await resolveUser(body?.token);
    if (!userId) return json({ error: 'Unknown token' }, 401);

    try {
        switch (action) {
            case 'list': {
                const r = await db(`outreach_connections?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at`);
                const rows = r.ok ? await r.json() : [];
                return json({ connections: rows.map(publicRow), destinations: catalogue() });
            }

            case 'save': {
                const { destination, credentials, target, label } = body;
                if (!DESTINATIONS[destination]) return json({ error: `Unknown destination "${destination}"` }, 400);

                // Validated before it is stored, so a missing workspace id is a
                // message now rather than a failed push later.
                try {
                    checkDestination(destination, { credentials, target });
                } catch (e) {
                    return json({ error: (e as Error).message }, 400);
                }
                if (!credentials?.apiKey && !credentials?.accessToken) {
                    return json({ error: `${DESTINATIONS[destination].label} needs an API key.` }, 400);
                }

                const row = {
                    user_id: userId,
                    destination,
                    label: label ?? DESTINATIONS[destination].label,
                    credentials,
                    target: target ?? {},
                    updated_at: new Date().toISOString(),
                    last_error: null,
                };
                const saved = await db('outreach_connections?on_conflict=user_id,destination', {
                    method: 'POST',
                    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
                    body: JSON.stringify(row),
                });
                if (!saved.ok) return json({ error: 'Could not save the connection' }, 500);
                return json({ connection: publicRow((await saved.json())[0]) });
            }

            case 'delete': {
                const { destination } = body;
                await db(`outreach_connections?user_id=eq.${encodeURIComponent(userId)}&destination=eq.${encodeURIComponent(String(destination))}`,
                    { method: 'DELETE' });
                return json({ deleted: true });
            }

            case 'push': {
                const { destination, results, requireEmail = true, target: overrideTarget } = body;
                if (!Array.isArray(results) || results.length === 0) {
                    return json({ error: 'Nothing to send' }, 400);
                }
                if (results.length > MAX_LEADS_PER_PUSH) {
                    return json({ error: `Send at most ${MAX_LEADS_PER_PUSH} leads at a time.` }, 400);
                }

                const r = await db(`outreach_connections?user_id=eq.${encodeURIComponent(userId)}&destination=eq.${encodeURIComponent(String(destination))}&select=*&limit=1`);
                const connection = r.ok ? (await r.json())[0] : null;
                if (!connection) return json({ error: `No ${destination} connection — add its API key first.` }, 400);

                let outcome;
                try {
                    outcome = await pushLeads({
                        destination,
                        credentials: connection.credentials,
                        // A caller may aim one send at a different campaign without
                        // reconnecting; absent that, the stored one is used.
                        target: overrideTarget?.id ? overrideTarget : connection.target,
                        results,
                        requireEmail,
                    });
                } catch (e) {
                    const message = (e as Error).message;
                    await db(`outreach_connections?id=eq.${connection.id}`, {
                        method: 'PATCH', body: JSON.stringify({ last_error: message }),
                    });
                    return json({ error: message }, 400);
                }

                // A push that failed every lead is a broken connection, and saying
                // so on the connection is what stops it being retried blindly.
                const firstFailure = outcome.failed[0]?.error ?? null;
                await db(`outreach_connections?id=eq.${connection.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        last_used_at: new Date().toISOString(),
                        last_error: outcome.pushed.length === 0 ? firstFailure : null,
                    }),
                });

                return json({
                    destination: outcome.destination,
                    pushed: outcome.pushed.length,
                    skipped: outcome.skipped,
                    failed: outcome.failed.map((f: any) => ({ input: f.input, error: f.error })),
                });
            }

            default:
                return json({ error: `Unknown action "${action}"` }, 400);
        }
    } catch (e) {
        console.error('outreach_push_error', action, (e as Error).message);
        return json({ error: 'Something went wrong handling that.' }, 500);
    }
});
