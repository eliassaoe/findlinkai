import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, toCsv } from '../src/csv.mjs';

test('a comma in a company name does not become a new column', () => {
    const csv = toCsv([{ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@tesla.com', company: 'Tesla, Inc.', score: 6, sources: ['post', 'list'] }]);
    const [header, row] = csv.trim().split('\n');
    assert.equal(header, COLUMNS.join(','));
    assert.ok(row.includes('"Tesla, Inc."'));
    assert.ok(row.endsWith('6,post + list'));
});

test('a quote inside a value is doubled, not dropped', () => {
    const csv = toCsv([{ firstName: 'Ada', jobTitle: 'VP of "Growth"' }]);
    assert.ok(csv.includes('"VP of ""Growth"""'));
});

test('missing fields are empty cells, so the column count never shifts', () => {
    const csv = toCsv([{ email: 'x@y.com' }]);
    const row = csv.trim().split('\n')[1];
    assert.equal(row.split(',').length, COLUMNS.length);
});
