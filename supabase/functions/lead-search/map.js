// Turns one harvestapi/linkedin-profile-search item into the row the app shows
// and exports. Plain JavaScript so tests/lead-search.test.mjs imports this file.

export const CREDITS_WITH_EMAIL = 15;   // same as linkedin_profile_to_profile_email
export const CREDITS_PROFILE_ONLY = 5;  // a lead whose email we did not find
export const MAX_ITEMS = 100;

const s = (v) => (v == null ? '' : String(v).trim());

export function pickEmails(emails) {
    const list = Array.isArray(emails) ? emails.filter((e) => e && e.email) : [];
    const valid = list.filter((e) => e.status === 'valid');
    const work = valid.find((e) => !e.free && !e.catchAllDomain)
        || valid.find((e) => !e.free)
        || list.find((e) => !e.free && e.status === 'risky');
    const personal = valid.find((e) => e.free);
    return {
        email: work ? s(work.email) : '',
        email_status: work ? (work.status === 'valid' && !work.catchAllDomain ? 'valid' : 'risky') : '',
        personal_email: personal ? s(personal.email) : '',
    };
}

function fmtDuration(x) {
    return s(x && (x.duration || ''));
}

export function mapLead(it) {
    if (!it || typeof it !== 'object') return null;
    const cur = Array.isArray(it.currentPosition) && it.currentPosition[0] ? it.currentPosition[0] : {};
    const exp = Array.isArray(it.experience) ? it.experience : [];
    const edu = Array.isArray(it.education) ? it.education : [];
    const first = s(it.firstName), last = s(it.lastName);
    const linkedin = s(it.linkedinUrl);
    if (!linkedin && !first && !last) return null;
    const company = cur.company || {};
    const site = Array.isArray(it.companyWebsites) && it.companyWebsites[0]
        ? s(it.companyWebsites[0].domain || it.companyWebsites[0].url)
        : s(company.website);
    const e = pickEmails(it.emails);
    return {
        full_name: [first, last].filter(Boolean).join(' '),
        first_name: first,
        last_name: last,
        headline: s(it.headline).replace(/\s+/g, ' '),
        job_title: s(cur.position || (exp[0] && exp[0].position)),
        company: s(cur.companyName || (exp[0] && exp[0].companyName)),
        company_linkedin: s(cur.companyLinkedinUrl),
        company_website: site,
        location: s(it.location && (it.location.linkedinText || (it.location.parsed && it.location.parsed.text))),
        linkedin_url: linkedin,
        photo: s(it.photo || (it.profilePicture && it.profilePicture.url)),
        email: e.email,
        email_status: e.email_status,
        personal_email: e.personal_email,
        open_to_work: !!it.openToWork,
        experience: exp.slice(0, 3).map((x) => [s(x.position), s(x.companyName)].filter(Boolean).join(' @ ')
            + (fmtDuration(x) ? ` (${fmtDuration(x)})` : '')).filter(Boolean).join(' | '),
        education: edu.slice(0, 2).map((x) => [s(x.schoolName), s(x.degree)].filter(Boolean).join(', ')).filter(Boolean).join(' | '),
        skills: (Array.isArray(it.topSkills) ? it.topSkills.join(', ') : s(it.topSkills)).slice(0, 300),
        // Structured copies for pages that draw the profile (free list page).
        exp_list: exp.slice(0, 6).map((x) => ({
            title: s(x.position), company: s(x.companyName),
            start: s(x.startDate && x.startDate.text), end: s(x.endDate && x.endDate.text),
        })),
        edu_list: edu.slice(0, 4).map((x) => ({
            school: s(x.schoolName), degree: s(x.degree), field: s(x.fieldOfStudy),
            start: s(x.startDate && x.startDate.text), end: s(x.endDate && x.endDate.text),
        })),
    };
}

export function hasEmail(row) {
    return !!(row && (row.email || row.personal_email));
}

export function priceFor(rows) {
    return rows.reduce((a, r) => a + (hasEmail(r) ? CREDITS_WITH_EMAIL : CREDITS_PROFILE_ONLY), 0);
}

const SENIORITY = new Set(['100', '110', '120', '130', '200', '210', '220', '300', '310', '320']);
const HEADCOUNT = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
const list = (v, max = 10) => (Array.isArray(v) ? v : s(v).split(/[,;\n]/))
    .map((x) => s(x)).filter(Boolean).slice(0, max).map((x) => x.slice(0, 120));

// Criteria from the page -> the actor's input. Returns {error} on bad input.
export function buildInput(c, withEmails = true, max = MAX_ITEMS) {
    const query = s(c && c.query).slice(0, 200);
    const titles = list(c && c.titles);
    const locations = list(c && c.locations, 5);
    if (!query && !titles.length) return { error: 'Enter a search or at least one job title.' };
    const n = Math.max(1, Math.min(max, Math.floor(Number(c && c.maxItems) || 25)));
    const input = { profileScraperMode: withEmails ? 'Full + email search' : 'Full', maxItems: n };
    if (query) input.searchQuery = query;
    if (titles.length) input.currentJobTitles = titles;
    if (locations.length) input.locations = locations;
    const sen = list(c && c.seniority).filter((x) => SENIORITY.has(x));
    if (sen.length) input.seniorityLevelIds = sen;
    const hc = list(c && c.headcount).filter((x) => HEADCOUNT.has(x));
    if (hc.length) input.companyHeadcount = hc;
    const companies = list(c && c.companies).filter((x) => /linkedin\.com\/company\//i.test(x));
    if (companies.length) input.currentCompanies = companies;
    return { input, n };
}

// Three kinds of search (10 Nov 2026, docs/lead-search.md):
//   leads   - /lead-search page: full profile + email, 15 / 5 credits a lead
//   urls    - app input "no URLs? search LinkedIn": full profile, no email,
//             1 credit per profile found; the app then runs its usual lookup
//   preview - /liste-gratuite "pas de liste ?": anonymous, free, max 50,
//             full profile, no email (the page finds the emails itself)
export const KINDS = {
    leads: { withEmails: true, reservePer: CREDITS_WITH_EMAIL, max: MAX_ITEMS },
    urls: { withEmails: false, reservePer: 1, max: 200 },
    preview: { withEmails: false, reservePer: 0, max: 50 },
};
export function chargeFor(kind, rows) {
    if (kind === 'urls') return rows.length;
    if (kind === 'preview') return 0;
    return priceFor(rows);
}

// What Apify may bill for one run, used as its spending cap.
export function maxUsdFor(n) {
    return Math.min(3, Math.round((0.1 * Math.ceil(n / 25) + 0.011 * n + 0.1) * 100) / 100);
}
