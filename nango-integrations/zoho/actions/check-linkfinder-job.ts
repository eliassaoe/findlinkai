import { createAction } from 'nango';
import { checkJobContract } from '../../shared/crm.js';
import { zoho } from '../../shared/adapters/zoho.js';

const { InputSchema, OutputSchema, description, exec, scopes } = checkJobContract(zoho);

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
