// name -> LinkedIn: the app sends "name · company · location · job title" so n8n's
// LinkedIn rescue can filter by company page and location (workers/n8n-linkedin-rescue/README.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

test('lfLiNameInput keeps four slots, empty ones included', () => {
  const a = app.indexOf('function lfLiNameInput'), b = app.indexOf('function lfSearchCompany');
  const f = new Function(app.slice(a, b) + '\nreturn lfLiNameInput;')();
  assert.equal(f('Satya Nadella', 'Microsoft', 'Redmond, WA', 'CEO'), 'Satya Nadella · Microsoft · Redmond, WA · CEO');
  assert.equal(f('Jane Roe', 'Acme', '', ''), 'Jane Roe · Acme ·  · ');
  assert.equal(f('A · B', 'C', '', ''), 'A B · C ·  · ');
});

test('single and bulk name -> LinkedIn both use the slots', () => {
  assert.ok(app.includes('effectiveInputValue = lfLiNameInput(inputValue, lfSearchCompany(leadCompany), leadLocation, leadJobTitle);'));
  assert.ok(app.includes("lfLiNameInput(row.name, row.company, row.location, row.job_title) : row.inputData"));
});
