import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAgent, withDefaults } from '../src/config.mjs';

const valid = {
    id: 'revops',
    icp: { titles: { include: ['revops'] } },
    sources: [{ id: 'post', kind: 'linkedin_post_reactions', input: 'https://www.linkedin.com/posts/x', maxItems: 100 }],
    budget: { maxCreditsPerRun: 500 },
};

test('a complete agent validates', () => {
    assert.deepEqual(validateAgent(valid), []);
});

test('an agent with no credit ceiling is refused', () => {
    const errors = validateAgent({ ...valid, budget: {} });
    assert.ok(errors.some((error) => /maxCreditsPerRun/.test(error)));
});

test('a source with no maxItems is refused, because per-record billing has no other bound', () => {
    const errors = validateAgent({ ...valid, sources: [{ id: 'post', kind: 'linkedin_post_reactions', input: 'https://www.linkedin.com/posts/x' }] });
    assert.ok(errors.some((error) => /maxItems/.test(error)));
});

test('an ICP with no filters at all is refused', () => {
    // Without one, every record any source returns qualifies, and the whole point of
    // scoring before enriching is gone.
    const errors = validateAgent({ ...valid, icp: {} });
    assert.ok(errors.some((error) => /titles.include/.test(error)));
});

test('two sources sharing an id are refused', () => {
    const errors = validateAgent({ ...valid, sources: [valid.sources[0], { ...valid.sources[0] }] });
    assert.ok(errors.some((error) => /own id/.test(error)));
});

test('a post source pointed at something that is not LinkedIn is refused', () => {
    const errors = validateAgent({ ...valid, sources: [{ ...valid.sources[0], input: 'https://x.com/status/1' }] });
    assert.ok(errors.some((error) => /LinkedIn post URL/.test(error)));
});

test('defaults fill in the operation type and the source weight', () => {
    const agent = withDefaults(valid);
    assert.equal(agent.sources[0].type, 'linkedin_post_to_reactions');
    assert.equal(agent.sources[0].weight, 1);
    assert.equal(agent.enrich.maxPerRun, 50);
    assert.equal(agent.enrich.email, true);
});
