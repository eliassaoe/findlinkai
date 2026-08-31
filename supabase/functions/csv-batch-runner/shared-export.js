// The export builder, ported from app.html.
//
// A batch can be enriched partly in the browser and partly here, and the two
// halves are appended to the same archive — so these functions must produce
// byte-identical output to the ones in app.html. tests/csv-export-parity.test.mjs
// runs both implementations over the same fixtures and fails on any difference.
// Change one, change the other.

export const OUTPUT_LABELS = {
    lead_full_name: { linkedin_url: 'LinkedIn Profile URL', email: 'Verified Email' },
    company_name: { website: 'Company Website', phone: 'Company Phone Number',
                    linkedin_url: 'Company LinkedIn URL', email: 'Company Email' },
    email: { linkedin_url: 'LinkedIn Profile URL' },
    company_domain: { employees: 'Company Employees List' },
    linkedin_company: { linkedin_info: 'LinkedIn Company Data', employee_count: 'Employee Count' },
    linkedin_profile: { linkedin_info: 'LinkedIn Profile Data', phone: 'Phone Number', email: 'Email Address' },
    linkedin_post: { reactions: 'Post Reactions' },
};

const at = (vals, i) =>
    (i !== undefined && i !== -1 && vals[i] !== undefined) ? String(vals[i]).trim() : '';

// Port of lfBuildCsvData(). The row order this produces IS the resume cursor,
// so it must match the browser's exactly.
export function buildCsvData(csvRows, m, inputType) {
    const out = [];
    for (let srcIndex = 0; srcIndex < csvRows.length; srcIndex++) {
        const vals = csvRows[srcIndex] || [];
        let nameVal = at(vals, m.name);
        if (!nameVal && (m.first !== undefined || m.last !== undefined)) {
            nameVal = [at(vals, m.first), at(vals, m.last)].filter(Boolean).join(' ');
        }
        if (!nameVal) continue;
        if (inputType === 'lead_full_name') {
            const flip = nameVal.match(/^\s*([^,]{1,60}?)\s*,\s*([^,]{1,60}?)\s*$/);
            if (flip) nameVal = flip[2] + ' ' + flip[1];
        }
        const companyVal = at(vals, m.company), locationVal = at(vals, m.location), jobTitleVal = at(vals, m.job_title);
        const inputData = inputType === 'lead_full_name'
            ? [nameVal, companyVal, locationVal, jobTitleVal].filter(Boolean).join(' ')
            : nameVal;
        const countRaw = at(vals, m.employee_count);
        out.push({
            srcIndex, inputData, name: nameVal, company: companyVal,
            location: locationVal, job_title: jobTitleVal,
            department: at(vals, m.department), seniority: at(vals, m.seniority),
            employee_count: countRaw ? (parseInt(countRaw, 10) || null) : null,
        });
    }
    return out;
}

export function enrichColumns(inputType, outputType) {
    if (outputType === 'employee_count') return ['Employee Count', 'Status'];
    if (inputType === 'linkedin_post' && outputType === 'reactions')
        return ['Reaction Name', 'Reaction Job Title', 'Reaction Profile Info', 'Reaction LinkedIn URL'];
    if (inputType === 'linkedin_profile' && outputType === 'linkedin_info')
        return ['Name', 'Headline', 'Current Title', 'Current Company', 'Location', 'Country', 'Industry',
                'Connections', 'Followers', 'Website', 'Email', 'Mobile', 'About', 'Education', 'Experience', 'Skills', 'Status'];
    if (inputType === 'linkedin_company' && outputType === 'linkedin_info')
        return ['Company Name', 'Industry', 'Employees', 'Followers', 'City', 'Country', 'Founded',
                'Website', 'Company Email', 'Company Phone', 'Description', 'Status'];
    if (outputType === 'employees')
        return ['Employee Name', 'Employee Job Title', 'Employee Seniority', 'Employee Headline', 'Employee Department',
                'Employee Industry', 'Employee Email', 'Employee Mobile', 'Employee Twitter', 'Employee City',
                'Employee State', 'Employee Country', 'Employee LinkedIn URL', 'Employee Company', 'Employee Company Website',
                'Employee Company Phone', 'Employee Company Size', 'Employee Company City', 'Employee Company State',
                'Employee Company Country', 'Employee Company LinkedIn URL'];
    const ol = (OUTPUT_LABELS[inputType] && OUTPUT_LABELS[inputType][outputType]) || 'Result';
    return inputType === 'email' ? [ol, 'Confidence', 'Status'] : [ol, 'Status'];
}

const lipEmpty = (v) => v === undefined || v === null || v === '' || v === 'Not specified' || v === 'Not found';

