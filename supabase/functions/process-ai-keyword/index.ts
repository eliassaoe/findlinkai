// Finds the pages answer engines cite for a keyword, then emails the people
// who own that content.
//
// This is the "Listicle Outreach Finder" n8n workflow, moved onto pg_cron. One
// invocation does ONE unit of work and returns, because a whole keyword does
// not fit in an Edge Function's 150 seconds: three web-search model calls, then
// an employee lookup and up to three email lookups for every page they cited.
//
//   discover  ask each model the keyword through OpenRouter's web plugin, keep
//             the pages it cited, note where Google has them, write them down
//   enrich    take one of those pages, find the marketing people at the domain
//             that published it, keep the ones who own content, get their
//             address, push them into Instantly
//
// public.ai_claim_work() decides which of the two happens, and enforces that
// only one keyword is ever in flight.
//
// WHAT THIS SPENDS. Every LinkFinder call is money, and this runs unattended
// over hundreds of keywords, so the caps matter more than the coverage:
//
//   company_domain_to_employees   0.5 credits PER EMPLOYEE RETURNED, so
//                                 EMPLOYEE_COUNT is the real price of a page —
//                                 15 employees is 7.5 credits, and the 100 the
//                                 n8n flow asked for was 50.
//   linkedin_profile_to_email     10 credits, and only paid when the employee
//                                 record did not already carry the address.
//                                 It usually does. The n8n flow bought every
//                                 one of them regardless.
//
// A domain is worked once ever (ai_outreach_domains) and a person is mailed
// once ever (ai_outreach_leads), across every keyword.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Supabase kills the invocation at 150s. Everything stops well before that so
// the worker closes its own unit of work rather than leaving a stale claim.
const DEADLINE_MS = 115_000;

// Pages worked per keyword. Answer engines cite the same handful of strong
// pages; the tail is aggregators and noise, and each one past this costs.
const MAX_CITATIONS_PER_KEYWORD = Number(Deno.env.get('AI_KEYWORDS_MAX_CITATIONS') ?? 12);

// People pushed per domain. Three content leaders at one company is an
// introduction; ten is a mailing list they will report.
const MAX_LEADS_PER_DOMAIN = Number(Deno.env.get('AI_KEYWORDS_MAX_LEADS_PER_DOMAIN') ?? 3);

// Billed 0.5 credits each, per seniority asked — see the note above before
// raising it. Dropped from 15 when the third seniority was added, so widening
// the net to reach small companies costs about what two seniorities did.
const EMPLOYEE_COUNT = Number(Deno.env.get('AI_KEYWORDS_EMPLOYEE_COUNT') ?? 10);

// A "Head of Content" does not come back under seniority=director, and is the
// single best person to reach about a listicle. `founder` is what reaches the
// small end of the list: every startup page cited so far — artisan.co,
// driftwood.sh, agentmelt.com, cellcog.ai, getbreakout.ai — returned nobody at
// director or head, because a ten-person company has no Director of Content.
//
// Valid values are the ones the app's own dropdown offers: c_suite, director,
// entry, founder, head, manager, owner, partner, senior, vp. "C-suite" is NOT
// among them — asked for it, the API returns one all-null row rather than an
// error, so process-keyword's [head, C-suite, director] loop has been paying
// for a pass that never returned anybody.
const SENIORITIES = (Deno.env.get('AI_KEYWORDS_SENIORITIES') ?? 'director,head,founder')
    .split(',').map((s) => s.trim()).filter(Boolean);

// Seniorities where the person runs the company, so "they own the content" is
// true by default rather than by job title.
const OWNER_SENIORITIES = new Set(['founder', 'owner', 'c_suite', 'partner']);

const DEPARTMENT = Deno.env.get('AI_KEYWORDS_DEPARTMENT') ?? 'marketing';
const OWN_DOMAIN = (Deno.env.get('AI_KEYWORDS_OWN_DOMAIN') ?? 'linkfinderai.com').toLowerCase();
// sonar, not sonar-pro: both charge the same $0.005 for the search, and the
// search is what is being bought — the prose is discarded unread.
const DEFAULT_MODELS = 'perplexity/sonar';
const DEFAULT_CAMPAIGN = '03939b49-b215-4221-892c-68f092556d29';

