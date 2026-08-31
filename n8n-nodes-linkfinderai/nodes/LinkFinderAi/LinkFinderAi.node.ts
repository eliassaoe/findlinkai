import {
	NodeConnectionTypes,
	NodeApiError,
	NodeOperationError,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type IDataObject,
	type IHttpRequestOptions,
} from 'n8n-workflow';

import {
	ALT_TYPES,
	ALWAYS_ASYNC_TYPES,
	COMPOSITE_INPUTS,
	INPUT_PROPERTIES,
	OPERATION_PROPERTIES,
	OPERATION_TYPE_MAP,
	OPTIONAL_PARAMS,
	PARAM_PROPERTIES,
	RESOURCE_PROPERTY,
} from './generated/operations';

const API_BASE = 'https://api.linkfinderai.com';

/**
 * A CRM export writes "Doe, John". The lookup wants "John Doe", and looking
 * someone up backwards costs exactly what looking them up right costs.
 */
function flipName(value: string): string {
	const match = value.match(/^\s*([^,]{1,60}?)\s*,\s*([^,]{1,60}?)\s*$/);
	return match ? `${match[2]} ${match[1]}` : value.trim();
}

/**
 * Builds the one string the API takes.
 *
 * Most lookups have a single Input field. The two name-based ones take several —
 * name, company, location, job title — joined in the catalog's order with the
 * empty ones dropped, which is exactly the string app.html builds. A workflow
 * that maps only the name still works; it just matches less precisely, and that
 * is the user's choice rather than the node's limitation.
 */
function buildInput(
	ctx: IExecuteFunctions,
	type: string,
	itemIndex: number,
): string {
	const composite = COMPOSITE_INPUTS[type];
	if (!composite) return ctx.getNodeParameter('inputData', itemIndex) as string;

	const parts: string[] = [];
	for (const part of composite.parts) {
		let value = String(ctx.getNodeParameter(part.node, itemIndex, '') ?? '').trim();
		if (!value) continue;
		// Only a name is ever "Last, First"; a company like "Gates, Foundation" is not.
		if (part.api === 'name') value = flipName(value);
		parts.push(value);
	}
	return parts.join(composite.joinWith);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

interface LinkFinderResponse {
	status?: string;
	result?: unknown;
	message?: string;
	job_id?: string;
	poll_url?: string;
	[key: string]: unknown;
}

async function postWithRetry(
	ctx: IExecuteFunctions,
	body: IDataObject,
	attempt = 0,
): Promise<{ statusCode: number; body: LinkFinderResponse }> {
	const options: IHttpRequestOptions = {
		method: 'POST',
		url: API_BASE,
		body,
		json: true,
		returnFullResponse: true,
	};

	const response = (await ctx.helpers.httpRequestWithAuthentication.call(
		ctx,
		'linkFinderAiApi',
		options,
	)) as { statusCode: number; body: LinkFinderResponse };

	// Docs: on 429, back off 1s, then 2s, then 4s before giving up.
	if (response.statusCode === 429 && attempt < 3) {
		await sleep(2 ** attempt * 1000);
		return postWithRetry(ctx, body, attempt + 1);
	}

	return response;
}

async function pollJob(
	ctx: IExecuteFunctions,
	jobId: string | undefined,
	pollUrlIn: string | undefined,
): Promise<{ statusCode: number; body: LinkFinderResponse }> {
	const pollUrl = pollUrlIn ?? (jobId ? `${API_BASE}/status/${jobId}` : undefined);
	if (!pollUrl) {
		throw new NodeOperationError(ctx.getNode(), 'A Job ID or Poll URL is required to check job status.');
	}

	const options: IHttpRequestOptions = {
		method: 'GET',
		url: pollUrl,
		json: true,
		returnFullResponse: true,
	};

	return (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'linkFinderAiApi', options)) as {
		statusCode: number;
		body: LinkFinderResponse;
	};
}

/**
 * Runs the request and, if it comes back async, polls until resolved or
 * maxWaitMs elapses — whichever first. Mirrors the same wait/backoff shape
 * used by the LinkFinder AI HubSpot (Nango) integration, for consistency
 * across LinkFinder's official integrations.
 */
