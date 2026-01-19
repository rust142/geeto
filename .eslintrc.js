module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:unicorn/recommended',
    'plugin:promise/recommended',
    'plugin:prettier/recommended',
    'plugin:security/recommended-legacy',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'unicorn', 'promise'],
  rules: {
    // Basic rules
    'no-var': ['error'],
    'prefer-const': ['error'],
    'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
    'no-console': ['off'], // CLI tool, console usage is expected
    'eqeqeq': ['error', 'always'],
    'consistent-return': ['error'],
    'object-shorthand': ['warn', 'always'],
    'array-callback-return': ['error', { allowImplicit: true }],
    'dot-notation': ['error', { allowKeywords: true }],
    'space-before-function-paren': 'off',
    'comma-dangle': ['off', 'always-multiline'],
    'eol-last': ['error', 'always'],
    'no-floating-decimal': ['error'],
    'no-array-constructor': ['error'],
    'no-new-wrappers': ['error'],
    'no-self-assign': ['error'],
    'no-return-await': ['error'],
    'no-implicit-globals': ['error'],
    'no-multiple-empty-lines': ['error', { max: 1 }],
    'no-use-before-define': ['warn', { functions: false, classes: true, variables: true }],
    'no-constant-condition': ['warn'], // Allow in CLI tools
    'no-control-regex': ['error'],
    'no-debugger': ['error'],
    'no-duplicate-case': ['error'],
    'no-eval': ['error'],
    'no-ex-assign': ['error'],
    'no-fallthrough': ['error'],
    'no-inner-declarations': ['error'],
    'no-shadow': ['off'],
    '@typescript-eslint/no-shadow': 'error',
    'no-regex-spaces': ['error'],
    'no-self-compare': ['error'],
    'no-sparse-arrays': ['error'],
    'no-mixed-spaces-and-tabs': ['error'],
    'no-this-before-super': ['error'],
    'no-with': ['error'],
    'no-trailing-spaces': ['error', { ignoreComments: true }],
    'no-undef-init': ['error'],
    'no-unsafe-finally': ['error'],
    'no-unreachable': ['error'],
    'no-multi-spaces': ['error'],
    'rest-spread-spacing': ['error', 'never'],
    'padded-blocks': ['error', 'never'],
    'space-in-parens': ['error', 'never'],
    'use-isnan': ['error'],
    'valid-typeof': ['error', { requireStringLiterals: true }],
    'curly': ['error', 'all'],
    'no-process-exit': ['off'], // CLI tool needs to exit

    // TypeScript rules
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
    'unicorn/no-nested-ternary': 'warn',
    'unicorn/prefer-ternary': 'off', // Allow if-else for readability in CLI
    'unicorn/no-process-exit': 'off', // CLI tool needs to exit
  },
  ignorePatterns: ['lib/', 'node_modules/', '*.js', '*.config.js'],
}
