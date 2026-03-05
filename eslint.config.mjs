import eslint from '@eslint/js';
import globals from 'globals';
import erasableSyntaxOnlyPlugin from 'eslint-plugin-erasable-syntax-only';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactPlugin from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'dist/**/*',
			'**/package.json',
			'**/eslint.config.mjs',
			'node_modules/**/*',
			'src/api/sdk/**/*',
		],
	},
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	erasableSyntaxOnlyPlugin.configs.recommended,
	{
		files: ['**/*.ts', '**/*.tsx'],
		plugins: {
			react: reactPlugin,
			'react-hooks': reactHooksPlugin,
		},
		settings: {
			react: {
				version: 'detect',
			},
		},
		rules: {
			...reactHooksPlugin.configs.recommended.rules,
			'@typescript-eslint/no-empty-object-type': 'off',
			'@typescript-eslint/no-unnecessary-condition': 'error',
			'@typescript-eslint/no-wrapper-object-types': 'error',
		},
	},
);