async function callAndMaybeWait(
	ctx: IExecuteFunctions,
	type: string,
	body: IDataObject,
	waitForCompletion: boolean,
	maxWaitMs: number,
): Promise<IDataObject> {
	let first = await postWithRetry(ctx, body);

	// The Instagram operation's type name differs between the spec and the published
	// docs, and no other source settles it. Send the spec's name, and if the API
	// rejects it as unknown, try the documented alternative once before giving up.
	const altType = ALT_TYPES[type];
	if (first.statusCode === 422 && altType) {
		first = await postWithRetry(ctx, { ...body, type: altType });
	}

	assertOk(ctx, first.statusCode, first.body);

	const isAsync = first.statusCode === 202 || Boolean(first.body.job_id);
	if (!isAsync) {
		assertNotUpstreamError(ctx, first.body.result ?? null);
		return { result: first.body.result ?? null, status: 'success' };
	}

	if (!waitForCompletion) {
		return {
			processing: true,
			job_id: first.body.job_id,
			poll_url: first.body.poll_url ?? `${API_BASE}/status/${first.body.job_id}`,
		};
	}

	const deadline = Date.now() + maxWaitMs;
	let delay = 1500;
	let jobId = first.body.job_id;
	let pollUrl = first.body.poll_url;

	while (Date.now() < deadline) {
		await sleep(delay);
		const polled = await pollJob(ctx, jobId, pollUrl);
		assertOk(ctx, polled.statusCode, polled.body);

		if (polled.body.status !== 'processing') {
			const resolved = polled.body.data ?? polled.body.result ?? null;
			assertNotUpstreamError(ctx, resolved);
			return { result: resolved, status: polled.body.status ?? 'success' };
		}

		jobId = jobId ?? (polled.body.job_id as string | undefined);
		pollUrl = pollUrl ?? (polled.body.poll_url as string | undefined);
		delay = Math.min(delay * 1.5, 4000);
	}

	// Gave up waiting, not gave up on the job — hand back what's needed to
	// check it again later (e.g. from a second node after a Wait node).
	return { processing: true, job_id: jobId, poll_url: pollUrl ?? `${API_BASE}/status/${jobId}` };
}

/**
 * An operation can answer HTTP 200 with `status: "success"` while the result is really
 * an upstream failure. This was seen in production: a lookup returned an array whose
 * only element was a provider permissions error. Without this check the workflow would
 * carry that error object downstream as if it were data.
 *
 * Kept general on purpose — the operation it was first observed on has since been
 * withdrawn, but nothing about the failure was specific to it.
 */
function assertNotUpstreamError(ctx: IExecuteFunctions, result: unknown): void {
	const items = Array.isArray(result) ? result : [result];

	for (const item of items) {
		const upstream = item && typeof item === 'object' ? (item as IDataObject).error : null;
		if (!upstream) continue;

		const message =
			typeof upstream === 'string' ? upstream : (upstream as IDataObject).message ?? 'upstream provider error';
		throw new NodeApiError(ctx.getNode(), {
			message:
				`LinkFinder AI returned a provider error instead of data: ${String(message).slice(0, 300)}. ` +
				'This is a fault on the LinkFinder side, not with the input — the credits were still spent.',
		} as any);
	}
}

function assertOk(ctx: IExecuteFunctions, statusCode: number, data: LinkFinderResponse): void {
	if (statusCode === 401) {
		throw new NodeApiError(ctx.getNode(), { message: 'Invalid or missing LinkFinder AI API key.' } as any);
	}
	if (statusCode === 402) {
		throw new NodeApiError(ctx.getNode(), { message: 'LinkFinder AI account has insufficient credits.' } as any);
	}
	if (statusCode === 422) {
		throw new NodeApiError(ctx.getNode(), {
			message: data.message ?? 'Invalid LinkFinder AI request — check the input value for this operation.',
		} as any);
	}
	if (statusCode === 429) {
		throw new NodeApiError(ctx.getNode(), { message: 'LinkFinder AI rate limit exceeded and retries were exhausted.' } as any);
	}
	if (statusCode >= 500) {
		throw new NodeApiError(ctx.getNode(), { message: data.message ?? 'LinkFinder AI server error.' } as any);
	}
}

