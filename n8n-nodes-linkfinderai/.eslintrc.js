module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 2019,
		sourceType: 'module',
		project: './tsconfig.json',
	},
	ignorePatterns: ['dist/**', 'node_modules/**', '*.js'],
	overrides: [
		{
			files: ['credentials/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/credentials'],
			rules: {
				// This rule's own description says it's "only applicable to nodes
				// in the main repository" (n8n's own monorepo), but it doesn't
				// actually scope itself out for community packages the way the
				// sibling not-http-url rule does — it fires here anyway, and its
				// autofix mangles a real URL into a non-URL camelCase string.
				// The sibling rule (cred-class-field-documentation-url-not-http-url,
				// which IS scoped to community credentials) already enforces that
				// documentationUrl is a real http(s) URL, which is what matters.
				'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
			},
		},
		{
			files: ['nodes/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/nodes'],
		},
	],
};
