/**
 * CSV for the leads a run produced.
 *
 * The column order matches what the outreach tools and the app's own exports use, so a
 * file from here can be uploaded straight into a campaign without remapping.
 */
export const COLUMNS = [
    'first_name', 'last_name', 'email', 'job_title', 'company_name', 'website',
    'linkedin_url', 'location', 'intent_score', 'signals',
];

const escape = (value) => {
    const text = value === undefined || value === null ? '' : String(value);
    // Quote anything a spreadsheet would otherwise split, and double any quote inside.
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function leadToRow(lead) {
    return {
        first_name: lead.firstName,
        last_name: lead.lastName,
        email: lead.email,
        job_title: lead.jobTitle,
        company_name: lead.company,
        website: lead.companyWebsite,
        linkedin_url: lead.linkedinUrl,
        location: lead.location,
        intent_score: lead.score,
        signals: (lead.sources ?? []).join(' + '),
    };
}

export function toCsv(leads, columns = COLUMNS) {
    const rows = leads.map(leadToRow);
    const lines = [columns.join(',')];
    for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(','));
    return `${lines.join('\n')}\n`;
}
