// Executes the workflow's classifier node against the payload shapes the
// LinkFinder endpoint actually returns.  node outbound/n8n/test-classifier.js
const fs = require('fs'), path = require('path');
const wf = JSON.parse(fs.readFileSync(path.join(__dirname, 'g2-to-instantly.json'), 'utf8'));
const body = wf.nodes.find(n => n.name.startsWith('Real person')).parameters.jsCode;

function run(rows) {
  const prospect = { domain: 'a.com', company: 'A', category: 'c', reviewCount: 11 };
  const $ = (n) => ({ first: () => ({ json: n === 'One prospect at a time' ? prospect : {} }) });
  const $input = { first: () => ({ json: { result: rows } }) };
  return new Function('$', '$input', body)($, $input)[0].json;
}

let fails = [];
const ck = (l, g, w) => { const ok = g === w; if (!ok) fails.push(l);
  console.log((ok ? 'PASS ' : 'FAIL ') + l.padEnd(48) + JSON.stringify(g)); };

const MAINT   = [{ personId: null, name: 'We are on maintenance. Check back in 48hrs' }];
const NOLEADS = [{ personId: null, name: 'No Leads found. Tweak your filters and try again' }];
const BANNER  = [{ personId: null, name: 'We improve the Actor everyday. Contact us if you are having any issue' }];
const REAL    = [{ personId: 'p1', name: 'Zach Barney', email: 'zach@a.com', jobTitle: 'CEO' }];
const NOEMAIL = [{ personId: 'p1', name: 'No Email', email: null }];

console.log('--- down vs genuinely empty ---');
ck('maintenance -> provider_down',            run(MAINT).status,   'provider_down');
ck('actor banner alone -> provider_down',     run(BANNER).status,  'provider_down');
ck('"No Leads found" -> no_person',           run(NOLEADS).status, 'no_person');
ck('empty array -> no_person',                run([]).status,      'no_person');
ck('person with no email -> no_person',       run(NOEMAIL).status, 'no_person');

console.log('\n--- a real person parses ---');
const ok = run(REAL);
ck('status', ok.status, 'ok');
ck('email',  ok.email,  'zach@a.com');
ck('first',  ok.firstName, 'Zach');
ck('last',   ok.lastName,  'Barney');
ck('title',  ok.title,     'CEO');
ck('category survives for the merge field', ok.category, 'c');
ck('reviewCount survives for the merge field', ok.reviewCount, 11);

console.log('\n--- real data beats a status row ---');
ck('banner + person -> ok',      run([...BANNER, ...REAL]).status, 'ok');
ck('  email still extracted',    run([...BANNER, ...REAL]).email,  'zach@a.com');
ck('maintenance + person -> ok', run([...MAINT,  ...REAL]).status, 'ok');

console.log('\n' + (fails.length ? 'FAILURES: ' + fails.join(', ') : 'classifier behaves correctly'));
process.exit(fails.length ? 1 : 0);
