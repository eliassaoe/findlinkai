// Carries on a CSV enrichment after the user has closed the tab.
//
// The in-app run is a loop in the browser, so leaving stops it. A batch the
// user has handed over is marked 'queued'; pg_cron pokes this function every
// minute, it claims one, enriches a slice of rows, and puts it back. Nothing
// here is new state: input_rows, column_mapping and processed_rows were all
// built for the in-tab resume and mean exactly the same thing.
//
// Credits are deducted downstream by the enrichment pipeline, the same as for
// an in-app run, so a background row costs what a foreground row costs.

import { buildCsvData, renderRange } from './shared-export.js';

// The shared builder is plain JavaScript so the parity test can import the very
// file this runs; the shape it expects is described here.
type Result = {
    inputData: string; result?: unknown; status: string; rawData?: any;
    employees?: any[]; reactions?: any[]; employeeCount?: unknown; confidence?: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// The runner calls the enrichment pipeline directly rather than through the
// linkfinderapp worker, whose rate limit is per client IP: every background row
// would come from the same handful of Supabase addresses and throttle every
// user at once. This is the same request that worker forwards.
const ENRICH_URL = Deno.env.get('ENRICH_URL')
    ?? 'https://webhook-processor-production-a61c.up.railway.app/webhook/linkfinderapp';
const WEBHOOK_URL = 'https://webhook-settings.hamoureliasse.workers.dev/';

// One slice. Bounded by wall clock well inside the function timeout, so a slice
// always ends by choice and hands the batch back cleanly.
const SLICE_MS = 55_000;
const SLICE_ROWS = 120;
const ROW_TIMEOUT_MS = 60_000;
const LEASE_SECONDS = 180;

const CREDIT_COSTS: Record<string, number> = {
    company_name_to_website: 1, company_name_to_phone: 1, company_name_to_linkedin_url: 1,
    email_to_linkedin_url: 5, company_name_to_employees: 1, company_name_to_employee_count: 1,
    company_name_to_email: 1, linkedin_company_to_linkedin_info: 6, linkedin_company_to_employees: 1,
    linkedin_company_to_employee_count: 1, linkedin_profile_to_linkedin_info: 10,
    lead_full_name_to_linkedin_url: 1, linkedin_profile_to_email: 10, company_domain_to_employees: 1,
    linkedin_post_to_reactions: 1, linkedin_profile_to_phone: 50, lead_full_name_to_email: 7,
};

const db = (path: string, init: RequestInit = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            ...(init.headers ?? {}),
        },
    });

const rpc = (name: string, body: unknown) =>
    db(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });

async function withTimeout(url: string, init: RequestInit, ms: number) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { ...init, signal: ctl.signal }); }
    finally { clearTimeout(t); }
}

// Mirrors the browser's per-row handling so a row enriched here lands in the
// archive shaped exactly as one enriched in the tab.
function shapeResult(inputData: string, outputType: string, data: any): { row: Result; charged: boolean } {
    if (outputType === 'employee_count') {
        const count = data?.result || data || 'Not found';
        const found = count !== 'Not found';
        return {
            row: { inputData, result: found ? `${count} employees` : 'Not found',
                   status: found ? 'Found' : 'Not found', employeeCount: count },
            charged: found,
        };
    }
    if (outputType === 'employees' && (Array.isArray(data) || Array.isArray(data?.employees))) {
        const employees = Array.isArray(data) ? data : data.employees;
        return {
            row: { inputData, result: `${employees.length} employees found`,
                   status: employees.length ? 'Found' : 'Not found', employees },
            charged: employees.length > 0,
        };
    }
    if (outputType === 'reactions' && Array.isArray(data)) {
        return {
            row: { inputData, result: `${data.length} reactions found`, status: 'Found', reactions: data },
            charged: true,
        };
    }
    let parsedRaw = data;
    if (typeof data?.result === 'string' && data.result.startsWith('{')) {
        try { parsedRaw = JSON.parse(data.result); } catch { /* leave as-is */ }
    } else if (data?.result && typeof data.result === 'object') {
        parsedRaw = data.result;
    }
    const hasProfileData = !!(parsedRaw?.name || parsedRaw?.jobTitle || parsedRaw?.company);
    const hit = !!(data?.result || hasProfileData);
    return {
        row: {
            inputData,
            result: data?.result || (hasProfileData ? parsedRaw.name || 'Found' : 'Not found'),
            status: hit ? 'Found' : 'Not found',
            rawData: parsedRaw,
            confidence: data?.confidence,
        },
        charged: hit,
    };
}

