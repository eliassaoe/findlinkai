import { createAction } from 'nango';
import { enrichContract } from '../../shared/crm.js';
import { salesforce } from '../../shared/adapters/salesforce.js';

// The schemas and the implementation are shared across every CRM — see shared/crm.ts
// for why. Only the createAction() call is repeated, because Nango's CLI requires each
// script's default export to be a literal one.
const { InputSchema, OutputSchema, description, exec, scopes } = enrichContract(salesforce, 'company');

const action = createAction({
    description,
    version: '1.0.0',
    input: InputSchema,
    output: OutputSchema,
    scopes,
    exec,
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
