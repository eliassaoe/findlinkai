// Carries on a CSV enrichment after the user has closed the tab.
//
// The in-app run is a loop in the browser, so leaving stops it. A batch the
// user has handed over is marked 'queued'; pg_cron pokes this function every
// thirty seconds, it claims a batch, enriches rows, and puts it back.
//
// Rows are worked IN PARALLEL — several at once inside one invocation, and
// several invocations at once on the same batch. That is possible because each
// row owns the CSV lines for its own span of the user's original rows, which
// any worker can compute alone from input_rows, and because rows are stored
// individually and assembled in order at the end rather than appended to one
// column. Serial, the old shape managed 30-50 rows a minute; a 10,000-row file
// took hours.
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
const SLICE_MS = 50_000;
const ROW_TIMEOUT_MS = 60_000;
const LEASE_SECONDS = 180;
const ROW_LEASE_SECONDS = 120;

// How many rows one invocation enriches at once. The wall-clock cost of a row
// is nearly all waiting on the pipeline, so this is the difference between ~25
// rows a slice and several hundred. Raising it raises load on the enrichment
// pipeline in direct proportion — that, not this runner, is the ceiling.
const ROW_CONCURRENCY = Number(Deno.env.get('CSV_ROW_CONCURRENCY') ?? 8);

const CREDIT_COSTS: Record<string, number> = {
    company_name_to_website: 1, company_name_to_phone: 1, company_name_to_linkedin_url: 1,
    email_to_linkedin_url: 5, company_name_to_employees: 1, company_name_to_employee_count: 1,
    company_name_to_email: 5, linkedin_company_to_linkedin_info: 6, linkedin_company_to_employees: 1,
    linkedin_company_to_employee_count: 1, linkedin_profile_to_linkedin_info: 10,
    lead_full_name_to_linkedin_url: 1, linkedin_profile_to_email: 10, company_domain_to_employees: 1,
    linkedin_post_to_reactions: 1, linkedin_profile_to_phone: 50, lead_full_name_to_email: 7,
    company_domain_to_email: 5,
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

// Enriches one row and returns the CSV lines it owns: the user's original rows
// from just after the previous enrichable row through this one. Computed from
// input_rows alone, which is why workers need no coordination.
async function enrichRow(
    b: any, data: any[], rowIndex: number,
    csvHeaders: string[], csvRows: string[][],
): Promise<{ lines: string; found: boolean; credits: number } | { retry: true; reason: string }> {
    const inputType = b.input_type, outputType = b.output_type;

    // The header slot, and the trailing-rows slot past the last input row.
    if (rowIndex === -1) {
        return { lines: renderRange(0, -1, true, csvHeaders, csvRows, new Map(), inputType, outputType), found: false, credits: 0 };
    }
    if (rowIndex >= data.length) {
        const from = data.length ? data[data.length - 1].srcIndex + 1 : 0;
        return { lines: renderRange(from, csvRows.length - 1, false, csvHeaders, csvRows, new Map(), inputType, outputType), found: false, credits: 0 };
    }

    const row = data[rowIndex];
    const spanFrom = rowIndex === 0 ? 0 : data[rowIndex - 1].srcIndex + 1;

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

    let shaped: { row: Result; charged: boolean };
    try {
        const res = await withTimeout(ENRICH_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        }, ROW_TIMEOUT_MS);

        const text = await res.text();
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch { parsed = text; }

        // The credit wall and a 5xx are both worth another go later; the row
        // goes back pending rather than into the file as a false "Error".
        if (res.status === 403 && parsed?.code === 403) return { retry: true, reason: 'out_of_credits' };
        if (!res.ok && res.status >= 500) return { retry: true, reason: `enrich ${res.status}` };

        shaped = res.ok
            ? shapeResult(row.inputData, outputType, parsed)
            : { row: { inputData: row.inputData, result: 'Not found', status: 'Not found' }, charged: false };

        if (res.ok) {
            // Same webhook the linkfinderapp worker fires, so a background row
            // reaches a user's integrations like a foreground one.
            fetch(WEBHOOK_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'fire', token: b.user_id, type: payload.type,
                    input: row.inputData, result: parsed, credits_used: 1,
                }),
            }).catch(() => {});
        }
    } catch (e) {
        return { retry: true, reason: e instanceof Error ? e.message : String(e) };
    }

    const bySrc = new Map<number, Result>([[row.srcIndex, shaped.row]]);
    return {
        lines: renderRange(spanFrom, row.srcIndex, false, csvHeaders, csvRows, bySrc, inputType, outputType),
        found: shaped.row.status === 'Found',
        credits: shaped.row.status === 'Found' ? (CREDIT_COSTS[`${inputType}_to_${outputType}`] ?? 1) : 0,
    };
}

