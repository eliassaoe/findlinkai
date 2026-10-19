// The parts of the support agent that are pure logic, in plain JavaScript so
// tests/support-agent.test.mjs can import the very file the function runs.
//
// The CSV handling here is a port of app.html's, on purpose: a file queued from
// the chat goes to the same background runner as a file uploaded in the app,
// and the runner rebuilds the input list with buildCsvData() from the mapping
// stored on the batch. If this parsed or mapped a file differently from the
// app, the same CSV would enrich differently depending on where it was dropped.

import { buildCsvData } from '../csv-batch-runner/shared-export.js';

// app.html, `creditCosts` — the authoritative copy. Note company_name_to_email
// is 5, not 1. A credit is only spent on a row that comes back with a value.
export const CREDIT_COSTS = {
    company_name_to_website: 1, company_name_to_phone: 1, company_name_to_linkedin_url: 1,
    email_to_linkedin_url: 5, company_name_to_employees: 1, company_name_to_employee_count: 1,
    company_name_to_email: 5, linkedin_company_to_linkedin_info: 6, linkedin_company_to_employees: 1,
    linkedin_company_to_employee_count: 1, linkedin_profile_to_linkedin_info: 10,
    lead_full_name_to_linkedin_url: 1, linkedin_profile_to_email: 10, company_domain_to_employees: 1,
    linkedin_post_to_reactions: 1, linkedin_profile_to_phone: 50, lead_full_name_to_email: 7,
};

// app.html, `dataConfigurations` — the combinations the app offers in bulk.
export const ENRICHMENTS = {
    lead_full_name: { label: 'Lead Full Name + Company Name', outputs: { linkedin_url: 'LinkedIn Profile URL', email: 'Verified Email' } },
    company_name: { label: 'Company Name', outputs: { website: 'Company Website', phone: 'Company Phone Number', linkedin_url: 'Company LinkedIn URL', email: 'Company Email' } },
    email: { label: 'Email Address', outputs: { linkedin_url: 'LinkedIn Profile URL' } },
    company_domain: { label: 'Company Domain', outputs: { employees: 'Company Employees List' } },
    linkedin_company: { label: 'LinkedIn Company URL', outputs: { linkedin_info: 'LinkedIn Company Data', employee_count: 'Employee Count' } },
    linkedin_profile: { label: 'LinkedIn Profile URL', outputs: { linkedin_info: 'LinkedIn Profile Data', phone: 'Phone Number', email: 'Email Address' } },
    linkedin_post: { label: 'LinkedIn Post URL', outputs: { reactions: 'Post Reactions' } },
};

// Same ceiling as lfBuildCsvData().
export const MAX_ROWS = 10000;

// History and full export are subscriber-only in the app; everyone else gets
// this many rows, the same preview downloadResults(true) hands over.
export const EXPORT_PREVIEW_ROW_LIMIT = 5;

// Database plan_number -> plan key, as app.html's PLAN_NUMBER_KEYS. 1-3 monthly,
// 5-7 annual. "enterprise" is DISPLAYED as Scale.
const PLAN_NAMES = { 1: 'Starter', 2: 'Professional', 3: 'Scale', 5: 'Starter', 6: 'Professional', 7: 'Scale' };

export function batchLabel(inputType, outputType) {
    const c = ENRICHMENTS[inputType];
    if (!c) return inputType || 'Enrichment';
    return `${c.label} → ${c.outputs[outputType] || outputType}`;
}

export function isValidCombination(inputType, outputType) {
    return !!(ENRICHMENTS[inputType] && ENRICHMENTS[inputType].outputs[outputType]);
}

// ---------------------------------------------------------------- parsing

