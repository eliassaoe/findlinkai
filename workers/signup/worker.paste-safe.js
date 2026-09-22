/* linkfinderai-sign-up */
/* */
/* Front door for both signup paths - the email/password form in sign-up.html and */
/* the Google flow in confirmation-signup.html, which posts here with */
/* provider:'google'. One change here therefore covers both. */
/* */
/* It validates, blocks disposable domains, rate-limits by IP, decides the geo */
/* tier and the starting credit grant, then forwards everything to n8n. */
/* */
/* A campaign can override the grant with a gift code (`gift` in the body, put */
/* there by sign-up.html from ?gift=<code> on the landing URL). The code is looked */
/* up in GIFT_CREDITS below, so the amount itself never comes from the browser. */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, x-api-secret',
            'Access-Control-Max-Age': '86400',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 200, headers: corsHeaders });
        }

        console.log(`🌐 ${request.method} ${url.pathname}`);

        try {
            if (url.pathname === '/' && request.method === 'POST') {
                return handleSignup(request, corsHeaders, env);
            }

            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });

        } catch (error) {
            console.error('❌ Worker error:', error);
            return new Response(JSON.stringify({
                error: 'Internal server error',
                message: error.message
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
    },
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

/* Consumer mailbox providers other than Gmail. Gmail is handled separately just */
/* above, because a gmail address is a Google account and can always sign in with */
/* the Google button. These have no OAuth provider here, so the rule is a genuine */
/* block — priced at 2.0% of signups (38 people / 365 days) against 75.5% gmail */
/* and 22.6% business. See docs/email-verified-is-wrong.md. */
/* */
/* Exact-match against this Set, never a substring test: 'gmail.com' *contains* */
/* 'mail.com', so substring matching would block every Gmail user on earth. */
const CONSUMER_DOMAINS = new Set([
    'yahoo.com','yahoo.co.uk','yahoo.fr','yahoo.co.in','yahoo.ca','yahoo.com.au','ymail.com','rocketmail.com',
    'hotmail.com','hotmail.co.uk','hotmail.fr','outlook.com','outlook.fr','live.com','live.co.uk','msn.com',
    'icloud.com','me.com','mac.com',
    'aol.com','aim.com',
    'proton.me','protonmail.com','pm.me',
    'gmx.com','gmx.de','gmx.net','mail.com','email.com',
    'zoho.com','yandex.com','yandex.ru','inbox.com','rediffmail.com',
    'free.fr','orange.fr','laposte.net','sfr.fr','wanadoo.fr','web.de','t-online.de'
]);

function normalizeEmail(email) {
    const [local, domain] = email.toLowerCase().trim().split('@');
    if (!local || !domain) return email.toLowerCase().trim();
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        const cleaned = local.replace(/\./g, '').split('+')[0];
        return `${cleaned}@gmail.com`;
    }
    return `${local}@${domain}`;
}

async function isDisposable(domain, env) {
    if (!env.DISPOSABLE_DOMAINS) {
        console.warn('⚠️ DISPOSABLE_DOMAINS KV namespace not configured - disposable check disabled');
        return false;
    }
    const result = await env.DISPOSABLE_DOMAINS.get(domain);
    return result !== null;
}

/* Geo-tier detection for signup credit amounts. */
/* request.cf.country is populated automatically by Cloudflare on every */
/* request that hits this Worker directly from the browser — no external */
/* GeoIP lookup needed. CF-IPCountry header is used as a fallback in case */
/* request.cf is ever unavailable (e.g. certain local dev/preview setups). */
const LOW_CONVERSION_COUNTRIES = new Set(['IN', 'PK', 'NG', 'BD', 'EG']);

/* ─── Country policy ───────────────────────────────────────────────────────── */
/* */
/*   'allowlist' - ONLY the countries in ALLOWED_COUNTRIES can sign up. This is */
/*                 the strict setting and the one in force. Everywhere else is */
/*                 refused at the door, whether or not we have ever heard of it. */
/*   'block'     - the inverse: everyone signs up except LOW_CONVERSION_COUNTRIES. */
/*   'grant'     - everyone signs up, LOW_CONVERSION_COUNTRIES get zero credits. */
/*   'tier'      - the original: the tier only decides the grant size. */
/* */
/* An allowlist is the right shape for "serious customers only". A blocklist is */
/* a list of the farms you have already met; every new one is admitted until */
/* somebody notices. This inverts that: a new market has to be let in on */
/* purpose, which is a decision someone makes once, not an incident. */
const COUNTRY_POLICY = 'allowlist';

/* Where the money actually is. Paying customers by country, 180 days to */
/* 22 Sep 2026: */
/* */
/*   US 11 | FR 3 | GB 2 | UA 2 | CA 1 | NL 1 | SG 1 | JP 1 */
/* */
/* The list below is those countries plus high-income markets that sell the same */
/* way - the rest of Western Europe, the Nordics, ANZ, the Gulf, Hong Kong, */
/* Korea. It is deliberately not "US and UK only". */
/* */
/* US + UK alone would be 13 of the 24 paying customers outside the blocked */
/* tier. The other 11 - France first among them, which converts at 3.75% */
/* against the US's 3.46% and is the second-best market on the site - would be */
/* refused at signup. That is a 46% cut to the customer base to close a hole */
/* that none of those countries opened: the farm used invented US-shaped */
/* business domains, and the abuse rules below are what stopped it, not this */
/* list. */
/* */
/* To go US/UK-only anyway, replace this set with new Set(['US','GB']). One */
/* line, and the number above is what it costs. */
const ALLOWED_COUNTRIES = new Set([
    /* proven revenue */
    'US', 'GB', 'FR', 'CA', 'NL', 'SG', 'JP', 'UA',
    /* Western Europe */
    'DE', 'IE', 'BE', 'AT', 'CH', 'LU', 'IT', 'ES', 'PT',
    /* Nordics */
    'SE', 'NO', 'DK', 'FI', 'IS',
    /* ANZ */
    'AU', 'NZ',
    /* Gulf */
    'AE', 'SA', 'QA', 'KW', 'BH', 'OM',
    /* other high-income */
    'IL', 'HK', 'MO', 'KR', 'TW', 'BN',
    /* European microstates - tiny, but they are on the list because the rule is */
    /* "high income", and leaving one out only ever shows up as a refused customer */
    'MC', 'LI', 'AD', 'SM',
    /* Central/Eastern Europe with real B2B SaaS spend */
    'PL', 'CZ', 'EE', 'LT', 'LV', 'SI', 'SK', 'HU', 'RO', 'GR', 'HR', 'BG', 'CY', 'MT',
]);

/* Both gates below fail OPEN on an unknown country. */
/* */
/* getCountry() returns null when request.cf is unavailable - local dev, a */
/* preview environment, or a Cloudflare change. On an allowlist that matters far */
/* more than it did on a blocklist: "not in the allowed set" would be true of */
/* null, so a strict reading would refuse every signup on earth the moment geo */
/* lookup breaks, and it would look like the product was down rather than like a */
/* policy. A country we cannot identify is let through and lands in the standard */
/* tier; the abuse rules further down are what catch a farm, not this. */
function isBlockedCountry(country) {
    if (!country) return false;
    if (COUNTRY_POLICY === 'allowlist') return !ALLOWED_COUNTRIES.has(country);
    return COUNTRY_POLICY === 'block' && LOW_CONVERSION_COUNTRIES.has(country);
}

/* 22 Aug 2026: standard 150 -> 50, low_conversion 25 -> 10. */
/* */
/* The grant was 50 until mid-June, then raised to 150 to show more value. The */
/* effect is unambiguous in the data: the share of activated users who ever */
/* reached the paywall fell from ~26% to ~5% in the week of 14 June and stayed */
/* there. Raising the grant did what raising a grant does - it stopped people */
/* needing to buy. The median user spends 9 credits, so 50 is still several */
/* times a real evaluation. */
/* */
/* The low tier is cut harder for a different reason. Over sixteen weeks those */
/* five countries were 55% of signups and 5% of revenue: 993 signups produced */
/* one payment, against 820 producing twenty. At 0.1% conversion the grant there */
/* is a cost, not an investment. */
/* */
/* See docs/credit-grant.md for the full working. */
/* ─── Signup abuse ─────────────────────────────────────────────────────────── */

/* The 23 invented "business" domains the Sep 2026 farm rotated through. They */
/* exist to pass the consumer-domain check above: none is a real mailbox */
/* provider, so CONSUMER_DOMAINS never saw them, and none is a throwaway */
/* service, so the DISPOSABLE_DOMAINS list never saw them either. acmecorp.com */
/* and mycompany.org are the tell - they are example domains, not companies. */
/* */
/* Blocking the list is worth doing and is not the real defence: the next farm */
/* picks 23 different names. FARM_EMAIL_SHAPE and the per-domain cap below are */
/* what generalise. */
const BLOCKED_SIGNUP_DOMAINS = new Set([
    'summitpartners.com', 'northstar.io', 'vantagegrp.com', 'meridianpartners.com',
    'catalystlabs.co', 'bluepeak.io', 'acmecorp.com', 'quantumedge.io',
    'brightlabs.co', 'keystonegrp.com', 'apexindustries.com', 'mycompany.org',
    'ironcladhq.com', 'evergreenllc.com', 'pinnacleco.com', 'orbitalabs.co',
    'summitworks.com', 'peakridge.com', 'clearwater.io', 'northwindco.com',
    'tritoncorp.com', 'harborview.com', 'silverline.co',
]);

/* Every one of the 9,991 farm accounts was lf- plus exactly eight lowercase */
/* alphanumerics. This deliberately only matches that shape AND requires a digit, */
/* which is the cheap part of the defence, not the clever part. */
/* */
/* 'lf-outreach' is also eight characters and is a plausible team alias, so a */
/* bare length rule would refuse a real customer; requiring a digit keeps those */
/* out of scope. It costs coverage - farm locals like 'lf-jdbprhdq' have no */
/* digit and slip through this rule - and that is the right way round. Those are */
/* caught by BLOCKED_SIGNUP_DOMAINS and, for the next farm with fresh domains, */
/* by the per-domain cap, which is the rule that actually generalises: 23 */
/* domains at 5/day is 115 accounts, not the 3,760 this farm managed in a day. */
/* */
/* Never widen this into "gibberish detection". A false positive here is a real */
/* customer who cannot sign up and will not write in to say so. */
const FARM_EMAIL_SHAPE = /^lf[-.](?=[a-z0-9]{8}$)[a-z0-9]*\d[a-z0-9]*$/;

/* How many new accounts one email domain may open per 24h. */
/* */
/* Consumer domains are exempt: gmail alone is 75.5% of signups and is a shared */
/* mailbox provider, so a cap there would refuse real people all day. That is */
/* also why the farm did not use gmail - a gmail address has to survive Google's */
/* own login, which is the one check a script cannot cheaply fake. Business */
/* domains are the opposite: five new accounts a day on one company domain is */
/* already generous, and the farm averaged 434. */
/* */
/* 22 Sep, second pass: 5 -> 2. A real company onboarding its team does it once */
/* and can mail us; a farm needs volume every day. The error routes to sales, so */
/* the third colleague on a genuine domain is a conversation, not a lost lead. */
const DOMAIN_SIGNUPS_PER_DAY = 2;

/* Accounts one IP may open per 24h. Was 3; the farm walked through it on */
/* rotating proxies, so 3 was never the thing holding the line - but it is the */
/* rule that catches the cheap version of multi-accounting, someone opening a */
/* second free account from their own machine when the credits run out. At 1, */
/* that stops being possible without new infrastructure. */
/* */
/* The cost is real and worth naming: two colleagues behind one office NAT, on */
/* the same day, means the second one is refused. They are sent to sales rather */
/* than to a dead end, which for a product sold to teams is arguably where they */
/* should have gone anyway. */
const ACCOUNTS_PER_IP_PER_DAY = 1;

/* ─── Email verification ───────────────────────────────────────────────────── */
/* */
/* An email/password signup gets this much until the address is confirmed. The */
/* rest is stashed in KV under held_<normalized-email> and released by the */
/* verify-email worker when the confirmation link is clicked. */
/* */
/* Google signups are exempt and see no friction at all: Google verified the */
/* address before it reached us, and they are 76% of real signups. */
/* */
/* This is the patch described in workers/verify-email/SIGNUP_PATCH.md, which was */
/* written in August and never applied. That is why the farm's 9,991 accounts - */
/* every one of them an unverified email/password signup - collected full grants: */
/* the verify-email worker was live and correct, and nothing was ever calling it. */
const VERIFY_CAP = 10;

/* ⚠️ HARD PREREQUISITE: Supabase must have a CUSTOM SMTP server configured. */
/* */
/* Supabase's built-in mailer "will refuse to deliver messages to addresses that */
/* are not part of the project's team" (Supabase docs, Custom SMTP). It is not a */
/* rate limit you can live with - it is a refusal for every address that is not */
/* yours. It also creates the auth row and reports success while doing it, so */
/* provisionVerification() below sees a 200, caps the grant, and the person never */
/* receives anything. They sit on 10 credits with a resend button that cannot */
/* work, and nothing in any log says why. */
/* */
/* That is the one failure this whole design is supposed to avoid, and it is the */
/* one case the code cannot detect from here. Hence this switch. */
/* */
/* Set VERIFY_HOLD to false to keep sending the mail but stop capping the grant. */
/* Use it if confirmations are not arriving: it restores full grants in one line */
/* without reverting anything else in this file. */
/* */
/* Before turning this on for real: sign up with an address that is NOT on the */
/* Supabase team and confirm the mail actually lands. */
const VERIFY_HOLD = true;

/* Where to ask for the confirmation email. Supabase credentials live in the */
/* verify-email worker, which already holds them, so they are not duplicated */
/* here; this worker only needs the URL and a shared secret. */
/* */
/* Both come from the Cloudflare dashboard (Settings -> Variables). If either is */
/* missing the signup still succeeds at the FULL grant - see provisionVerification(). */
const VERIFY_WORKER_URL = 'https://verifyemail.hamoureliasse.workers.dev/provision';


const SIGNUP_CREDITS = { low_conversion: 10, standard: 50 };

/* Campaign gift codes -> starting credits. */
/* */
/* The landing page for a campaign (e.g. /100free for the cold-email sequence) */
/* sends people to /sign-up?gift=<code>; sign-up.html keeps the code in */
/* localStorage across the Google redirect and posts it here as `gift`. A known */
/* code replaces the geo grant outright (the recipients were hand-picked, so the */
/* low-conversion tier does not apply to them). An unknown, missing or malformed */
/* code is ignored and the normal grant applies - nothing a visitor can type in */
/* the URL turns into more than what is listed here. */
/* */
/* To run a new campaign: add a line here, paste the Worker into the Cloudflare */
/* dashboard (see README), then link to /sign-up?gift=<code>. */
/* */
/*   coldemail_1000  8 Sep 2026  icp30k_recruiting cold-email sequence, email 1 */
/*   coldemail_1000  RETIRED 22 Sep 2026 - see the incident note below. */
/* */
/* INCIDENT, 13-22 Sep 2026. coldemail_1000 went live on 8 Sep. Five days later */
/* a script started minting accounts against it: 9,991 accounts on the pattern */
/* lf-<8 chars>@<one of 23 invented business domains>, none email-verified, none */
/* paying, each collecting the 1,000-credit grant. 9.4M credits were provisioned */
/* this way and ~72,000 enrichments run off them, most of them */
/* linkedin_profile_to_email, which is the expensive supplier call. */
/* */
/* The README said the quiet part out loud - "anyone who has the link can use */
/* it, which is the accepted cost of a link that has to work from an email with */
/* no login". That was true. What made it expensive was the size of the grant */
/* behind it and the absence of any cap: a public code worth 1,000 credits, */
/* repeatable, is a mint. */
/* */
/* The table is deliberately left in place and empty. The lookup below already */
/* ignores unknown codes, so every old /100free link falls back to the normal */
/* grant and nothing breaks. If a campaign needs this again: keep the amount */
/* near the standard grant, and do not ship it without a cap on redemptions. */
const GIFT_CREDITS = {};

function giftFromBody(gift) {
    if (typeof gift !== 'string') return null;
    const code = gift.trim().toLowerCase().slice(0, 64);
    return Object.prototype.hasOwnProperty.call(GIFT_CREDITS, code) ? code : null;
}

function getCountry(request) {
    return (request.cf && request.cf.country) || request.headers.get('CF-IPCountry') || null;
}

function geoTierFromCountry(country) {
    return country && LOW_CONVERSION_COUNTRIES.has(country) ? 'low_conversion' : 'standard';
}

/* ─── Handler ───────────────────────────────────────────────────────────────── */

async function handleSignup(request, corsHeaders, env) {
    try {
        const body = await request.json();

        const { email, password, provider, type, ref, firstName, lastName, companyName, fbc, fbp, gclid, gift } = body;

        /* ── 1. Basic email validation ────────────────────────────────────────── */
        if (!email || !email.includes('@')) {
            return new Response(JSON.stringify({ error: 'A valid email address is required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 2. Normalize email (Gmail dot/+ dedup) ───────────────────────────── */
        const normalizedEmail = normalizeEmail(email);
        const emailDomain = normalizedEmail.split('@')[1];

        /* ── 2b. Geo tier + starting credits ───────────────────────────────────── */
        const country = getCountry(request);
        const geoTier = geoTierFromCountry(country);
        const giftCode = giftFromBody(gift);
        const startingCredits = giftCode
            ? GIFT_CREDITS[giftCode]
            : (COUNTRY_POLICY === 'grant' && geoTier === 'low_conversion')
                ? 0
                : SIGNUP_CREDITS[geoTier];

        console.log('📧 Handling signup:', {
            email,
            normalizedEmail,
            hasPassword: !!password,
            provider: provider || 'email',
            type,
            ref: ref || 'none',
            firstName: firstName || 'none',
            lastName: lastName || 'none',
            companyName: companyName || 'none',
            fbc: fbc || 'none',
            fbp: fbp || 'none',
            gclid: gclid || 'none',
            country: country || 'unknown',
            geoTier,
            gift: giftCode || (gift ? `unknown:${String(gift).slice(0, 64)}` : 'none'),
            startingCredits
        });

        /* ── 2c. Country policy ───────────────────────────────────────────────── */
        /* */
        /* Placed after the log above (so a refusal is still fully visible in the */
        /* tail) and before every KV read below, so a blocked attempt costs zero */
        /* reads on DISPOSABLE_DOMAINS and RATE_LIMITS. */
        /* */
        /* A gift code is exempt: those recipients were hand-picked for a campaign */
        /* and the code is checked against GIFT_CREDITS, so nothing a visitor can */
        /* type in the URL gets past this. */
        /* */
        /* This is the signup door only. Existing accounts - including a paying */
        /* customer whose team works from one of these countries - sign in through */
        /* the login worker and are not affected. The marketing pages, the API and */
        /* the MCP server are not affected either. See docs/geo-block.md. */
        /* The gift exemption that used to sit here is gone with the code that */
        /* justified it. GIFT_CREDITS is empty, so giftCode is always null, and a */
        /* future campaign must not be a way around the country policy. */
        if (isBlockedCountry(country)) {
            console.log('🚫 Country blocked at signup:', country, normalizedEmail);
            return new Response(JSON.stringify({
                error: 'We are not taking new signups in your country right now.',
                code: 'country_not_supported'
            }), {
                status: 403,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

/* Ask verify-email to create the Supabase auth row, which is what makes Supabase */
/* send the confirmation mail. */
/* */
/* Returns true only if the mail was actually requested. That return value decides */
/* whether the grant is capped, and the direction matters: if this worker is */
/* misconfigured - no secret bound, verify-email down - capping anyway would leave */
/* real people on 10 credits with no email to click and no way out, and the only */
/* signal would be silence. So a failure grants in full and shouts in the log. The */
/* cap is the protection; the email is the remedy, and it is not honest to apply */
/* one without the other. */
async function provisionVerification(email, env) {
    if (!env.PROVISION_SECRET) {
        console.error('⚠️ PROVISION_SECRET not bound - granting in full, NOT capping. ' +
                      'Bind it in the dashboard or every signup is unverified and unheld.');
        return false;
    }
    try {
        const r = await fetch(VERIFY_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, secret: env.PROVISION_SECRET })
        });
        if (!r.ok) {
            console.error('⚠️ provision failed', r.status, '- granting in full');
            return false;
        }
        const body = await r.json().catch(() => ({}));
        if (!body.ok) {
            console.error('⚠️ provision rejected - granting in full');
            return false;
        }
        return true;
    } catch (e) {
        console.error('⚠️ provision threw - granting in full:', e);
        return false;
    }
}

/* A domain nobody should be able to sign up from, by name or by shape. */
function isFarmSignup(localPart, domain) {
    return BLOCKED_SIGNUP_DOMAINS.has(domain) || FARM_EMAIL_SHAPE.test(localPart);
}

/* Per-domain daily cap, counted in the same KV the IP limiter uses. Consumer */
/* mailboxes are exempt (see DOMAIN_SIGNUPS_PER_DAY). Fails OPEN when the */
/* namespace is missing, like every other check in this file - a limiter that */
/* fails closed takes signups down and looks like an outage. */
async function domainOverCap(domain, env) {
    if (!env.RATE_LIMITS) {
        console.warn('⚠️ RATE_LIMITS KV not configured - per-domain cap disabled');
        return false;
    }
    if (domain === 'gmail.com' || domain === 'googlemail.com' || CONSUMER_DOMAINS.has(domain)) return false;
    try {
        const raw = await env.RATE_LIMITS.get(`dom_${domain}`);
        const seen = raw ? JSON.parse(raw) : { count: 0, firstAttempt: Date.now() };
        if (Date.now() - seen.firstAttempt > 24 * 60 * 60 * 1000) return false;
        return seen.count >= DOMAIN_SIGNUPS_PER_DAY;
    } catch (e) {
        console.error('⚠️ per-domain cap read failed, allowing:', e);
        return false;
    }
}

async function bumpDomainCount(domain, env) {
    if (!env.RATE_LIMITS) return;
    if (domain === 'gmail.com' || domain === 'googlemail.com' || CONSUMER_DOMAINS.has(domain)) return;
    try {
        const raw = await env.RATE_LIMITS.get(`dom_${domain}`);
        const now = Date.now();
        let seen = raw ? JSON.parse(raw) : { count: 0, firstAttempt: now };
        if (now - seen.firstAttempt > 24 * 60 * 60 * 1000) seen = { count: 0, firstAttempt: now };
        seen.count++;
        await env.RATE_LIMITS.put(`dom_${domain}`, JSON.stringify(seen), { expirationTtl: 86400 });
    } catch (e) {
        console.error('⚠️ per-domain cap write failed (non-critical):', e);
    }
}

        /* ── 2d. Signup farm: known domain, or the farm's email shape ─────────── */
        /* */
        /* Before every KV read, for the same reason the country check is: a farm */
        /* running thousands of attempts should not cost us a read each. The */
        /* message is deliberately the same one a consumer domain gets - there is */
        /* no reason to tell a script which rule it tripped. */
        if (isFarmSignup(normalizedEmail.split('@')[0], emailDomain)) {
            console.log('🚫 Farm signup blocked:', normalizedEmail);
            return new Response(JSON.stringify({
                error: 'Please sign up with your work email address.',
                code: 'business_email_required'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 3. Block disposable email domains ────────────────────────────────── */
        const disposable = await isDisposable(emailDomain, env);
        if (disposable) {
            console.log('🚫 Disposable email blocked:', emailDomain);
            return new Response(JSON.stringify({
                error: 'Please use a permanent email address to sign up.'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 3b. Gmail on the password form → send them to the Google button ──── */
        /* */
        /* A @gmail.com address IS a Google account, so anyone with a real one can */
        /* always sign in with Google — same address, one click, and Google has */
        /* already verified it for us. The only people this stops are the ones */
        /* typing a gmail they do not own, because they cannot pass Google's login. */
        /* */
        /* 3,350 of the 4,616 never-verified accounts in the base are gmail, so */
        /* this closes ~73% of the hole for free. See docs/email-verified-is-wrong.md. */
        /* */
        /* Deliberately NOT extended to yahoo / outlook / hotmail / icloud: there is */
        /* no OAuth provider for those on this site, so blocking them would leave */
        /* real people with no way to sign up at all. */
        if (provider !== 'google' && (emailDomain === 'gmail.com' || emailDomain === 'googlemail.com')) {
            console.log('🚫 Gmail on password signup, routed to Google:', normalizedEmail);
            return new Response(JSON.stringify({
                error: 'Gmail addresses sign in with the Google button — one click, no password to remember.',
                code: 'use_google_signin'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 3c. Other consumer mailboxes → business email required ───────────── */
        if (provider !== 'google' && CONSUMER_DOMAINS.has(emailDomain)) {
            console.log('🚫 Consumer domain blocked on signup:', emailDomain);
            return new Response(JSON.stringify({
                error: 'Please sign up with your work email address.',
                code: 'business_email_required'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 4b. Per-domain daily cap ─────────────────────────────────────────── */
        /* */
        /* The IP limiter above caps 3 per IP per 24h and the farm walked straight */
        /* through it on rotating proxies - 3,760 accounts in a single day. The */
        /* domain is the thing it could not rotate cheaply, because the addresses */
        /* have to keep resolving to somewhere it controls. */
        if (await domainOverCap(emailDomain, env)) {
            console.log('🚫 Domain over daily signup cap:', emailDomain);
            return new Response(JSON.stringify({
                error: 'Too many accounts have been created on this domain today. Contact us if your team needs more.',
                code: 'domain_signup_cap'
            }), {
                status: 429,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 4. IP rate limiting (3 accounts per IP per 24h) ──────────────────── */
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const ipKey = `ip_${ip}`;
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        if (!env.RATE_LIMITS) {
            console.warn('⚠️ RATE_LIMITS KV namespace not configured - rate limiting disabled');
        } else {
            const ipData = await env.RATE_LIMITS.get(ipKey);
            let ipAttempts = ipData ? JSON.parse(ipData) : { count: 0, firstAttempt: now };

            if (now - ipAttempts.firstAttempt > oneDay) {
                ipAttempts = { count: 0, firstAttempt: now };
            }

            if (ipAttempts.count >= ACCOUNTS_PER_IP_PER_DAY) {
                console.log('🚫 Rate limit exceeded for IP:', ip);
                const hoursLeft = Math.ceil((oneDay - (now - ipAttempts.firstAttempt)) / (60 * 60 * 1000));
                return new Response(JSON.stringify({
                    error: `Too many accounts created from this network.`,
                    retryAfter: hoursLeft
                }), {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': (hoursLeft * 3600).toString(),
                        ...corsHeaders
                    }
                });
            }

            console.log(`✅ IP ${ip} - Attempt ${ipAttempts.count + 1}/${ACCOUNTS_PER_IP_PER_DAY}`);
        }

        /* ── 4c. Email verification hold ──────────────────────────────────────── */
        /* */
        /* Last thing before the account is created, so nothing above can be */
        /* skipped by it and a refused signup never triggers a confirmation mail. */
        const isGoogle = (provider || 'email') === 'google';
        let grantedNow = startingCredits;
        let heldCredits = 0;

        if (VERIFY_HOLD && !isGoogle && startingCredits > VERIFY_CAP) {
            const mailed = await provisionVerification(normalizedEmail, env);
            if (mailed) {
                grantedNow = VERIFY_CAP;
                heldCredits = startingCredits - grantedNow;

                /* Stash what is owed so verify-email releases exactly the right */
                /* number later. Keyed by normalized email because the account row */
                /* does not exist yet - this worker only forwards to n8n. */
                if (env.RATE_LIMITS) {
                    try {
                        await env.RATE_LIMITS.put(`held_${normalizedEmail}`, String(heldCredits), {
                            expirationTtl: 60 * 60 * 24 * 90
                        });
                    } catch (e) {
                        /* Rather than strand someone's credits with no record of */
                        /* what they are owed, hand over the full grant. */
                        console.error('⚠️ held-credit stash failed, granting in full:', e);
                        grantedNow = startingCredits;
                        heldCredits = 0;
                    }
                } else {
                    console.error('⚠️ RATE_LIMITS not bound - cannot stash held credits, granting in full');
                    grantedNow = startingCredits;
                    heldCredits = 0;
                }
            }
        }

        /* With VERIFY_HOLD off we still want the address confirmed - it is what */
        /* keeps unverified people out of lifecycle email, which is the other half */
        /* of why verify-email was built. Only the credit cap is skipped. */
        if (!VERIFY_HOLD && !isGoogle) {
            await provisionVerification(normalizedEmail, env);
        }

        console.log('✉️ verification:', { isGoogle, verifyHold: VERIFY_HOLD, grantedNow, heldCredits });

        /* ── 5. Forward to n8n ────────────────────────────────────────────────── */
        const response = await fetch('https://scalelinkfinderai-production.up.railway.app/webhook/751f84b6-ee4b-4f80-a724-fa64d89580ff', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                normalizedEmail: normalizedEmail,
                password: password,
                provider: provider || 'email',
                type: type || 'signup',
                ref: ref || null,
                firstName: firstName || null,
                lastName: lastName || null,
                companyName: companyName || null,
                fbc: fbc || null,
                fbp: fbp || null,
                gclid: gclid || null,
                country: country || null,
                geoTier: geoTier,
                gift: giftCode,
                /* grantedNow, not startingCredits: an unconfirmed email/password */
                /* signup is funded to VERIFY_CAP and the rest is released by */
                /* verify-email when the link is clicked. n8n needs no change - it */
                /* keeps storing whatever number it is handed. */
                startingCredits: grantedNow,
                emailVerified: isGoogle,
                heldCredits: heldCredits
            })
        });

        const responseData = await response.text();
        console.log(`📡 n8n signup response: ${response.status}`);

        /* ── 6. Increment IP counter on success ───────────────────────────────── */
        if (response.ok && env.RATE_LIMITS) {
            try {
                const ipData = await env.RATE_LIMITS.get(ipKey);
                let ipAttempts = ipData ? JSON.parse(ipData) : { count: 0, firstAttempt: now };

                ipAttempts.count++;

                await env.RATE_LIMITS.put(ipKey, JSON.stringify(ipAttempts), {
                    expirationTtl: 86400
                });

                console.log(`✅ Signup successful. IP now at ${ipAttempts.count}/${ACCOUNTS_PER_IP_PER_DAY} attempts`);
                await bumpDomainCount(emailDomain, env);
            } catch (e) {
                console.error('⚠️ Failed to update rate limit (non-critical):', e);
            }
        }

        return new Response(responseData, {
            status: response.status,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

    } catch (error) {
        console.error('❌ Signup error:', error);
        return new Response(JSON.stringify({
            error: 'Signup failed',
            message: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
}