export class LinkFinderAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LinkFinder AI',
		name: 'linkFinderAi',
		icon: 'file:linkfinderai.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Enrich leads, companies, LinkedIn profiles/companies/posts and Instagram profiles',
		defaults: { name: 'LinkFinder AI' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'linkFinderAiApi', required: true }],
		properties: [
			RESOURCE_PROPERTY,

			// One Operation picker per resource, generated from the catalog so the list
			// cannot fall behind the API. Each option states its own credit cost.
			...OPERATION_PROPERTIES,

			// ---- Job ----
			// Not an API operation: this is how a workflow resumes a lookup it chose not
			// to wait for, so it is declared here rather than generated.
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['job'] } },
				default: 'checkStatus',
				options: [
					{ name: 'Check Status', value: 'checkStatus', description: 'Poll a job started by an async operation', action: 'Check job status' },
				],
			},

			// One Input field per operation, each labelled and placeheld for what that
			// specific lookup takes, rather than one field describing all twenty.
			...INPUT_PROPERTIES,

			// Optional filters, shown only on the operations the API accepts them for.
			...PARAM_PROPERTIES,

			// ---- Job: check status fields ----
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['job'] } },
				description: 'The job_id returned by an async LinkFinder AI operation. Leave empty if you have a full Poll URL instead.',
			},
			{
				displayName: 'Poll URL',
				name: 'pollUrl',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['job'] } },
				description: 'The poll_url returned by an async LinkFinder AI operation. Overrides Job ID if both are set.',
			},

			// ---- Shared async handling options ----
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { hide: { resource: ['job'] } },
				options: [
					{
						displayName: 'Wait for Completion',
						name: 'waitForCompletion',
						type: 'boolean',
						default: true,
						description:
							'Whether to poll internally until the result is ready. If off, an async operation returns immediately with a Job ID/Poll URL — pair with a Wait node and the "Job → Check Status" operation to finish it yourself.',
					},
					{
						displayName: 'Max Wait Time (Seconds)',
						name: 'maxWaitSeconds',
						type: 'number',
						default: 25,
						typeOptions: { minValue: 1, maxValue: 280 },
						description:
							'How long to keep polling before giving up and returning the Job ID/Poll URL instead. linkedin_profile_to_linkedin_info is always async and often needs more than the 25s default.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'job') {
					const jobId = this.getNodeParameter('jobId', i, '') as string;
					const pollUrl = this.getNodeParameter('pollUrl', i, '') as string;
					const polled = await pollJob(this, jobId || undefined, pollUrl || undefined);
					assertOk(this, polled.statusCode, polled.body);

					const outJson: IDataObject = {
						status: polled.body.status,
						result: (polled.body.data as IDataObject | undefined)?.result ?? polled.body.result ?? null,
						processing: polled.body.status === 'processing',
					};
					returnData.push({ json: outJson, pairedItem: { item: i } });
					continue;
				}

				const type = OPERATION_TYPE_MAP[resource]?.[operation];
				if (!type) {
					throw new NodeOperationError(this.getNode(), `Unknown resource/operation combination: ${resource}/${operation}`);
				}

				const inputData = buildInput(this, type, i);
				const body: IDataObject = { type, input_data: inputData };

				// Employee-list operations take department, seniority and employee_count.
				// Which type accepts what comes from the catalog, so a new filter reaches
				// every operation that has it.
				for (const { api, node } of OPTIONAL_PARAMS[type] ?? []) {
					const value = this.getNodeParameter(node, i, undefined) as string | number | undefined;
					if (value !== undefined && value !== null && value !== '') {
						body[api] = value;
					}
				}

				const options = this.getNodeParameter('options', i, {}) as {
					waitForCompletion?: boolean;
					maxWaitSeconds?: number;
				};
				// linkedin_profile_to_linkedin_info is always async, so default the
				// wait window up if the user hasn't overridden it — otherwise the
				// node would near-always return "processing" for that one operation.
				const defaultWaitSeconds = ALWAYS_ASYNC_TYPES.has(type) ? 60 : 25;
				const waitForCompletion = options.waitForCompletion ?? true;
				const maxWaitMs = (options.maxWaitSeconds ?? defaultWaitSeconds) * 1000;

				const result = await callAndMaybeWait(this, type, body, waitForCompletion, maxWaitMs);
				returnData.push({ json: result, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