async function runSlice(): Promise<string> {
    const claimed = await rpc('csv_batch_claim', { p_lease_seconds: LEASE_SECONDS });
    const b = (await claimed.json())?.[0] ?? null;
    if (!b) return 'nothing queued';

    const started = Date.now();
    const csvRows: string[][] = b.input_rows ?? [];
    const csvHeaders: string[] = b.csv_headers ?? [];
    const data = buildCsvData(csvRows, b.column_mapping ?? {}, b.input_type);
    const filename = `${(b.file_name || 'enriched').replace(/\.[^.]+$/, '')}_enriched.csv`;

    // First worker to reach a batch lays out its rows. The tab's half of the
    // archive is left alone: sharding starts where the browser stopped.
    if (!b.sharded) {
        await rpc('csv_batch_shard', {
            p_id: b.id,
            p_from_row: b.processed_rows ?? 0,
            p_total: data.length,          // the trailing-rows slot
            p_needs_header: !b.has_archive,
        });
    }

    let done = 0, outOfCredits = false, lastReason: string | null = null;

    // One wave at a time. Claiming ahead was costing more than it saved: a
    // worker that grabbed forty rows and ran out of slice after eight left the
    // other thirty-two claimed and idle until their lease expired, which stalled
    // the whole batch for minutes at a time.
    while (Date.now() - started < SLICE_MS) {
        const got = await rpc('csv_batch_claim_rows', {
            p_id: b.id, p_limit: ROW_CONCURRENCY, p_lease_seconds: ROW_LEASE_SECONDS,
        });
        const wave: number[] = (await got.json() ?? []).map((r: any) => r.row_index);
        if (!wave.length) break;

        const results = await Promise.all(wave.map(async (idx) => ({
            idx, out: await enrichRow(b, data, idx, csvHeaders, csvRows),
        })));

        const giveBack: number[] = [];
        for (const { idx, out } of results) {
            if ('retry' in out) {
                lastReason = out.reason;
                if (out.reason === 'out_of_credits') outOfCredits = true;
                giveBack.push(idx);
                continue;
            }
            await rpc('csv_batch_row_done', {
                p_id: b.id, p_row: idx, p_lines: out.lines,
                p_found: out.found, p_credits: out.credits,
            });
            done++;
        }
        // A row nobody could enrich this time goes straight back rather than
        // sitting on a dead lease.
        if (giveBack.length) {
            await rpc('csv_batch_unclaim_rows', { p_id: b.id, p_rows: giveBack });
        }
        if (outOfCredits) break;
    }

    // Assembles only when every row is in, so whichever worker finishes last
    // closes the batch and the others no-op.
    const assembled = await rpc('csv_batch_assemble', { p_id: b.id, p_filename: filename });
    if (await assembled.json() === true) return `${b.id}: ${done} rows this slice, completed`;

    await rpc('csv_batch_release', {
        p_id: b.id,
        p_status: outOfCredits ? 'out_of_credits' : null,
        p_error: lastReason,
    });
    return `${b.id}: ${done} rows this slice, ${outOfCredits ? 'out of credits' : 'requeued'}${lastReason ? ` (${lastReason})` : ''}`;
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
