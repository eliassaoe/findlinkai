import { z } from 'zod';
import { createAction } from 'nango';
import { callLinkFinderAI, LinkFinderError } from '../linkfinder-client.js';

// Scalar-output combinations only (matches app.html's `${inputType}_to_${outputType}`
// convention — see generateCombinationType() in app.html). Combos that return an array
// (company_domain -> employees, linkedin_post -> reactions) are deliberately excluded:
// this action writes exactly one result into exactly one cell per row.
const InputType = z.enum(['lead_full_name', 'company_name', 'email', 'linkedin_company', 'linkedin_profile']);
const OutputType = z.enum(['linkedin_url', 'email', 'phone', 'website', 'linkedin_info', 'employee_count']);

const InputSchema = z.object({
    spreadsheetId: z.string().describe('The Google Sheet ID — the long ID segment in the sheet URL: docs.google.com/spreadsheets/d/<THIS>/edit'),
    sheetName: z.string().default('Sheet1').describe('Tab name within the spreadsheet to read/write.'),
    inputColumn: z.string().describe('Header name (row 1) of the column holding the value to look up, e.g. "LinkedIn URL".'),
    inputType: InputType.describe('What kind of value inputColumn holds.'),
    outputType: OutputType.describe('What LinkFinder AI should return.'),
    outputColumn: z.string().default('LinkFinder Result').describe('Header name to write the result into. Created as a new column if it does not already exist.'),
    statusColumn: z.string().default('LinkFinder Status').describe('Header name marking a row as processed (Done / Not found / Error: ...), so re-runs skip it. Created if missing.'),
    apiKey: z.string().describe('Your LinkFinder AI API key (dashboard -> Settings -> API Key).'),
    maxRowsPerRun: z
        .number()
        .int()
        .min(1)
        .max(40)
        .default(15)
        .describe(
            'How many unprocessed rows to enrich in this run. Kept modest by default and processed sequentially — each lookup can take up to ~12s, and Nango actions run under a bounded execution window, so a very large batch risks timing out mid-run. Left-over rows are simply picked up on the next scheduled run.'
        )
});

const OutputSchema = z.object({
    rowsScanned: z.number(),
    rowsProcessed: z.number(),
    rowsSkippedAlreadyDone: z.number(),
    rowsSkippedEmptyInput: z.number(),
    errors: z.array(z.object({ row: z.number(), message: z.string() }))
});

type CellWrite = { row: number; col: number; value: string };

function columnLetter(index0: number): string {
    let n = index0 + 1;
    let letters = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        letters = String.fromCharCode(65 + rem) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
}

/** Finds a header's column index, or returns the next free index and queues a header write if it doesn't exist yet. */
function resolveColumn(headers: string[], name: string, headerWrites: CellWrite[]): number {
    const existing = headers.findIndex((h) => h?.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing !== -1) return existing;

    const newIndex = headers.length;
    headers.push(name);
    headerWrites.push({ row: 1, col: newIndex, value: name });
    return newIndex;
}