async function runSlice(): Promise<string> {
    const claimed = await rpc('csv_batch_claim', { p_lease_seconds: LEASE_SECONDS });
    const batches = await claimed.json();
    const b = Array.isArray(batches) ? batches[0] : null;
    if (!b) return 'nothing queued';

    const started = Date.now();
    const inputType = b.input_type, outputType = b.output_type;
    const csvRows: string[][] = b.input_rows ?? [];
    const csvHeaders: string[] = b.csv_headers ?? [];
    const data = buildCsvData(csvRows, b.column_mapping ?? {}, inputType);

    let cursor: number = b.processed_rows ?? 0;
    let found: number = b.found_rows ?? 0;
    let credits = Number(b.credits_used) || 0;
    let needsHeader = !b.has_archive;
    // The archive already covers every original row up to the last one done.
    let nextSrc = cursor > 0 ? (data[cursor - 1]?.srcIndex ?? cursor - 1) + 1 : 0;
    let done = 0, outOfCredits = false, hardError: string | null = null;

    while (cursor < data.length && done < SLICE_ROWS && Date.now() - started < SLICE_MS) {
        const row = data[cursor];
        let shaped: { row: Result; charged: boolean };

        try {
            const payload: Record<string, unknown> = {
                type: `${inputType}_to_${outputType}`,
                input_data: row.inputData,
                output_type: outputType,
                token: b.user_id,
                is_bulk: true,
            };
            if (inputType === 'lead_full_name' && outputType === 'email') {
                const parts = (row.name || '').trim().split(/\s+/);
                payload.first_name = parts[0] || '';
                payload.last_name = parts.slice(1).join(' ') || '';
                payload.domain = (row.company || '').toLowerCase()
                    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
            }
            if (outputType === 'employees' && (inputType === 'company_domain' || inputType === 'linkedin_company')) {
                payload.department = row.department || 'all';
                payload.seniority = row.seniority || 'all';
                payload.employee_count = row.employee_count ?? null;
            }

            const res = await withTimeout(ENRICH_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            }, ROW_TIMEOUT_MS);

            const text = await res.text();
            let parsed: any = null;
            try { parsed = JSON.parse(text); } catch { parsed = text; }

            if (res.status === 403 && parsed?.code === 403) { outOfCredits = true; break; }
            if (!res.ok) {
                // A 5xx is worth another slice; the batch goes back queued
                // untouched at this row rather than writing a false "Error".
                if (res.status >= 500) { hardError = `enrich ${res.status}`; break; }
                shaped = { row: { inputData: row.inputData, result: 'Not found', status: 'Not found' }, charged: false };
            } else {
                shaped = shapeResult(row.inputData, outputType, parsed);
                // Same webhook the linkfinderapp worker fires, so a background
                // row reaches a user's integrations like a foreground one.
                fetch(WEBHOOK_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'fire', token: b.user_id, type: payload.type,
                        input: row.inputData, result: parsed, credits_used: 1,
                    }),
                }).catch(() => {});
            }
        } catch (e) {
            hardError = `row failed: ${e instanceof Error ? e.message : String(e)}`;
            break;
        }

        if (shaped.row.status === 'Found') {
            found++;
            credits += CREDIT_COSTS[`${inputType}_to_${outputType}`] ?? 1;
        }

        const bySrc = new Map<number, Result>([[row.srcIndex, shaped.row]]);
        const chunk = renderRange(nextSrc, row.srcIndex, needsHeader, csvHeaders, csvRows, bySrc, inputType, outputType);

        const at = await rpc('csv_batch_checkpoint', {
            p_id: b.id, p_user_id: b.user_id, p_from_row: cursor,
            p_processed: cursor + 1, p_found: found, p_credits: Math.round(credits * 100) / 100,
            p_chunk: chunk, p_filename: `${(b.file_name || 'enriched').replace(/\.[^.]+$/, '')}_enriched.csv`,
        });
        const stored = await at.json();
        if (stored !== cursor + 1) {
            // Somebody else moved the row on. Stop rather than append out of
            // order — a later slice will pick it up from wherever it now is.
            hardError = `checkpoint out of step (stored ${stored}, expected ${cursor + 1})`;
            break;
        }

        needsHeader = false;
        nextSrc = row.srcIndex + 1;
        cursor++; done++;
    }

    // A finished batch gets the user's trailing rows — the ones with no name to
    // look up, and any tail the enrichment never reached.
    if (!outOfCredits && !hardError && cursor >= data.length && nextSrc < csvRows.length) {
        const tail = renderRange(nextSrc, csvRows.length - 1, needsHeader, csvHeaders, csvRows, new Map(), inputType, outputType);
        if (tail) {
            await rpc('csv_batch_checkpoint', {
                p_id: b.id, p_user_id: b.user_id, p_from_row: cursor, p_processed: cursor,
                p_found: found, p_credits: Math.round(credits * 100) / 100, p_chunk: tail, p_filename: null,
            });
        }
    }

    const status = outOfCredits ? 'out_of_credits'
                 : (cursor >= data.length ? 'completed' : null); // null = back in the queue
    await rpc('csv_batch_release', { p_id: b.id, p_status: status, p_error: hardError });

    return `${b.id}: ${done} rows, cursor ${cursor}/${data.length}, ${status ?? 'requeued'}${hardError ? ` (${hardError})` : ''}`;
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return new Response('POST only', { status: 405 });
    try {
        return new Response(JSON.stringify({ ok: true, detail: await runSlice() }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }
});