// app.html, LF_HEADER_SYNONYMS.
const HEADER_SYNONYMS = {
    full_name: ['lead_full_name', 'full name', 'fullname', 'name', 'lead name', 'contact name', 'lead', 'contact', 'person', 'person name', 'prospect', 'prospect name', 'display name', 'nom complet', 'nom et prenom', 'candidate', 'attendee', 'full_name'],
    first_name: ['first name', 'firstname', 'first', 'given name', 'givenname', 'forename', 'fname', 'prenom', 'prénom', 'nombre', 'vorname', 'nome'],
    last_name: ['last name', 'lastname', 'last', 'surname', 'family name', 'familyname', 'lname', 'nom', 'nom de famille', 'apellido', 'nachname', 'cognome', 'second name'],
    company: ['company', 'company name', 'companyname', 'organization', 'organisation', 'org', 'employer', 'employer name', 'firm', 'business', 'account', 'account name', 'current company', 'company / account', 'workplace', 'entreprise', 'société', 'societe', 'compagnie', 'empresa', 'unternehmen', 'azienda', 'bedrijf'],
    company_domain: ['company domain', 'domain', 'website', 'url', 'web', 'site', 'website url', 'company website', 'web site', 'homepage', 'site web', 'domaine', 'company url'],
    linkedin_company: ['linkedin company', 'company linkedin url', 'company linkedin', 'linkedin company url', 'company_linkedin', 'company url linkedin'],
    linkedin_profile: ['linkedin profile', 'linkedin profile url', 'profile url', 'linkedin url', 'linkedin', 'profile', 'li url', 'linkedin link', 'person linkedin url', 'profile link', 'lien linkedin', 'linkedin_person'],
    linkedin_post: ['linkedin post', 'post url', 'linkedin post url', 'post', 'post link', 'activity url', 'linkedin_post_url'],
    email: ['email', 'email address', 'emailaddress', 'e-mail', 'mail', 'work email', 'business email', 'professional email', 'primary email', 'email1', 'company email', 'courriel', 'correo', 'mail address'],
    location: ['location', 'city', 'loc', 'country', 'region', 'ville', 'pays', 'based in', 'geo', 'area', 'location name', 'town', 'state'],
    job_title: ['job title', 'jobtitle', 'title', 'position', 'role', 'headline', 'poste', 'fonction', 'designation', 'job', 'job role'],
    department: ['department', 'dept', 'team', 'division', 'service'],
    seniority: ['seniority', 'level', 'seniority level', 'niveau'],
    employee_count: ['employee count', 'count', 'limit', 'employees', 'nb employes', 'headcount', 'max results'],
};
const PRIMARY_SYNONYMS = {
    lead_full_name: 'full_name', company_name: 'company', email: 'email',
    company_domain: 'company_domain', linkedin_company: 'linkedin_company',
    linkedin_profile: 'linkedin_profile', linkedin_post: 'linkedin_post',
};

// What a value in the primary column has to look like, for the input types
// where a header alone is a weak signal. "LinkedIn URL" is a profile column in
// one CRM and a company column in the next, and only the values say which.
const VALUE_PATTERNS = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    linkedin_profile: /linkedin\.com\/(in|pub)\//i,
    linkedin_company: /linkedin\.com\/(company|school|showcase)\//i,
    linkedin_post: /linkedin\.com\/(posts|feed\/update)\//i,
    // A LinkedIn URL is shaped like a domain too, and is never one to enrich.
    company_domain: /^(?!.*linkedin\.com)(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i,
};

const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/^﻿/, '').replace(/[\s_\-.]/g, '').trim();

function score(header, key) {
    const h = norm(header);
    if (!h) return 0;
    let best = 0;
    for (const cand of HEADER_SYNONYMS[key] || []) {
        const n = norm(cand);
        if (h === n) return 3;
        if (n.length >= 5 && (h.includes(n) || n.includes(h))) best = Math.max(best, 1);
    }
    return best;
}

function find(headers, key, exclude) {
    const used = new Set(exclude || []);
    let bestIdx = -1, bestScore = 0;
    headers.forEach((h, i) => {
        if (used.has(i)) return;
        const s = score(h, key);
        if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    return bestScore > 0 ? bestIdx : -1;
}

function detectDelim(line) {
    const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    let q = false;
    for (const ch of line) {
        if (ch === '"') q = !q;
        else if (!q && ch in counts) counts[ch]++;
    }
    return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ',');
}

function splitLine(line, delim) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === delim) { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
}

