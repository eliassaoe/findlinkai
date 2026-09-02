import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Budget, BudgetExceededError, estimateRun, priceOf, sourceOperation } from '../src/budget.mjs';

const agent = {
    sources: [
        { id: 'post', kind: 'linkedin_post_reactions', maxItems: 150, type: 'linkedin_post_to_reactions', label: 'post' },
        { id: 'emp', kind: 'company_employees', by: 'domain', maxItems: 25, type: 'company_domain_to_employees', label: 'employees' },
    ],
    enrich: { email: true, maxPerRun: 40 },
    budget: { maxCreditsPerRun: 1200 },
};

test('the estimate is the worst case, not the likely case', () => {
    const estimate = estimateRun(agent);
    // 150 reactions + 25 employees + 40 email lookups at 10.
    assert.equal(estimate.total, 150 + 25 + 400);
    assert.equal(estimate.capped, false);
});

test('a ceiling below the worst case is reported, not treated as an error', () => {
    const estimate = estimateRun({ ...agent, budget: { maxCreditsPerRun: 300 } });
    assert.equal(estimate.capped, true);
});

test('a phone-enrichment agent is priced at the phone rate', () => {
    const estimate = estimateRun({ ...agent, enrich: { email: false, phone: true, maxPerRun: 10 } });
    assert.equal(estimate.lines.at(-1).credits, priceOf('linkedin_profile_to_phone').perCall * 10);
});

test('spending past the ceiling throws instead of quietly going over', () => {
    const budget = new Budget(100);
    budget.spend(90, 'email');
    assert.equal(budget.canAfford(10), true);
    assert.equal(budget.canAfford(11), false);
    assert.throws(() => budget.spend(20, 'email'), BudgetExceededError);
    assert.equal(budget.spent, 90);
});

test('a per-record charge that overshoots is recorded rather than hidden', () => {
    // The API bills for every record it returns, and how many that is is only known
    // afterwards. Refusing to record it would not un-spend the credits.
    const budget = new Budget(100);
    budget.charge(140, 'source:post');
    assert.equal(budget.spent, 140);
    assert.equal(budget.overspent, true);
    assert.equal(budget.canAfford(1), false);
});

test('each source kind maps to the operation that bills for it', () => {
    assert.equal(sourceOperation({ kind: 'linkedin_post_reactions' }), 'linkedin_post_to_reactions');
    assert.equal(sourceOperation({ kind: 'company_employees', by: 'name' }), 'company_name_to_employees');
    assert.equal(sourceOperation({ kind: 'company_employees', by: 'linkedin' }), 'linkedin_company_to_employees');
    assert.equal(sourceOperation({ kind: 'company_employees' }), 'company_domain_to_employees');
    assert.throws(() => sourceOperation({ kind: 'telepathy' }), /Unknown source kind/);
});
