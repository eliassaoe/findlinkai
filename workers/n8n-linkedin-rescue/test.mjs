import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LI_TOP10, LI_RETRY, LI_LINKEDIN, CO_LINKEDIN } from './build.mjs';

// A tiny n8n Code-node runtime: $('Node').first().json and $input.all()/first().
function run(code, input, nodes = {}) {
  const $ = name => ({ first: () => ({ json: nodes[name] }) });
  const $input = { all: () => input.map(json => ({ json })), first: () => ({ json: input[0] }) };
  return new Function('$', '$input', code)($, $input)[0].json;
}
const wh = s => ({ Webhook1: { body: { input_data: s } } });

test('top 10: finds the right profile at position 3, with the company in the title', () => {
  const out = run(LI_TOP10, [{ organic: [
    { title: 'Alicia Carrasco - Primary Care | LinkedIn', link: 'https://www.linkedin.com/in/a1' },
    { title: 'Turning Point Brands | LinkedIn', link: 'https://www.linkedin.com/company/tpb' },
    { title: 'Alicia Carrasco - SVP People - Turning Point Brands | LinkedIn', link: 'https://www.linkedin.com/in/alicia-carrasco?trk=x' }
  ] }], wh('Alicia Carrasco Turning Point Brands, Inc.'));
  assert.equal(out.found, true);
  assert.equal(out.organic[0].link, 'https://www.linkedin.com/in/alicia-carrasco');
});

test('top 10: a same-name stranger without the company is refused, and retries are planned', () => {
  const out = run(LI_TOP10, [{ organic: [{ title: 'Alicia Carrasco - Primary Care | LinkedIn', link: 'https://www.linkedin.com/in/a1' }] }], wh('Alicia Carrasco Turning Point Brands, Inc.'));
  assert.equal(out.found, false);
  assert.equal(out.skip, false);
  assert.deepEqual(out.queries.map(q => q.q), ['"alicia carrasco" "turning point brands" linkedin', 'alicia carrasco turning site:linkedin.com/in']);
  assert.equal(out.firstName, 'alicia'); assert.equal(out.lastName, 'carrasco');
});

test('top 10: a name with no company is not rescued (skip), so nothing changes for it', () => {
  const out = run(LI_TOP10, [{ organic: [{ title: 'Jane Smith | LinkedIn', link: 'https://www.linkedin.com/in/js' }] }], wh('Jane Smith'));
  assert.equal(out.found, false); assert.equal(out.skip, true); assert.equal(out.queries.length, 0);
});

test('top 10: empty Serper output does not throw', () => {
  const out = run(LI_TOP10, [{}], wh('Jane Smith Acme'));
  assert.equal(out.found, false); assert.equal(out.organic[0].link, '');
});

test('retry: reads every query result item', () => {
  const nodes = { ...wh('Alicia Waineo ANA, Inc'), 'LI rescue: top 10': { firstName: 'alicia', lastName: 'waineo' } };
  const out = run(LI_RETRY, [{ organic: [] }, { organic: [{ title: 'Alicia Waineo - CFO - ANA, Inc. | LinkedIn', link: 'https://www.linkedin.com/in/aliciawaineo' }] }], nodes);
  assert.equal(out.found, true);
});

test('LinkedIn search: accepts only a headline naming the company', () => {
  const rows = [
    { name: 'Alicia Carrasco', position: 'Associate Chief of Staff for Primary Care', linkedinUrl: 'https://www.linkedin.com/in/a1' },
    { name: 'Alicia C.', position: 'SVP, Chief People Officer at Turning Point Brands (NYSE:TPB)', linkedinUrl: 'https://www.linkedin.com/in/alicia-carrasco' }
  ];
  assert.equal(run(LI_LINKEDIN, rows, wh('Alicia Carrasco Turning Point Brands, Inc.')).organic[0].link, 'https://www.linkedin.com/in/alicia-carrasco');
  assert.equal(run(LI_LINKEDIN, [{ name: 'Brent Hanston', position: 'CFO at Gerawan Farming Partners Inc.', linkedinUrl: 'https://www.linkedin.com/in/bh' }], wh('Brent Hanston A. Duda & Sons, Inc.')).found, false);
  assert.equal(run(LI_LINKEDIN, [{}], wh('Jane Smith Acme')).found, false, 'Apify returned nothing');
});

