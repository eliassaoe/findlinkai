import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, qualify, scoreIntent } from '../src/icp.mjs';

const icp = {
    titles: { include: ['vp sales', 'head of growth', 'revops'], exclude: ['intern', 'open to work'] },
    seniority: ['vp', 'director', 'head'],
    departments: ['Sales'],
    countries: ['United States'],
    excludeCompanies: ['apollo.io', 'instantly'],
    companySize: { min: 11, max: 500 },
};

const candidate = (overrides = {}) => ({
    key: 'linkedin.com/in/x',
    jobTitle: 'VP Sales',
    company: 'Tesla',
    sources: [{ id: 'post', label: 'post', weight: 3 }],
    departments: ['Sales'],
    ...overrides,
});

test('each hard filter names the rule that rejected the lead', () => {
    const cases = [
        [{ jobTitle: 'Sales intern' }, 'title_excluded'],
        [{ company: 'Instantly' }, 'company_excluded'],
        [{ jobTitle: 'Chief Marketing Officer' }, 'title_mismatch'],
        [{ jobTitle: '' }, 'no_title'],
        [{ seniority: 'entry' }, 'seniority_mismatch'],
        [{ departments: ['Engineering'] }, 'department_mismatch'],
        [{ country: 'Germany' }, 'country_mismatch'],
        [{ companySize: 4 }, 'company_too_small'],
        [{ companySize: 9000 }, 'company_too_large'],
    ];
    for (const [overrides, expected] of cases) {
        const verdict = evaluate(candidate(overrides), icp);
        assert.equal(verdict.matched, false, `${JSON.stringify(overrides)} should be rejected`);
        assert.equal(verdict.rejectedBy, expected);
    }
});

test('a field the source never returns does not reject the lead', () => {
    // Reaction records carry no country and no company size. Rejecting on absence would
    // throw away the entire post-engagement source.
    const verdict = evaluate(candidate({ country: undefined, companySize: undefined, seniority: undefined }), icp);
    assert.equal(verdict.matched, true);
});

test('two signals outscore one loud one', () => {
    const twoSources = candidate({ sources: [{ id: 'a', weight: 2 }, { id: 'b', weight: 2 }] });
    const oneSource = candidate({ sources: [{ id: 'a', weight: 3 }] });
    assert.ok(scoreIntent(twoSources, { icp }).score > scoreIntent(oneSource, { icp }).score);
});

test('a deliberate reaction scores above a like, and every point is explained', () => {
    const praise = scoreIntent(candidate({ reactionType: 'PRAISE' }), { icp });
    const like = scoreIntent(candidate({ reactionType: 'LIKE' }), { icp });
    assert.equal(praise.score - like.score, 1);
    assert.ok(praise.detail.some((d) => d.reason === 'reaction:PRAISE'));
});

test('qualify sorts by score, splits out the below-threshold ones and tallies rejections', () => {
    const agent = { icp, enrich: { minScore: 5 } };
    const hot = candidate({ key: 'a', seniority: 'vp', sources: [{ id: 'post', weight: 3 }, { id: 'list', weight: 1 }] });
    const warm = candidate({ key: 'b', sources: [{ id: 'list', weight: 1 }], seniority: undefined, departments: [] });
    const out = candidate({ key: 'c', jobTitle: 'Sales intern' });

    const result = qualify([warm, hot, out], agent);
    assert.deepEqual(result.qualified.map((entry) => entry.candidate.key), ['a']);
    assert.deepEqual(result.belowThreshold.map((entry) => entry.candidate.key), ['b']);
    assert.deepEqual(result.rejectedBy, { title_excluded: 1 });
});