const action = createAction({
    description:
        'Scans a Google Sheet for rows with a value in inputColumn and no value yet in statusColumn, enriches up to maxRowsPerRun of them via LinkFinder AI, and writes the result + a status marker back onto each row. Designed to be called repeatedly on a schedule (e.g. every 15-30 min) so a sheet keeps enriching itself as rows are added.',
    version: '1.0.0',

    input: InputSchema,
    output: OutputSchema,
    // UNCONFIRMED: exact Nango `google-sheet` provider scope name(s) — verify against
    // https://app.nango.dev/dev/integrations/google-sheet/settings once the integration
    // is enabled; Sheets read/write typically needs the
    // https://www.googleapis.com/auth/spreadsheets scope.
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        // UNCONFIRMED: exact proxy endpoint path Nango exposes for the google-sheet
        // provider. This assumes Nango passes Google Sheets API v4 paths through
        // verbatim (base URL https://sheets.googleapis.com) the way its HubSpot
        // provider does for HubSpot's own API — the pattern every other action in
        // this repo relies on. Verify with `npx nango dryrun enrich-new-rows ...`
        // against a real connection before trusting this in production.
        const range = encodeURIComponent(input.sheetName);
        const sheet = await nango.get({
            endpoint: `/v4/spreadsheets/${input.spreadsheetId}/values/${range}`,
            retries: 3
        });

        const values: string[][] = sheet.data?.values ?? [];
        if (values.length === 0) {
            throw new nango.ActionError({ type: 'empty_sheet', message: `Sheet "${input.sheetName}" has no data.` });
        }

        const headers = [...(values[0] ?? [])];
        const headerWrites: CellWrite[] = [];

        const inputColIndex = headers.findIndex((h) => h?.trim().toLowerCase() === input.inputColumn.trim().toLowerCase());
        if (inputColIndex === -1) {
            throw new nango.ActionError({
                type: 'input_column_not_found',
                message: `Column "${input.inputColumn}" not found in row 1 of "${input.sheetName}". Existing headers: ${headers.join(', ') || '(none)'}`
            });
        }

        const outputColIndex = resolveColumn(headers, input.outputColumn, headerWrites);
        const statusColIndex = resolveColumn(headers, input.statusColumn, headerWrites);

        const type = `${input.inputType}_to_${input.outputType}`;
        const dataWrites: CellWrite[] = [];
        const errors: { row: number; message: string }[] = [];

        let rowsProcessed = 0;
        let rowsSkippedAlreadyDone = 0;
        let rowsSkippedEmptyInput = 0;

        const dataRows = values.slice(1);

        for (let i = 0; i < dataRows.length && rowsProcessed < input.maxRowsPerRun; i++) {
            const row = dataRows[i];
            const sheetRow = i + 2; // row 1 is headers, data starts at sheet row 2
            const inputValue = row[inputColIndex]?.trim();
            const statusValue = row[statusColIndex]?.trim();

            if (statusValue) {
                rowsSkippedAlreadyDone++;
                continue;
            }
            if (!inputValue) {
                rowsSkippedEmptyInput++;
                continue;
            }

            try {
                // 12s cap per lookup (below linkedin_profile_to_linkedin_info's usual
                // resolve time margin) to keep total run time bounded across up to
                // maxRowsPerRun sequential calls — see the field description above.
                const outcome = await callLinkFinderAI(input.apiKey, type, inputValue, 12000);

                if (!outcome.resolved) {
                    dataWrites.push({ row: sheetRow, col: statusColIndex, value: 'Still processing — will retry next run' });
                } else if (outcome.result == null) {
                    dataWrites.push({ row: sheetRow, col: outputColIndex, value: '' });
                    dataWrites.push({ row: sheetRow, col: statusColIndex, value: 'Not found' });
                } else {
                    dataWrites.push({ row: sheetRow, col: outputColIndex, value: String(outcome.result) });
                    dataWrites.push({ row: sheetRow, col: statusColIndex, value: 'Done' });
                }
                rowsProcessed++;
            } catch (err) {
                const message = err instanceof LinkFinderError ? err.message : String(err);
                dataWrites.push({ row: sheetRow, col: statusColIndex, value: `Error: ${message}` });
                errors.push({ row: sheetRow, message });
                rowsProcessed++;
            }
        }

        const allWrites = [...headerWrites, ...dataWrites];
        if (allWrites.length > 0) {
            await nango.post({
                endpoint: `/v4/spreadsheets/${input.spreadsheetId}/values:batchUpdate`,
                data: {
                    valueInputOption: 'RAW',
                    data: allWrites.map((w) => ({
                        range: `${input.sheetName}!${columnLetter(w.col)}${w.row}`,
                        values: [[w.value]]
                    }))
                },
                retries: 3
            });
        }

        await nango.log(
            `enrich-new-rows: scanned ${dataRows.length} rows, processed ${rowsProcessed}, skipped ${rowsSkippedAlreadyDone} already-done + ${rowsSkippedEmptyInput} empty-input, ${errors.length} errors.`
        );

        return {
            rowsScanned: dataRows.length,
            rowsProcessed,
            rowsSkippedAlreadyDone,
            rowsSkippedEmptyInput,
            errors
        };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