// Whose job title means they own the page we are writing about. Straight from
// the workflow's filter — a director of demand generation cares that a listicle
// exists, a director of partnerships does not.
const TITLE_MATCHES = [
    'content', 'seo', 'brand', 'growth', 'organic', 'demand generation', 'product marketing',
];

// Checked first, and it beats a match above.
//
// The list is a substring match, and "growth" is the leaky one: a live run on
// zoominfo.com matched a "Global Account Director, Enterprise Growth" and a
// "Director of Sales, Retention and Growth" — both quota-carrying sales roles
// that have no say over an article and would read a listicle-mention pitch as
// spam. `department=marketing` did not exclude them, so the title has to.
const TITLE_EXCLUDES = [
    'sales', 'account executive', 'account director', 'account manager',
    'business development', 'customer success', 'revenue operations',
    'recruit', 'talent acquisition',
];

// Cited constantly by every model, and never somewhere to send outreach: the
// page belongs to a platform, not to a marketing team that wants traffic.
// Review sites (g2, capterra, trustradius) are deliberately NOT here — being
// listed on those is the whole point of the play.
const PLATFORM_DOMAINS = new Set([
    'reddit.com', 'youtube.com', 'wikipedia.org', 'linkedin.com', 'facebook.com',
    'x.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'pinterest.com',
    'quora.com', 'medium.com', 'substack.com', 'github.com', 'stackoverflow.com',
    'google.com', 'apple.com', 'amazon.com', 'ycombinator.com', 'wordpress.com',
]);

// Domains whose last two labels are a public suffix, so tesla.co.uk is one
// company and not "co.uk". Only the ones outreach actually runs into.
const MULTI_PART_TLDS = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.jp', 'co.nz', 'co.za', 'co.in',
    'com.au', 'com.br', 'com.mx', 'com.sg', 'com.tr', 'net.au', 'org.au',
]);

type Work =
    | { kind: 'discover'; keyword_id: number; keyword: string }
    | { kind: 'enrich'; citation_id: number; keyword_id: number; keyword: string; url: string; title: string | null; domain: string }
    | { kind: 'idle'; reason: string };

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

const rpc = (name: string, body: unknown = {}) =>
    db(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Keys come from the vault, under names only this feature reads.
 *
 * Not from LINKFINDERAI_TOKEN or INSTANTLY_API_KEY: those project secrets
 * belong to process-keyword, the older Google-SERP flow, and may be a
 * different LinkFinder balance and a different Instantly workspace than the
 * campaign this pushes to. Sharing them would spend the wrong account's
 * credits and reject every lead against a campaign it cannot see.
 *
 * An AI_KEYWORDS_-prefixed environment variable overrides the vault, so a key
 * can be rotated without a migration.
 */
let cachedSettings: Record<string, string> | null = null;
async function secret(envName: string, vaultName: string, fallback = ''): Promise<string> {
    const fromEnv = Deno.env.get(envName);
    if (fromEnv) return fromEnv;
    if (!cachedSettings) {
        const res = await rpc('ai_settings');
        cachedSettings = res.ok ? ((await res.json()) ?? {}) : {};
    }
    return cachedSettings![vaultName] ?? fallback;
}

// ---------------------------------------------------------------- urls

/** Host of a URL, without www and without the port. */
function toDomain(url: string): string | null {
    if (typeof url !== 'string') return null;
    const match = url.match(/^https?:\/\/([^/]+)/i);
    if (!match) return null;
    return match[1].replace(/^www\./i, '').split(':')[0].toLowerCase();
}

/** The company-level domain: blog.hubspot.com and hubspot.com are one company. */
function registrable(host: string): string {
    const parts = host.toLowerCase().replace(/^www\./, '').split('.');
    if (parts.length <= 2) return parts.join('.');
    const lastTwo = parts.slice(-2).join('.');
    if (MULTI_PART_TLDS.has(lastTwo)) return parts.slice(-3).join('.');
    return lastTwo;
}

const normalizeUrl = (url: string) => url.split('#')[0].replace(/\/$/, '');

/**
 * Whether an address belongs to the company that published the page. The
 * workflow asked whether the address string contained the domain, which throws
 * away anyone at learn.g2.com and lets bobg2.com@gmail.com through. Comparing
 * the company-level domain of each side is the same intent, done properly.
 */
function emailBelongsToDomain(email: string, domain: string): boolean {
    const host = email.split('@')[1]?.trim().toLowerCase();
    if (!host) return false;
    return registrable(host) === registrable(domain);
}

/** Carries the HTTP status, so the caller can tell "broken" from "not yet". */
class HttpError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}