// Port of parseCSV() in app.html: sniffs the delimiter, skips title rows above
// the real header, drops blank lines. Returns { headers, rows } or { error }.
export function parseCsv(csvText) {
    const text = String(csvText || '').replace(/^﻿/, '');
    const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
    if (lines.length < 2) return { error: 'That file has a header but no data rows.' };
    let hIdx = 0;
    for (let i = 0; i < Math.min(lines.length - 1, 5); i++) {
        const d = detectDelim(lines[i]);
        const a = splitLine(lines[i], d).length, b = splitLine(lines[i + 1], d).length;
        if (a > 1 && a === b) { hIdx = i; break; }
    }
    const delim = detectDelim(lines[hIdx]);
    const headers = splitLine(lines[hIdx], delim).map((h) => h.replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = hIdx + 1; i < lines.length; i++) {
        const vals = splitLine(lines[i], delim);
        if (vals.some((v) => v !== '')) rows.push(vals);
    }
    if (!rows.length) return { error: 'No data rows found in that file.' };
    return { headers, rows };
}

// ---------------------------------------------------------------- mapping

function columnMatchRate(rows, idx, pattern) {
    let seen = 0, hit = 0;
    for (const r of rows) {
        const v = r[idx] !== undefined ? String(r[idx]).trim() : '';
        if (!v) continue;
        seen++;
        if (pattern.test(v)) hit++;
        if (seen >= 200) break;
    }
    return seen ? hit / seen : 0;
}

// The column whose values look most like the pattern, if most of them do.
function findByValues(rows, width, pattern, exclude) {
    const used = new Set(exclude || []);
    let bestIdx = -1, bestRate = 0;
    for (let i = 0; i < width; i++) {
        if (used.has(i)) continue;
        const rate = columnMatchRate(rows, i, pattern);
        if (rate > bestRate) { bestRate = rate; bestIdx = i; }
    }
    return bestRate >= 0.6 ? bestIdx : -1;
}

// The mapping app.html's parseCSV() would build for this input type, with one
// addition: for URL and email inputs the values must agree with the header,
// and a column is found by its values when no header names it.
export function detectMapping(headers, rows, inputType) {
    const H = headers;
    const m = {};
    if (inputType === 'lead_full_name') {
        let fullIdx = -1, fullScore = 0;
        H.forEach((h, i) => { const s = score(h, 'full_name'); if (s >= 2 && s > fullScore) { fullScore = s; fullIdx = i; } });
        const firstIdx = find(H, 'first_name'), lastIdx = find(H, 'last_name');
        if (firstIdx !== -1 && lastIdx !== -1 && firstIdx !== lastIdx) { m.first = firstIdx; m.last = lastIdx; }
        else if (fullIdx !== -1) m.name = fullIdx;
        else { const loose = find(H, 'full_name'); if (loose !== -1) m.name = loose; }
        const taken = [m.name, m.first, m.last].filter((i) => i !== undefined && i !== -1);
        m.company = find(H, 'company', taken);
        m.location = find(H, 'location', taken.concat([m.company]));
        m.job_title = find(H, 'job_title', taken.concat([m.company, m.location]));
    } else {
        m.name = find(H, PRIMARY_SYNONYMS[inputType] || 'full_name');
        const pattern = VALUE_PATTERNS[inputType];
        if (pattern) {
            if (m.name !== -1 && columnMatchRate(rows, m.name, pattern) < 0.3) m.name = -1;
            if (m.name === -1) m.name = findByValues(rows, H.length, pattern);
        }
    }
    m.department = find(H, 'department');
    m.seniority = find(H, 'seniority');
    m.employee_count = find(H, 'employee_count');
    return m;
}

function companyRequired(inputType, outputType) {
    return inputType === 'lead_full_name' && (outputType === 'linkedin_url' || outputType === 'email');
}