function currentExp(exp) {
    if (!Array.isArray(exp) || exp.length === 0) return null;
    return exp.find(e => e.jobStillWorking) || exp[0];
}
function formatEducation(edu) {
    if (!Array.isArray(edu) || edu.length === 0) return '';
    return edu.map(e => [e.school, e.degree, e.fieldOfStudy].filter(Boolean).join(' - ')).join(' | ');
}
function formatExperiences(exp) {
    if (!Array.isArray(exp) || exp.length === 0) return '';
    return exp.map(e => {
        const dates = [e.jobStartedOn, e.jobEndedOn || (e.jobStillWorking ? 'Present' : '')].filter(Boolean).join(' to ');
        return [e.title, e.companyName, dates].filter(Boolean).join(' @ ');
    }).join(' | ');
}
function formatSkills(skills) {
    if (!Array.isArray(skills) || skills.length === 0) return '';
    return skills.map(s => s.name || s).join(', ');
}
function founded(f) {
    if (lipEmpty(f)) return '';
    if (typeof f === 'object') {
        if (!f.year) return '';
        return f.month ? `${f.month}/${f.year}` : `${f.year}`;
    }
    return f;
}
function parseReactionTitle(title) {
    if (!title) return { name: 'Unknown', jobInfo: '' };
    const parts = title.split(' - ');
    return { name: parts[0].trim(), jobInfo: parts.slice(1).join(' - ').trim() };
}

export function enrichCells(row, inputType, outputType) {
    const width = enrichColumns(inputType, outputType).length;
    const blank = () => new Array(width).fill('');
    if (!row) return [blank()];

    const clean = (v) => (v === null || v === undefined || v === 'Not found' || v === 'Not specified' || v === 'Processing...') ? '' : String(v);
    const status = row.status === 'Processing' ? '' : (row.status || '');
    const d = row.rawData || {};

    if (outputType === 'employee_count') return [[clean(row.employeeCount), status]];

    if (inputType === 'linkedin_post' && outputType === 'reactions') {
        const rs = row.reactions || [];
        if (!rs.length) return [blank()];
        return rs.map(r => {
            const pr = parseReactionTitle(r.title);
            return [clean(pr.name), clean(pr.jobInfo), clean(r.snippet), clean(r.link)];
        });
    }

    if (inputType === 'linkedin_profile' && outputType === 'linkedin_info') {
        const cur = currentExp(d.experiences);
        return [[
            clean(d.name), clean(d.headline), clean((cur && cur.title) || d.jobTitle), clean(cur && cur.companyName),
            clean(d.location), clean(d.country), clean(d.industry), clean(d.connections), clean(d.followers),
            clean(d.website), clean(d.email), clean(d.mobileNumber), clean(d.about),
            clean(formatEducation(d.education)), clean(formatExperiences(d.experiences)), clean(formatSkills(d.skills)),
            status,
        ]];
    }

    if (inputType === 'linkedin_company' && outputType === 'linkedin_info') {
        const followers = d.followerCount ? Number(String(d.followerCount).replace(/,/g, '')).toLocaleString() : '';
        const empSize = (d.company_size !== null && d.company_size !== undefined && d.company_size !== '' && d.company_size !== 0) ? String(d.company_size) : '';
        return [[
            clean(d.name), clean(d.industry), empSize, followers, clean(d.city), clean(d.country),
            clean(founded(d.foundedOn)), clean(d.website), clean(d.company_email), clean(d.company_phone),
            clean(d.company_description), status,
        ]];
    }

    if (outputType === 'employees') {
        const emps = row.employees || [];
        if (!emps.length) return [blank()];
        const j = (v) => clean(Array.isArray(v) ? v.join('; ') : v);
        return emps.map(e => [
            j(e.name), j(e.jobTitle), j(e.seniority), j(e.headline), j(e.department), j(e.industry),
            j(e.email), j(e.mobileNumber), j(e.twitter), j(e.city), j(e.state), j(e.country), j(e.linkedinUrl),
            j(e.company), j(e.companyWebsite), j(e.companyPhone), j(e.companySize),
            j(e.companyCity), j(e.companyState), j(e.companyCountry), j(e.companyLinkedinUrl),
        ]);
    }

    const value = clean(row.result);
    return inputType === 'email'
        ? [[value, clean(row.confidence), status]]
        : [[value, status]];
}

const cell = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

// Original rows [fromSrc..toSrc] inclusive, each with its enrichment appended.
export function renderRange(
    fromSrc, toSrc, includeHeader,
    csvHeaders, csvRows,
    bySrc, inputType, outputType,
) {
    const cols = enrichColumns(inputType, outputType);
    const width = csvHeaders.length;
    const lines = [];
    if (includeHeader) lines.push([...csvHeaders, ...cols].map(cell).join(','));

    for (let src = Math.max(0, fromSrc); src <= toSrc && src < csvRows.length; src++) {
        const original = csvRows[src] || [];
        const padded = [];
        for (let i = 0; i < width; i++) padded.push(original[i] !== undefined ? original[i] : '');
        for (const cells of enrichCells(bySrc.get(src), inputType, outputType)) {
            lines.push([...padded, ...cells].map(cell).join(','));
        }
    }
    return lines.length ? lines.join('\n') + '\n' : '';
}