/**
 * Thrown when the work could not be done for a reason that has nothing to do
 * with the work itself. A keyword that fails this way goes back on the queue
 * rather than being written off.
 */
class RetryLater extends Error {}

// An empty OpenRouter balance, a rate limit, a timeout, a 5xx: all of them say
// "not now", none of them says the keyword is bad. Anything else — a 400, a
// 401, a 404 — is a real problem that retrying only repeats.
const isRetryable = (status: number) =>
    status === 402 || status === 408 || status === 429 || status >= 500;

async function fetchJson(url: string, init: RequestInit, label: string, timeoutMs = 45_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        const text = await res.text();
        let body: any;
        try { body = JSON.parse(text); } catch { body = text; }
        if (!res.ok && res.status !== 202) {
            throw new HttpError(`[${label}] HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
        }
        return body;
    } catch (e) {
        if ((e as Error).name === 'AbortError') throw new HttpError(`[${label}] timed out after ${timeoutMs / 1000}s`, 408);
        // A dropped connection is the same kind of "not now" as a 5xx.
        if (!(e instanceof HttpError)) throw new HttpError(`[${label}] ${(e as Error).message}`, 503);
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

// ------------------------------------------------------------ discovery

type Citation = { url: string; title: string; domain: string; cited_by: string[]; citation_count: number; google_position: number | null };

/**
 * Asks the models the keyword verbatim. That is the measurement: the keyword IS
 * the question a buyer types, and rewriting it into a nicer prompt would rank
 * the prompt instead of the keyword.
 */
async function askModel(model: string, keyword: string, apiKey: string) {
    // Perplexity searches the web itself and returns its citations in the same
    // annotations shape. Bolting OpenRouter's Exa plugin on top of that pays
    // twice for one answer, so it is only attached to models that cannot
    // search alone.
    //
    // This is the whole cost of the feature. Measured against OpenRouter's own
    // price list: Exa on gemini-3.6-flash is ~$0.025 a keyword, sonar's native
    // search is $0.005 — and sonar came back with ten cited pages where the
    // plugin capped out at five. Cheaper AND wider.
    const searchesNatively = model.startsWith('perplexity/');

    const body = await fetchJson('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: keyword }],
            ...(searchesNatively ? {} : { plugins: [{ id: 'web', engine: 'exa', max_results: 5 }] }),
            // Only the citation annotations are read; the prose is thrown away.
            // Left unset, OpenRouter reserves 8000 output tokens against the
            // balance for an answer nothing looks at — which both costs more
            // and fails outright on a small balance ("you requested up to 8000
            // tokens, but can only afford 2576"). The prompt itself stays the
            // bare keyword, so the measurement is unchanged.
            max_tokens: 1000,
        }),
    }, `openrouter:${model}`, 60_000);

    const annotations = body?.choices?.[0]?.message?.annotations ?? [];
    return annotations
        .filter((a: any) => a?.type === 'url_citation' && a.url_citation?.url)
        .map((a: any) => ({ url: a.url_citation.url as string, title: (a.url_citation.title ?? '') as string }));
}

/** Where Google has each domain, so the strongest pages get worked first. */
async function googlePositions(keyword: string, apiKey: string): Promise<Record<string, number>> {
    if (!apiKey) return {};
    try {
        const body = await fetchJson('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: keyword, num: 20 }),
        }, 'serper', 20_000);
        const positions: Record<string, number> = {};
        (body?.organic ?? []).forEach((entry: any, index: number) => {
            const domain = toDomain(entry.link ?? '');
            if (domain && !(domain in positions)) positions[domain] = index + 1;
        });
        return positions;
    } catch (e) {
        console.warn(`serper failed: ${(e as Error).message}`);
        return {};
    }
}

async function discover(keyword: string): Promise<{ citations: Citation[]; note: string | null; modelsAnswered: number }> {
    const openrouterKey = await secret('AI_KEYWORDS_OPENROUTER_KEY', 'openrouter_api_key');
    if (!openrouterKey) throw new Error('No OpenRouter key — set the openrouter_api_key vault secret (or AI_KEYWORDS_OPENROUTER_KEY).');

    const models = (await secret('AI_KEYWORDS_MODELS', 'ai_keywords_models', DEFAULT_MODELS))
        .split(',').map((m) => m.trim()).filter(Boolean);
    if (!models.length) throw new Error('No models configured — set the ai_keywords_models vault secret.');

    // In parallel: three models asked one after another is most of the
    // invocation's budget, and they do not depend on each other.
    const answers = await Promise.allSettled(models.map((m) => askModel(m, keyword, openrouterKey)));

    const byUrl = new Map<string, Citation>();
    const failures: string[] = [];
    const failureStatuses: number[] = [];
    let modelsAnswered = 0;

    answers.forEach((answer, index) => {
        const model = models[index];
        if (answer.status === 'rejected') {
            failures.push(`${model}: ${(answer.reason as Error).message}`.slice(0, 300));
            failureStatuses.push((answer.reason as HttpError)?.status ?? 0);
            return;
        }
        modelsAnswered += 1;
        for (const cited of answer.value) {
            const domain = toDomain(cited.url);
            if (!domain) continue;
            const root = registrable(domain);
            if (root === registrable(OWN_DOMAIN)) continue;
            if (PLATFORM_DOMAINS.has(root)) continue;

            const key = normalizeUrl(cited.url);
            const existing = byUrl.get(key);
            if (existing) {
                if (!existing.cited_by.includes(model)) {
                    existing.cited_by.push(model);
                    existing.citation_count += 1;
                }
                if (!existing.title && cited.title) existing.title = cited.title;
            } else {
                byUrl.set(key, {
                    url: cited.url,
                    title: cited.title,
                    domain,
                    cited_by: [model],
                    citation_count: 1,
                    google_position: null,
                });
            }
        }
    });

    if (modelsAnswered === 0) {
        const why = `Every model failed. ${failures.join(' | ')}`;
        // An empty OpenRouter balance would otherwise write off the entire
        // queue in an afternoon, one keyword a minute, with nothing to show.
        if (failureStatuses.every(isRetryable)) throw new RetryLater(why);
        throw new Error(why);
    }

    const serperKey = await secret('AI_KEYWORDS_SERPER_KEY', 'serper_api_key');
    const positions = await googlePositions(keyword, serperKey);

    const citations = [...byUrl.values()]
        .map((c) => ({ ...c, google_position: positions[c.domain] ?? null }))
        .sort((a, b) =>
            b.citation_count - a.citation_count ||
            (a.google_position ?? 99) - (b.google_position ?? 99))
        .slice(0, MAX_CITATIONS_PER_KEYWORD);

    return { citations, note: failures.length ? failures.join(' | ').slice(0, 2000) : null, modelsAnswered };
}

// ----------------------------------------------------------- enrichment

/**
 * One LinkFinder call. Any endpoint can answer 202 with a job_id instead of a
 * result when it runs long — most often the employee lookup, which is the one
 * this leans on. The workflow parsed that reply as an empty employee list and
 * silently found nobody.
 */
async function linkfinder(payload: Record<string, unknown>, label: string, token: string, deadline: number) {
    let body = await fetchJson('https://api.linkfinderai.com', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }, label, 40_000);

    if (body?.job_id && body?.status === 'processing') {
        const pollUrl = body.poll_url ?? `https://api.linkfinderai.com/status/${body.job_id}`;
        while (Date.now() < deadline) {
            await sleep(5_000);
            body = await fetchJson(pollUrl, {
                headers: { Authorization: `Bearer ${token}` },
            }, `${label}:poll`, 20_000);
            if (body?.status === 'done') break;
            if (body?.status === 'error') throw new Error(`[${label}] job failed: ${body?.message ?? 'no message'}`);
        }
        if (body?.status === 'processing') throw new Error(`[${label}] still processing when the slice ran out`);
    }
    return body;
}

/** Employees come back as a bare array, under `result`, or under `employees`. */
function asEmployeeList(body: any): any[] {
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.result)) return body.result;
    if (Array.isArray(body?.employees)) return body.employees;
    if (Array.isArray(body?.result?.employees)) return body.result.employees;
    return [];
}

