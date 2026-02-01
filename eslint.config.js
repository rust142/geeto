// Flat ESLint config that registers TypeScript parser and plugin rules directly.
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended'
import eslintPluginPromise from 'eslint-plugin-promise'
import eslintPluginSecurity from 'eslint-plugin-security'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'

export default [
  eslintPluginUnicorn.configs.recommended,
  eslintPluginPromise.configs['flat/recommended'],
  eslintPluginSecurity.configs.recommended,
  eslintPluginPrettier,
  {
    ignores: ['node_modules/**', 'dist/**', 'lib/**', 'geeto*', '*.lock'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', project: './tsconfig.json' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    // Pull recommended rules from the plugin directly to avoid `extends` resolution issues
    rules: {
      ...(tsPlugin.configs && tsPlugin.configs.recommended && tsPlugin.configs.recommended.rules
        ? tsPlugin.configs.recommended.rules
        : {}),
      // project-specific overrides
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-var-requires': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-empty-object-type': ['off'],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: false,
          },
        },
      ],
      // Code quality rules
      'handle-callback-err': ['error', '^(err|error)$'],
      'max-len': [
        'error',
        {
          code: 100,
          comments: 120,
          ignoreUrls: true,
          ignoreTemplateLiterals: true,
          ignoreStrings: true,
        },
      ],

      // Promise rules
      'promise/always-return': 'off',

      // Security rules (adjusted for CLI tool)
      'security/detect-object-injection': 'off', // Safe in CLI menu context
      'security/detect-non-literal-fs-filename': 'off', // Safe in CLI with controlled paths

      // Unicorn rules (adjusted for CLI tool)
      'unicorn/prefer-module': ['error'],
      'unicorn/prefer-node-protocol': ['error'],
      'unicorn/filename-case': [
        'error',
        {
          cases: {
            camelCase: true,
            pascalCase: true,
            kebabCase: true,
          },
        },
      ],
      'unicorn/no-await-expression-member': ['error'],
      'unicorn/no-for-loop': ['error'],
      'unicorn/no-instanceof-array': ['error'],
      'unicorn/prefer-number-properties': ['error'],
      'unicorn/catch-error-name': [
        'error',
        {
          name: 'error',
        },
      ],
      'unicorn/prefer-export-from': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-empty-file': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/no-nested-ternary': 'off',
      'unicorn/prefer-ternary': 'off', // Allow if-else for readability in CLI
      'unicorn/no-process-exit': 'off', // CLI tool needs to exit
    },
    ignores: [
      'node_modules/',
      'lib/',
      'dist/',
      'build/',
      '*.log',
      'pids',
      '*.pid',
      '*.seed',
      '*.pid.lock',
      'coverage/',
      '.nyc_output',
      'jspm_packages/',
      '.npm',
      '.node_repl_history',
      '*.tgz',
      '.yarn-integrity',
      '.env',
      '.vscode/',
      '.idea/',
      '.DS_Store',
      '.DS_Store?',
      '._*',
      '.Spotlight-V100',
      '.Trashes',
      'ehthumbs.db',
      'Thumbs.db',
      '.git/',
      '.prettierrc.js',
      '*.js',
      '*.config.js',
    ],
  },
]
