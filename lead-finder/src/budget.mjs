/**
 * What a run will cost, and stopping it before it costs more.
 *
 * Credits are spent the moment a lookup runs — including lookups that come back empty.
 * So the estimate has to be built from *attempts*, never from expected results, and the
 * guard has to hold the line during the run rather than reporting the overspend after.
 */

/**
 * Prices are the ones in `integrations/catalog/operations.json`, which is the source of
 * truth the rest of the repo generates from.
 *
 * `perItem` operations bill per record returned, so their cost is only known after the
 * call. Every source therefore carries a `maxItems` and the estimate uses it as the
 * worst case — an estimate that under-promises is the only useful kind here.
 *
 * One documented conflict: the catalog prices employee lists at 1 credit per employee,
 * while the `employee_count` param help on the same operation says 0.5. This uses 1,
 * because over-estimating a budget cap fails safe and under-estimating does not.
 */
export const PRICES = {
    linkedin_post_to_reactions: { perItem: 1 },
    company_domain_to_employees: { perItem: 1 },
    company_name_to_employees: { perItem: 1 },
    linkedin_company_to_employees: { perItem: 1 },
    linkedin_profile_to_email: { perCall: 10 },
    linkedin_profile_to_phone: { perCall: 50 },
    lead_full_name_to_email: { perCall: 7 },
    lead_full_name_to_linkedin_url: { perCall: 1 },
    email_to_linkedin_url: { perCall: 5 },
};

export function priceOf(type) {
    const price = PRICES[type];
    if (!price) throw new Error(`No price known for LinkFinder AI operation "${type}".`);
    return price;
}

export class BudgetExceededError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BudgetExceededError';
    }
}

/**
 * A running total with a ceiling. `reserve` is the call to make *before* spending: it
 * answers whether the next lookup fits, so the run can stop cleanly with the leads it
 * already has instead of failing part way through an enrichment loop.
 */
export class Budget {
    constructor(maxCredits) {
        if (!Number.isFinite(maxCredits) || maxCredits < 0) {
            throw new Error('A run needs a numeric credit ceiling. Set budget.maxCreditsPerRun on the agent.');
        }
        this.max = maxCredits;
        this.spent = 0;
        this.ledger = [];
    }

    get remaining() {
        return this.max - this.spent;
    }

    canAfford(credits) {
        return this.spent + credits <= this.max;
    }

    /**
     * Records what a per-record operation actually cost, after the fact.
     *
     * A reactions call is charged for every record it returns, and how many that is only
     * becomes known once it has. Refusing to record an overshoot would not un-spend the
     * credits — it would just hide them — so this records reality and lets `canAfford`
     * shut the rest of the run down.
     */
    charge(credits, label) {
        this.spent += credits;
        this.ledger.push({ label, credits });
        if (this.spent > this.max) this.overspent = true;
        return this.spent;
    }

    /** Records a spend the caller could size in advance. Throws rather than going over. */
    spend(credits, label) {
        if (!this.canAfford(credits)) {
            throw new BudgetExceededError(
                `Spending ${credits} credits on ${label} would take this run to ${this.spent + credits}, over its ${this.max} ceiling.`,
            );
        }
        this.spent += credits;
        this.ledger.push({ label, credits });
        return this.spent;
    }
}

/**
 * The worst case for one run, itemised.
 *
 * Sourcing is bounded by each source's `maxItems`. Enrichment is bounded by
 * `enrich.maxPerRun` rather than by how many people qualify, because how many qualify
 * is not knowable before the sourcing calls have been paid for.
 */
export function estimateRun(agent) {
    const lines = [];

    for (const source of agent.sources ?? []) {
        const price = priceOf(source.type ?? sourceOperation(source));
        const items = source.maxItems ?? 100;
        const credits = price.perItem ? price.perItem * items : price.perCall;
        lines.push({
            phase: 'sourcing',
            label: source.label ?? source.id,
            detail: `up to ${items} records`,
            credits,
        });
    }

    const enrich = agent.enrich ?? {};
    const maxPerRun = enrich.maxPerRun ?? 50;
    if (enrich.email !== false) {
        lines.push({
            phase: 'enrichment',
            label: 'email from LinkedIn profile',
            detail: `up to ${maxPerRun} lookups, charged whether or not an email comes back`,
            credits: priceOf('linkedin_profile_to_email').perCall * maxPerRun,
        });
    }
    if (enrich.phone) {
        lines.push({
            phase: 'enrichment',
            label: 'phone from LinkedIn profile',
            detail: `up to ${maxPerRun} lookups`,
            credits: priceOf('linkedin_profile_to_phone').perCall * maxPerRun,
        });
    }

    const total = lines.reduce((sum, line) => sum + line.credits, 0);
    const ceiling = agent.budget?.maxCreditsPerRun;

    return {
        lines,
        total,
        ceiling,
        // The ceiling is what actually stops the run, so a plan whose worst case is over
        // it is not wrong — it just means the run stops early. Say so rather than
        // failing, because a wide funnel with a tight cap is a legitimate setup.
        capped: Number.isFinite(ceiling) && total > ceiling,
    };
}

/** Which LinkFinder AI operation a source kind maps to. */
export function sourceOperation(source) {
    switch (source.kind) {
        case 'linkedin_post_reactions':
            return 'linkedin_post_to_reactions';
        case 'company_employees':
            if (source.by === 'name') return 'company_name_to_employees';
            if (source.by === 'linkedin') return 'linkedin_company_to_employees';
            return 'company_domain_to_employees';
        default:
            throw new Error(`Unknown source kind "${source.kind}".`);
    }
}
