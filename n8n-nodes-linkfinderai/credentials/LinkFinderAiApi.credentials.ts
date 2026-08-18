import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class LinkFinderAiApi implements ICredentialType {
	name = 'linkFinderAiApi';

	displayName = 'LinkFinder AI API';

	documentationUrl = 'https://linkfinderai.com/api-documentation';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Find this in your LinkFinder AI dashboard under Settings → API Key',
		},
	];

	// Every LinkFinder AI request expects `Authorization: Bearer <API_KEY>`.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// A cheap, real call to sanity-check the key: looking up a well-known company
	// costs 1 credit but confirms both the key and the account are live.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.linkfinderai.com',
			url: '',
			method: 'POST',
			body: {
				type: 'company_name_to_website',
				input_data: 'Tesla',
			},
		},
	};
}
