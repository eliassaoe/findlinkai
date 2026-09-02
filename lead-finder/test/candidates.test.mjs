import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCandidates, parseHeadline, profileKey, toCandidate } from '../src/candidates.mjs';

const source = (id, weight = 1) => ({ id, kind: 'linkedin_post_reactions', label: id, weight });

test('the same profile written four ways is one key', () => {
    const keys = [
        'https://www.linkedin.com/in/ada-lovelace',
        'http://linkedin.com/in/ada-lovelace/',
        'https://fr.linkedin.com/in/Ada-Lovelace',
        'linkedin.com/in/ada-lovelace?trk=public_profile',
    ].map(profileKey);
    assert.deepEqual(new Set(keys), new Set(['linkedin.com/in/ada-lovelace']));
});

test('a headline gives up its title and company', () => {
    assert.deepEqual(parseHeadline('VP Engineering at Tesla'), { jobTitle: 'VP Engineering', company: 'Tesla' });
    assert.deepEqual(parseHeadline('Head of Growth @ Instantly | We are hiring'), { jobTitle: 'Head of Growth', company: 'Instantly' });
});

test('a headline with no separator keeps the whole line as the title rather than guessing a company', () => {
    assert.deepEqual(parseHeadline('Founder, operator, occasional runner'), { jobTitle: 'Founder, operator, occasional runner' });
});

test('an employee record keeps its structured fields instead of re-parsing them', () => {
    const candidate = toCandidate({
        name: 'Sebastian Robles',
        firstName: 'Sebastian',
        lastName: 'Robles',
        jobTitle: 'Talent Acquisition Manager',
        headline: 'Talent Acquisition Manager en Tesla',
        seniority: 'manager',
        department: ['Human Resources'],
        email: 'srobles@tesla.com',
        linkedinUrl: 'http://www.linkedin.com/in/sebastian-robles',
        country: 'Mexico',
        company: 'Tesla',
    }, source('employees'));

    assert.equal(candidate.jobTitle, 'Talent Acquisition Manager');
    assert.equal(candidate.company, 'Tesla');
    assert.equal(candidate.seniority, 'manager');
    assert.deepEqual(candidate.departments, ['Human Resources']);
    assert.equal(candidate.email, 'srobles@tesla.com');
});

test('one person in two sources becomes one candidate carrying both signals', () => {
    const fromPost = toCandidate({ name: 'Ada Lovelace', headline: 'VP Sales at Tesla', linkedinUrl: 'https://www.linkedin.com/in/ada-lovelace', reactionType: 'PRAISE' }, source('post', 3));
    const fromEmployees = toCandidate({ name: 'Ada Lovelace', jobTitle: 'VP Sales', company: 'Tesla', seniority: 'vp', email: 'ada@tesla.com', linkedinUrl: 'http://linkedin.com/in/ada-lovelace/' }, source('employees', 1));

    const { candidates } = mergeCandidates([fromPost, fromEmployees]);
    assert.equal(candidates.length, 1);
    assert.deepEqual(candidates[0].sources.map((s) => s.id), ['post', 'employees']);
    // The reaction record had no email or seniority; the employee record filled them in.
    assert.equal(candidates[0].email, 'ada@tesla.com');
    assert.equal(candidates[0].seniority, 'vp');
    assert.equal(candidates[0].reactionType, 'PRAISE');
});

test('a record with no LinkedIn URL is dropped and counted, not pushed as a nameless lead', () => {
    const { candidates, dropped } = mergeCandidates([toCandidate({ name: 'No URL' }, source('post'))]);
    assert.equal(candidates.length, 0);
    assert.equal(dropped, 1);
});