export function mappingComplete(m, inputType, outputType) {
    const has = (i) => i !== undefined && i !== -1 && i !== null;
    const hasName = has(m.name) || (has(m.first) && has(m.last));
    if (!hasName) return false;
    if (companyRequired(inputType, outputType) && !has(m.company)) return false;
    return true;
}

// Applies column overrides the user named ("use the Website column") on top of
// the detected mapping. Names match headers case- and punctuation-insensitively.
export function applyOverrides(headers, mapping, overrides) {
    const m = Object.assign({}, mapping);
    const unknown = [];
    for (const [field, headerName] of Object.entries(overrides || {})) {
        if (!['name', 'first', 'last', 'company', 'location', 'job_title', 'department', 'seniority', 'employee_count'].includes(field)) continue;
        if (headerName === null || headerName === '') { m[field] = -1; continue; }
        const idx = headers.findIndex((h) => norm(h) === norm(headerName));
        if (idx === -1) { unknown.push(headerName); continue; }
        m[field] = idx;
        if (field === 'name') { delete m.first; delete m.last; }
        if (field === 'first' || field === 'last') delete m.name;
    }
    return { mapping: m, unknown };
}

// Mapping indexes -> header names, for showing the user what will be read.
export function describeMapping(headers, m) {
    const out = {};
    for (const [k, v] of Object.entries(m)) {
        if (v !== undefined && v !== -1 && v !== null && headers[v] !== undefined) out[k] = headers[v];
    }
    return out;
}

// One concrete enrichment plan for a file: what is read, how many rows can run,
// and the most it can cost.
export function planEnrichment(headers, rows, inputType, outputType, overrides) {
    if (!isValidCombination(inputType, outputType)) {
        return { ok: false, error: `${inputType} -> ${outputType} is not an enrichment LinkFinder AI offers.` };
    }
    const detected = detectMapping(headers, rows, inputType);
    const { mapping, unknown } = applyOverrides(headers, detected, overrides);
    if (unknown.length) {
        return { ok: false, error: `No column named ${unknown.map((u) => `"${u}"`).join(', ')}. Columns are: ${headers.join(', ')}.` };
    }
    if (!mappingComplete(mapping, inputType, outputType)) {
        const need = companyRequired(inputType, outputType)
            ? 'a name column (or first + last name) AND a company column'
            : `a column of ${ENRICHMENTS[inputType].label} values`;
        return { ok: false, error: `This needs ${need}, and none was found. Columns are: ${headers.join(', ')}.`, mapping: describeMapping(headers, mapping) };
    }
    const data = buildCsvData(rows, mapping, inputType);
    if (!data.length) return { ok: false, error: 'Those columns are empty on every row.' };
    if (data.length > MAX_ROWS) return { ok: false, error: `Too many entries (${data.length}). The maximum is ${MAX_ROWS} per file.` };
    const costPerRow = CREDIT_COSTS[`${inputType}_to_${outputType}`] ?? 1;
    const perItem = outputType === 'employees' || outputType === 'reactions';
    return {
        ok: true,
        input_type: inputType,
        output_type: outputType,
        label: batchLabel(inputType, outputType),
        mapping,
        columns_used: describeMapping(headers, mapping),
        file_rows: rows.length,
        enrichable_rows: data.length,
        skipped_rows: rows.length - data.length,
        credits_per_found_row: costPerRow,
        // Rows that come back empty cost nothing, so this is a ceiling. Employee
        // and reaction lists bill per result returned, so they have none.
        max_credits: perItem ? null : data.length * costPerRow,
        billing_note: perItem
            ? `Billed ${costPerRow} credit per ${outputType === 'employees' ? 'employee' : 'reaction'} returned, so the total depends on how many come back.`
            : 'Only rows that come back with a value are charged.',
        sample_inputs: data.slice(0, 3).map((d) => d.inputData),
    };
}