const ownsContent = (jobTitle: unknown) => {
    const title = String(jobTitle ?? '').toLowerCase();
    if (title === '') return false;
    if (TITLE_EXCLUDES.some((match) => title.includes(match))) return false;
    return TITLE_MATCHES.some((match) => title.includes(match));
};

async function pushToInstantly(lead: any, work: Extract<Work, { kind: 'enrich' }>, apiKey: string, campaign: string) {
    return await fetchJson('https://api.instantly.ai/api/v2/leads', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: lead.email,
            first_name: lead.first_name ?? '',
            last_name: lead.last_name ?? '',
            company_name: lead.company ?? '',
            website: work.url,
            personalization: work.title ?? work.url,
            campaign,
            custom_variables: {
                job_title: lead.job_title ?? '',
                linkedin_url: lead.linkedin_url ?? '',
                keyword: work.keyword,
                article_url: work.url,
                article_title: work.title ?? '',
            },
        }),
    }, 'instantly', 30_000);
}

async function enrich(work: Extract<Work, { kind: 'enrich' }>, deadline: number) {
    const root = registrable(work.domain);

    if (PLATFORM_DOMAINS.has(root) || root === registrable(OWN_DOMAIN)) {
        return { status: 'skipped', skipReason: 'platform or own domain', leads: 0, employees: 0 };
    }

    // Claiming the domain and finding it taken are the same statement, so two
    // keywords that both cite hubspot.com cannot both pay to work it.
    const claim = await db('ai_outreach_domains', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
            domain: root,
            first_keyword_id: work.keyword_id,
            first_keyword: work.keyword,
        }),
    });
    if (claim.status === 409) {
        return { status: 'skipped', skipReason: 'domain already worked for an earlier keyword', leads: 0, employees: 0 };
    }
    if (!claim.ok) throw new Error(`Could not claim ${root}: HTTP ${claim.status}`);

    const linkfinderToken = await secret('AI_KEYWORDS_LINKFINDER_TOKEN', 'linkfinder_api_key');
    if (!linkfinderToken) throw new Error('No LinkFinder token — set the linkfinder_api_key vault secret (or AI_KEYWORDS_LINKFINDER_TOKEN).');

    const seen = new Map<string, any>();
    const problems: string[] = [];
    const problemStatuses: number[] = [];

    for (const seniority of SENIORITIES) {
        if (Date.now() > deadline) break;
        try {
            const body = await linkfinder({
                type: 'company_domain_to_employees',
                input_data: root,
                department: DEPARTMENT,
                seniority,
                employee_count: EMPLOYEE_COUNT,
            }, `employees:${seniority}`, linkfinderToken, deadline);

            for (const person of asEmployeeList(body)) {
                // A lookup that matches nobody answers with one all-null row,
                // not an empty list. It has no key, so it never lands here.
                const key = String(person?.linkedinUrl ?? person?.personId ?? person?.name ?? '').toLowerCase();
                // The record's own `seniority` is often absent; the seniority
                // asked for is not, so that is what gets remembered.
                if (key && !seen.has(key)) seen.set(key, { ...person, _askedSeniority: seniority });
            }
        } catch (e) {
            problems.push((e as Error).message.slice(0, 200));
            problemStatuses.push((e as HttpError)?.status ?? 0);
        }
    }

    const employees = [...seen.values()];
    let candidates = employees.filter((p) => ownsContent(p.jobTitle));

    // At a company with nobody holding a content title, the founder IS the
    // person who owns the content — they wrote the page. Without this the
    // whole small-company end of the list is unreachable: the title filter
    // rejects "Founder" and "CEO", so finding them would change nothing.
    // One per domain, and only when the proper owners are absent.
    if (candidates.length === 0) {
        candidates = employees
            .filter((p) => OWNER_SENIORITIES.has(String(p._askedSeniority ?? '')))
            .slice(0, 1);
    }

    // Nothing came back AND something went wrong: LinkFinder was down, or the
    // slice ran out. Release the domain so a later keyword that cites it can
    // try again — a transient failure must not retire a company forever.
    if (employees.length === 0 && problems.length > 0) {
        await db(`ai_outreach_domains?domain=eq.${encodeURIComponent(root)}`, { method: 'DELETE' });
        const why = problems.join(' | ').slice(0, 2000);
        // Out of LinkFinder credits is the same story as out of OpenRouter
        // credits: stop, do not spend the queue on it.
        if (problemStatuses.every(isRetryable)) throw new RetryLater(why);
        return { status: 'failed', skipReason: null, leads: 0, employees: 0, error: why };
    }

    const instantlyKey = await secret('AI_KEYWORDS_INSTANTLY_KEY', 'instantly_api_key');
    const campaign = await secret('AI_KEYWORDS_CAMPAIGN_ID', 'ai_keywords_campaign_id', DEFAULT_CAMPAIGN);
    if (!instantlyKey) throw new Error('No Instantly key — set the instantly_api_key vault secret (or AI_KEYWORDS_INSTANTLY_KEY).');

    let pushed = 0;
    let bought = 0;

    // Counted in leads actually pushed, not candidates considered: a director
    // with no address should cost the domain a slot in the list, not a lead.
    for (const person of candidates) {
        if (pushed >= MAX_LEADS_PER_DOMAIN) break;
        if (Date.now() > deadline) { problems.push('slice ran out before every lead was pushed'); break; }

        // The employee record usually already carries the address, and buying
        // it again costs 10 credits for something we were handed.
        let email: string | null = typeof person.email === 'string' && person.email.includes('@')
            ? person.email.trim() : null;
        let emailSource = 'employee_record';

        // The 10-credit lookup is capped separately, so a domain whose people
        // all lack a published address cannot run up a bill hunting for one.
        if (!email && person.linkedinUrl && bought < MAX_LEADS_PER_DOMAIN) {
            bought += 1;
            try {
                const body = await linkfinder({
                    type: 'linkedin_profile_to_email',
                    input_data: person.linkedinUrl,
                }, 'profile_to_email', linkfinderToken, deadline);
                const found = body?.result ?? body?.email ?? body;
                email = typeof found === 'string' && found.includes('@') ? found.trim() : null;
                emailSource = 'linkedin_profile_to_email';
            } catch (e) {
                problems.push((e as Error).message.slice(0, 200));
            }
        }

        if (!email) continue;
        if (!emailBelongsToDomain(email, root)) {
            problems.push(`${email} is not at ${root}`);
            continue;
        }

        const name = String(person.name ?? '').trim();
        const row = {
            email,
            full_name: name || null,
            first_name: person.firstName || name.split(' ')[0] || null,
            last_name: person.lastName || name.split(' ').slice(1).join(' ') || null,
            job_title: person.jobTitle ?? null,
            linkedin_url: person.linkedinUrl ?? null,
            company: person.company ?? null,
            domain: root,
            keyword_id: work.keyword_id,
            keyword: work.keyword,
            citation_id: work.citation_id,
            article_url: work.url,
            article_title: work.title,
            email_source: emailSource,
        };

        // Reserving the address before sending is what makes "mailed once,
        // ever" true: a 409 means another keyword already reached this person.
        const reserved = await db('ai_outreach_leads', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(row),
        });
        if (reserved.status === 409) continue;
        if (!reserved.ok) { problems.push(`Could not record ${email}: HTTP ${reserved.status}`); continue; }
        const leadId = (await reserved.json())?.[0]?.id;

        try {
            await pushToInstantly(row, work, instantlyKey, campaign);
            pushed += 1;
            await db(`ai_outreach_leads?id=eq.${leadId}`, {
                method: 'PATCH', body: JSON.stringify({ pushed: true }),
            });
        } catch (e) {
            const message = (e as Error).message.slice(0, 300);
            problems.push(message);
            await db(`ai_outreach_leads?id=eq.${leadId}`, {
                method: 'PATCH', body: JSON.stringify({ push_error: message }),
            });
        }
    }

    await db(`ai_outreach_domains?domain=eq.${encodeURIComponent(root)}`, {
        method: 'PATCH',
        body: JSON.stringify({ employees_seen: employees.length, leads_pushed: pushed }),
    });

    return {
        status: 'done',
        skipReason: null,
        leads: pushed,
        employees: employees.length,
        error: problems.length ? problems.join(' | ').slice(0, 2000) : null,
    };
}

