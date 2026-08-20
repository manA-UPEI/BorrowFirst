const js = require('@eslint/js');

// Node built-ins and browser globals are listed explicitly rather than pulling in
// the `globals` package for two short lists.
const NODE_GLOBALS = {
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  global: 'writable',
  module: 'writable',
  process: 'readonly',
  require: 'readonly',
  setImmediate: 'readonly',
  Blob: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly'
};

const BROWSER_GLOBALS = {
  console: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  window: 'readonly',
  localStorage: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  Image: 'readonly',
  FileReader: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  HTMLElement: 'readonly'
};

module.exports = [
  {
    // dist/ is generated; src/ is TypeScript and is already checked by `tsc -p
    // tsconfig.json`, which runs ahead of the tests.
    ignores: ['dist/**', 'node_modules/**', 'src/**']
  },
  {
    files: ['server/**/*.js', 'scripts/**/*.js', 'server.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: NODE_GLOBALS
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^(next|unused)', caughtErrors: 'none' }]
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^(next|unused)', caughtErrors: 'none' }]
    }
  },
  {
    files: ['public/js/**/*.js', 'public/js/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: BROWSER_GLOBALS
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^unused', caughtErrors: 'none' }]
    }
  }
];