// Every enrichment this file could feed, best candidates first.
export function analyzeFile(headers, rows) {
    const options = [];
    for (const [inputType, cfg] of Object.entries(ENRICHMENTS)) {
        for (const outputType of Object.keys(cfg.outputs)) {
            const p = planEnrichment(headers, rows, inputType, outputType);
            if (p.ok) options.push(p);
        }
    }
    // A file is usually built around one kind of value. Prefer the input type
    // whose primary column covers the most rows.
    options.sort((a, b) => b.enrichable_rows - a.enrichable_rows);
    return {
        file_rows: rows.length,
        columns: headers,
        sample_rows: rows.slice(0, 3).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']))),
        options: options.map((o) => ({
            input_type: o.input_type, output_type: o.output_type, label: o.label,
            columns_used: o.columns_used, enrichable_rows: o.enrichable_rows, skipped_rows: o.skipped_rows,
            credits_per_found_row: o.credits_per_found_row, max_credits: o.max_credits, billing_note: o.billing_note,
        })),
    };
}

// ---------------------------------------------------------------- account

export function describePlan(user) {
    const subscribed = !!user.subscription_id;
    const planNumber = user.plan_type;
    return {
        subscribed,
        plan: subscribed ? (PLAN_NAMES[planNumber] || 'Subscription') : (user.ltd_monthly_credits ? 'Lifetime deal' : (user.is_unlimited ? 'Credit pack (no subscription)' : 'Free')),
        billing: subscribed && planNumber ? (planNumber >= 5 ? 'annual' : 'monthly') : null,
        // is_unlimited is set for pack buyers too, so it never means subscribed.
        has_bought_credits: !!user.is_unlimited,
        lifetime_deal_monthly_credits: user.ltd_monthly_credits || null,
    };
}

// ---------------------------------------------------------------- history

// The one-line answer inside an enrichment_history.result, whatever its shape.
export function summarizeResult(result, max = 240) {
    let r = result;
    if (typeof r === 'string') { try { r = JSON.parse(r); } catch { /* plain text */ } }
    if (r === null || r === undefined) return '';
    if (typeof r !== 'object') return String(r).slice(0, max);
    if (Array.isArray(r)) return `${r.length} results`;
    if (typeof r.result === 'string') {
        if (r.result.startsWith('{')) { try { return summarizeResult(JSON.parse(r.result), max); } catch { /* fall through */ } }
        return r.result.slice(0, max);
    }
    if (Array.isArray(r.result)) return `${r.result.length} results`;
    if (Array.isArray(r.employees)) return `${r.employees.length} employees`;
    const parts = ['name', 'jobTitle', 'headline', 'company', 'companyName', 'industry', 'website', 'email', 'mobileNumber', 'company_size', 'city', 'country']
        .filter((k) => r[k] !== undefined && r[k] !== null && r[k] !== '' && typeof r[k] !== 'object')
        .map((k) => `${k}: ${r[k]}`);
    return (parts.length ? parts.join(' · ') : JSON.stringify(r)).slice(0, max);
}

// A lookup "found" something when its summary is a value, not a blank.
export function isFound(result) {
    const s = summarizeResult(result).trim().toLowerCase();
    return !!s && s !== 'not found' && s !== '0 results' && s !== '0 employees' && s !== '{"result":""}';
}

const cell = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

// Single lookups from History as a CSV: one line per lookup.
export function historyToCsv(rows) {
    const lines = [['Date', 'Enrichment', 'Input', 'Result', 'Credits', 'Source'].map(cell).join(',')];
    for (const r of rows) {
        lines.push([r.timestamp, r.type, r.input, summarizeResult(r.result, 2000), r.credits_used, r.source].map(cell).join(','));
    }
    return lines.join('\n') + '\n';
}

// Header plus the first n data lines of an archived export. result_csv never
// has a newline inside a cell (renderRange flattens them), so lines are rows.
export function csvHead(csv, n) {
    const lines = String(csv || '').split('\n').filter((l) => l !== '');
    return lines.slice(0, n + 1).join('\n') + (lines.length ? '\n' : '');
}