test('company: LinkedIn company search hit, cross-country forms refused, domain by website', () => {
  const dr = [{ name: 'D.R. Ferroviaria Italia Srl', linkedinUrl: 'https://www.linkedin.com/company/dr-ferroviaria-italia/', website: 'http://drferroviariaitalia.com' }];
  assert.equal(run(CO_LINKEDIN, dr, wh('D.R. FERROVIARIA ITALIA SRL')).bestUrl, 'https://www.linkedin.com/company/dr-ferroviaria-italia/');
  assert.equal(run(CO_LINKEDIN, dr, wh('drferroviariaitalia.com')).bestUrl, 'https://www.linkedin.com/company/dr-ferroviaria-italia/');
  assert.equal(run(CO_LINKEDIN, [{ name: 'Meta-Tronix Pvt Ltd', linkedinUrl: 'https://www.linkedin.com/company/meta-tronix-pvt-ltd/' }], wh('Metatronix Srl')).bestUrl, 'Not found');
  assert.equal(run(CO_LINKEDIN, [{}], wh('Krause Rail Systems')).bestUrl, 'Not found');
  assert.equal(run(CO_LINKEDIN, [{ name: 'Nihon Yamamura Glass Co Ltd', linkedinUrl: 'https://www.linkedin.com/company/nihon-yamamura-glass-co-ltd/' }], wh('Nihon Yamamura Glass Co. Ltd')).bestUrl, 'https://www.linkedin.com/company/nihon-yamamura-glass-co-ltd/');
});

// ---- free tools ----
import { FT_TOP10, FT_RETRY, FT_LINKEDIN, FT_CO_LINKEDIN } from './build.mjs';
const ft = (first, last, company) => ({ Webhook: { body: { first_name: first, last_name: last, company_name: company } } });

test('free tools: a first result that has the name is kept exactly as today', () => {
  const out = run(FT_TOP10, [{ organic: [{ title: 'Satya Nadella - Microsoft | LinkedIn', link: 'https://www.linkedin.com/in/satyanadella' }] }], ft('Satya', 'Nadella', 'Microsoft'));
  assert.equal(out.found, true); assert.equal(out.organic[0].link, 'https://www.linkedin.com/in/satyanadella');
});

test('free tools: a wrong first result is replaced by the right one further down', () => {
  const out = run(FT_TOP10, [{ organic: [
    { title: 'Microsoft | LinkedIn', link: 'https://www.linkedin.com/company/microsoft' },
    { title: 'Jane Doe - Engineer - Microsoft | LinkedIn', link: 'https://www.linkedin.com/in/janedoe' }
  ] }], ft('Jane', 'Doe', 'Microsoft'));
  assert.equal(out.organic[0].link, 'https://www.linkedin.com/in/janedoe');
});

test('free tools: when nothing better is found, the original first link is still returned', () => {
  const out = run(FT_TOP10, [{ organic: [{ title: 'Someone Else | LinkedIn', link: 'https://www.linkedin.com/in/someone' }] }], ft('Jane', 'Doe', 'Acme'));
  assert.equal(out.found, false); assert.equal(out.skip, false); assert.equal(out.organic[0].link, 'https://www.linkedin.com/in/someone');
  const nodes = { ...ft('Jane', 'Doe', 'Acme'), 'FT rescue: top 10': out };
  assert.equal(run(FT_RETRY, [{ organic: [] }], nodes).organic[0].link, 'https://www.linkedin.com/in/someone');
  assert.equal(run(FT_LINKEDIN, [{}], nodes).organic[0].link, 'https://www.linkedin.com/in/someone');
  assert.equal(run(FT_LINKEDIN, [{ name: 'Jane Doe', position: 'CEO at Acme', linkedinUrl: 'https://www.linkedin.com/in/jane-acme' }], nodes).organic[0].link, 'https://www.linkedin.com/in/jane-acme');
});

test('free tools company: reads the free-tools Webhook node', () => {
  assert.ok(FT_CO_LINKEDIN.includes("$('Webhook')") && !FT_CO_LINKEDIN.includes("$('Webhook1')"));
  const dr = [{ name: 'D.R. Ferroviaria Italia Srl', linkedinUrl: 'https://www.linkedin.com/company/dr-ferroviaria-italia/' }];
  assert.equal(run(FT_CO_LINKEDIN, dr, { Webhook: { body: { input_data: 'D.R. FERROVIARIA ITALIA SRL' } } }).bestUrl, 'https://www.linkedin.com/company/dr-ferroviaria-italia/');
});
