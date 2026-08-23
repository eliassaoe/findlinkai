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

const API_BASE = 'https://api.linkfinderai.com';

// resource/operation -> the `type` value LinkFinder AI's single endpoint expects.
// (See https://linkfinderai.com/api-documentation for the authoritative list.)
const OPERATION_TYPE_MAP: Record<string, Record<string, string>> = {
	lead: {
		fullNameToLinkedinUrl: 'lead_full_name_to_linkedin_url',
		emailToLinkedinUrl: 'email_to_linkedin_url',
	},
	company: {
		nameToWebsite: 'company_name_to_website',
		nameToPhone: 'company_name_to_phone',
		nameToEmail: 'company_name_to_email',
		nameToEmployeeCount: 'company_name_to_employee_count',
		nameToLinkedinUrl: 'company_name_to_linkedin_url',
		domainToEmployees: 'company_domain_to_employees',
	},
	linkedinProfile: {
		urlToInfo: 'linkedin_profile_to_linkedin_info',
		urlToEmail: 'linkedin_profile_to_email',
		urlToPhone: 'linkedin_profile_to_phone',
	},
	linkedinCompany: {
		urlToInfo: 'linkedin_company_to_linkedin_info',
		urlToEmployeeCount: 'linkedin_company_to_employee_count',
	},
	linkedinPost: {
		urlToReactions: 'linkedin_post_to_reactions',
	},
	instagram: {
		profileUrlToInfo: 'instagram_profile_to_instagram_info',
	},
};

// linkedin_profile_to_linkedin_info is documented as *always* async (job_id every
// time). Everything else is normally sync but can fall back to the same 202+job_id
// shape once a lookup runs past LinkFinder's ~27s sync window.
const ALWAYS_ASYNC_TYPES = new Set(['linkedin_profile_to_linkedin_info']);

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
	const first = await postWithRetry(ctx, body);
	assertOk(ctx, first.statusCode, first.body);

	const isAsync = first.statusCode === 202 || Boolean(first.body.job_id);
	if (!isAsync) {
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
			return { result: polled.body.data ?? polled.body.result ?? null, status: polled.body.status ?? 'success' };
		}

		jobId = jobId ?? (polled.body.job_id as string | undefined);
		pollUrl = pollUrl ?? (polled.body.poll_url as string | undefined);
		delay = Math.min(delay * 1.5, 4000);
	}

	// Gave up waiting, not gave up on the job — hand back what's needed to
	// check it again later (e.g. from a second node after a Wait node).
	return { processing: true, job_id: jobId, poll_url: pollUrl ?? `${API_BASE}/status/${jobId}` };
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
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'lead',
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Instagram', value: 'instagram' },
					{ name: 'Job', value: 'job' },
					{ name: 'Lead', value: 'lead' },
					{ name: 'LinkedIn Company', value: 'linkedinCompany' },
					{ name: 'LinkedIn Post', value: 'linkedinPost' },
					{ name: 'LinkedIn Profile', value: 'linkedinProfile' },
				],
			},

			// ---- Lead ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['lead'] } },
				default: 'fullNameToLinkedinUrl',
				options: [
					{ name: 'Full Name → LinkedIn URL', value: 'fullNameToLinkedinUrl', description: "Find a person's LinkedIn URL from their name and company", action: 'Find linked in url from full name' },
					{ name: 'Email → LinkedIn URL', value: 'emailToLinkedinUrl', description: "Reverse-lookup a person's LinkedIn URL from their email", action: 'Find linked in url from email' },
				],
			},

			// ---- Company ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['company'] } },
				default: 'nameToWebsite',
				options: [
					{ name: 'Domain → Employees', value: 'domainToEmployees', description: 'Get a filtered list of employees from a company domain', action: 'Find company employees from domain' },
					{ name: 'Name → Email', value: 'nameToEmail', action: 'Find company email from name' },
					{ name: 'Name → Employee Count', value: 'nameToEmployeeCount', action: 'Find company employee count from name' },
					{ name: 'Name → LinkedIn URL', value: 'nameToLinkedinUrl', action: 'Find company linked in url from name' },
					{ name: 'Name → Phone', value: 'nameToPhone', action: 'Find company phone from name' },
					{ name: 'Name → Website', value: 'nameToWebsite', action: 'Find company website from name' },
				],
			},

			// ---- LinkedIn Profile ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['linkedinProfile'] } },
				default: 'urlToEmail',
				options: [
					{ name: 'URL → Full Profile Info', value: 'urlToInfo', description: 'Always async — returns a job to poll', action: 'Get full profile info from linked in url' },
					{ name: 'URL → Email', value: 'urlToEmail', action: 'Find email from linked in url' },
					{ name: 'URL → Phone', value: 'urlToPhone', action: 'Find phone from linked in url' },
				],
			},

			// ---- LinkedIn Company ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['linkedinCompany'] } },
				default: 'urlToInfo',
				options: [
					{ name: 'URL → Company Info', value: 'urlToInfo', action: 'Get company info from linked in url' },
					{ name: 'URL → Employee Count', value: 'urlToEmployeeCount', action: 'Get company employee count from linked in url' },
				],
			},

			// ---- LinkedIn Post ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['linkedinPost'] } },
				default: 'urlToReactions',
				options: [
					{ name: 'URL → Reactions', value: 'urlToReactions', description: 'Get people who reacted to a LinkedIn post', action: 'Get post reactions' },
				],
			},

			// ---- Instagram ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['instagram'] } },
				default: 'profileUrlToInfo',
				options: [
					{ name: 'Profile URL → Info', value: 'profileUrlToInfo', action: 'Get instagram profile info' },
				],
			},

			// ---- Job ----
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

			// ---- Main input, hidden for the Job resource ----
			{
				displayName: 'Input',
				name: 'inputData',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { hide: { resource: ['job'] } },
				description:
					'The value LinkFinder AI looks up — a company name/domain, LinkedIn or Instagram URL, or email',
				placeholder: 'e.g. Tesla, tesla.com, https://linkedin.com/in/john-doe, john@company.com',
			},

			// ---- Domain → Employees extra fields ----
			{
				displayName: 'Department',
				name: 'department',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['company'], operation: ['domainToEmployees'] } },
				description: 'Optional filter, e.g. "engineering" or "marketing"',
			},
			{
				displayName: 'Seniority',
				name: 'seniority',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['company'], operation: ['domainToEmployees'] } },
				description: 'Optional filter, e.g. "director" or "manager"',
			},
			{
				displayName: 'Max Employees',
				name: 'employeeCount',
				type: 'number',
				default: 20,
				typeOptions: { minValue: 1 },
				displayOptions: { show: { resource: ['company'], operation: ['domainToEmployees'] } },
				description: 'Maximum number of employees to return',
			},

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

				const inputData = this.getNodeParameter('inputData', i) as string;
				const body: IDataObject = { type, input_data: inputData };

				if (type === 'company_domain_to_employees') {
					const department = this.getNodeParameter('department', i, '') as string;
					const seniority = this.getNodeParameter('seniority', i, '') as string;
					const employeeCount = this.getNodeParameter('employeeCount', i, undefined) as number | undefined;
					if (department) body.department = department;
					if (seniority) body.seniority = seniority;
					if (employeeCount) body.employee_count = employeeCount;
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
