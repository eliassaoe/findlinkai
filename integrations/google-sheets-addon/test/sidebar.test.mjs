/**
 * The panel's column guessing.
 *
 * It pre-selects which column each lookup reads. A wrong guess is not a cosmetic
 * problem: accept it and the run spends real credits looking up the wrong thing —
 * ten a row, for a profile lookup pointed at a column of names.
 *
 * The first version matched any word of the input's label against any header, so
 * "Company Name" selected a **Full Name** column and "Instagram Handle or URL"
 * selected a **LinkedIn URL** one. These pin the rule that replaced it: the head
 * word must match, extra words break ties, and no match means no guess.
 *
 * Run: node --test test/sidebar.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADDON = dirname(dirname(fileURLToPath(import.meta.url)));
const sidebar = readFileSync(join(ADDON, 'Sidebar.html'), 'utf8');

/** The catalog, so the guesses are checked against the real input labels. */
const operations = (() => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ADDON, 'Operations.gs'), 'utf8'), ctx);
  return JSON.parse(JSON.stringify(ctx.getOperations()));
})();

/** Lifts named functions out of the sidebar's inline script. */
function lift(names, extra = {}) {
  const script = sidebar.match(/<script>([\s\S]*)<\/script>/)[1];
  let code = '';
  for (const name of names) {
    const start = script.indexOf(`function ${name}(`);
    assert.ok(start > 0, `Sidebar.html no longer defines ${name}`);
    let i = script.indexOf('(', start), parens = 0;
    for (; i < script.length; i++) {
      if (script[i] === '(') parens++;
      else if (script[i] === ')' && --parens === 0) break;
    }
    let depth = 0;
    for (i = script.indexOf('{', i); i < script.length; i++) {
      if (script[i] === '{') depth++;
      else if (script[i] === '}' && --depth === 0) break;
    }
    code += `${script.slice(start, i + 1)}\n`;
  }
  // The literals the lifted functions close over, taken from the file itself.
  const literal = (decl) => {
    const at = script.indexOf(decl);
    assert.ok(at > 0, `Sidebar.html no longer declares ${decl}`);
    return script.slice(at, script.indexOf('\n\n', at));
  };
  const ctx = { ...extra };
  vm.createContext(ctx);
  vm.runInContext(`${literal('var GUESSES =')}\n${literal('var STOPWORDS =')}\n${code}`, ctx);
  return ctx;
}

const SHEET = {
  columns: [
    { letter: 'A', name: 'Full Name' },
    { letter: 'B', name: 'Company' },
    { letter: 'C', name: 'City' },
    { letter: 'D', name: 'Job Title' },
    { letter: 'E', name: 'LinkedIn URL' },
    { letter: 'F', name: 'Email' },
    { letter: 'G', name: 'Website' },
    { letter: 'H', name: '' },
  ],
};

const guesser = (sheet = SHEET) => lift(['words', 'guessColumn'], { SHEET: sheet });
const op = (type) => operations.find((o) => o.type === type);

test('a name lookup fills all four of its columns from the headers', () => {
  const { guessColumn } = guesser();
  const names = op('lead_full_name_to_email');
  assert.strictEqual(guessColumn(names, 'name'), 'A');
  assert.strictEqual(guessColumn(names, 'company'), 'B');
  assert.strictEqual(guessColumn(names, 'location'), 'C');
  assert.strictEqual(guessColumn(names, 'job_title'), 'D');
});

test('a company lookup picks Company, not Full Name', () => {
  // "Company Name" shares the word "name" with a Full Name header. Matching any
  // word sent every company lookup at the wrong column.
  const { guessColumn } = guesser();
  assert.strictEqual(guessColumn(op('company_name_to_website'), 'input'), 'B');
  assert.strictEqual(guessColumn(op('company_name_to_email'), 'input'), 'B');
});

test('a LinkedIn profile lookup picks the LinkedIn URL column', () => {
  const { guessColumn } = guesser();
  assert.strictEqual(guessColumn(op('linkedin_profile_to_email'), 'input'), 'E');
  assert.strictEqual(guessColumn(op('linkedin_profile_to_phone'), 'input'), 'E');
});

test('an email lookup picks Email', () => {
  const { guessColumn } = guesser();
  assert.strictEqual(guessColumn(op('email_to_linkedin_url'), 'input'), 'F');
});

test('a lookup with no matching column guesses nothing rather than something wrong', () => {
  // There is no Instagram column here. Selecting LinkedIn URL because both say
  // "URL" would run an Instagram lookup against LinkedIn URLs.
  const { guessColumn } = guesser();
  assert.strictEqual(guessColumn(op('instagram_lookup'), 'input'), '');
  assert.strictEqual(guessColumn(op('leads_finder_ai'), 'input'), '');
});

test('a more specific header wins over a merely matching one', () => {
  const sheet = {
    columns: [
      { letter: 'A', name: 'Company' },
      { letter: 'B', name: 'Company Domain' },
    ],
  };
  const { guessColumn } = guesser(sheet);
  // "Company Domain" matches both words; "Company" matches one.
  assert.strictEqual(guessColumn(op('company_domain_to_employees'), 'input'), 'B');
  // And a plain company-name lookup still prefers the plain column.
  assert.strictEqual(guessColumn(op('company_name_to_website'), 'input'), 'A');
});

test('an empty header is never guessed', () => {
  const { guessColumn } = guesser({ columns: [{ letter: 'A', name: '' }, { letter: 'B', name: '' }] });
  for (const operation of operations) {
    assert.strictEqual(guessColumn(operation, 'input'), '', `${operation.type} guessed a blank column`);
  }
});

test('no lookup ever guesses a column whose header contradicts it', () => {
  // A sweep over every operation: whatever it picks, the header must contain the
  // head word of what that lookup asks for.
  const { guessColumn, words } = guesser();
  for (const operation of operations) {
    if (operation.compositeInput) continue;
    const letter = guessColumn(operation, 'input');
    if (!letter) continue;
    const header = SHEET.columns.find((c) => c.letter === letter).name.toLowerCase();
    const head = words(operation.inputLabel)[0];
    assert.ok(
      header.includes(head),
      `${operation.label} guessed "${header}", which does not mention "${head}"`,
    );
  }
});

test('known limitation: the head word wins, even when a later word is more specific', () => {
  // "Company Domain" leads with "company", so on a sheet with both a Company
  // column and a Domain column it picks Company — although Domain is what that
  // lookup actually wants.
  //
  // Left as it is deliberately. Ranking "domain" above "company" needs a notion
  // of which words are specific, and getting that wrong silently is worse than
  // this: the guess is visible in a dropdown, the help text underneath says
  // "the company's domain, not its name", and changing it is one click. This
  // test exists so the behaviour is a decision on record rather than a surprise.
  const { guessColumn } = guesser({
    columns: [{ letter: 'A', name: 'Company' }, { letter: 'B', name: 'Domain' }],
  });
  assert.strictEqual(guessColumn(op('company_domain_to_employees'), 'input'), 'A');
});