// ------------------------------------------------------------------ loop

async function runOnce() {
    const deadline = Date.now() + DEADLINE_MS;

    const claimed = await rpc('ai_claim_work');
    if (!claimed.ok) throw new Error(`claim failed: HTTP ${claimed.status} ${await claimed.text()}`);
    const work = (await claimed.json()) as Work;

    if (work.kind === 'idle') return { idle: true, reason: work.reason };

    if (work.kind === 'discover') {
        try {
            const { citations, note, modelsAnswered } = await discover(work.keyword);
            const inserted = await rpc('ai_keyword_discovered', {
                p_keyword_id: work.keyword_id,
                p_citations: citations,
                p_note: note,
            });
            if (!inserted.ok) throw new Error(`could not save citations: HTTP ${inserted.status}`);
            return {
                stage: 'discover',
                keyword: work.keyword,
                models_answered: modelsAnswered,
                pages_found: await inserted.json(),
                note,
            };
        } catch (e) {
            const retry = e instanceof RetryLater;
            await rpc(retry ? 'ai_keyword_requeue' : 'ai_keyword_failed', {
                p_keyword_id: work.keyword_id, p_error: (e as Error).message,
            });
            return {
                stage: 'discover', keyword: work.keyword,
                [retry ? 'requeued' : 'failed']: (e as Error).message,
            };
        }
    }

    try {
        const outcome = await enrich(work, deadline);
        await rpc('ai_citation_done', {
            p_citation_id: work.citation_id,
            p_status: outcome.status,
            p_leads: outcome.leads,
            p_employees: outcome.employees,
            p_skip_reason: outcome.skipReason,
            p_error: (outcome as any).error ?? null,
        });
        return { stage: 'enrich', keyword: work.keyword, domain: work.domain, ...outcome };
    } catch (e) {
        // A page that genuinely could not be worked is finished: leaving it
        // pending would re-run the employee lookup on a domain already claimed
        // and pay for it twice. A page blocked by an empty balance is not
        // finished, and goes back — it has cost nothing and will work later.
        const retry = e instanceof RetryLater;
        await rpc(retry ? 'ai_citation_requeue' : 'ai_citation_done', retry
            ? { p_citation_id: work.citation_id, p_error: (e as Error).message.slice(0, 2000) }
            : { p_citation_id: work.citation_id, p_status: 'failed', p_error: (e as Error).message.slice(0, 2000) });
        return {
            stage: 'enrich', keyword: work.keyword, domain: work.domain,
            [retry ? 'requeued' : 'failed']: (e as Error).message,
        };
    }
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return new Response('POST only', { status: 405 });
    try {
        const detail = await runOnce();
        console.log(JSON.stringify(detail));
        return new Response(JSON.stringify({ ok: true, ...detail }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        console.error('process_ai_keyword_error', (e as Error).message);
        return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }
});
