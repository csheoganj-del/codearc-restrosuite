// eslint.config.js — ESLint v9/v10 flat config (no external plugins required)
// Uses only ESLint's built-in rules. All deps are already bundled with eslint@10.

'use strict';

// Built-in browser + Node globals defined inline (no 'globals' package needed)
const BROWSER_GLOBALS = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  location: 'readonly', history: 'readonly', console: 'readonly',
  setTimeout: 'readonly', setInterval: 'readonly', clearTimeout: 'readonly',
  clearInterval: 'readonly', fetch: 'readonly', URL: 'readonly',
  URLSearchParams: 'readonly', FormData: 'readonly', Headers: 'readonly',
  Request: 'readonly', Response: 'readonly', Event: 'readonly',
  CustomEvent: 'readonly', EventTarget: 'readonly', AbortController: 'readonly',
  AbortSignal: 'readonly', Promise: 'readonly', Map: 'readonly', Set: 'readonly',
  WeakMap: 'readonly', WeakSet: 'readonly', Symbol: 'readonly', Proxy: 'readonly',
  Reflect: 'readonly', Int8Array: 'readonly', Uint8Array: 'readonly',
  Uint8ClampedArray: 'readonly', Int16Array: 'readonly', Uint16Array: 'readonly',
  Int32Array: 'readonly', Uint32Array: 'readonly', Float32Array: 'readonly',
  Float64Array: 'readonly', BigInt64Array: 'readonly', BigUint64Array: 'readonly',
  ArrayBuffer: 'readonly', SharedArrayBuffer: 'readonly', DataView: 'readonly',
  Blob: 'readonly', File: 'readonly', FileReader: 'readonly',
  MutationObserver: 'readonly', IntersectionObserver: 'readonly',
  PerformanceObserver: 'readonly',
  ResizeObserver: 'readonly', requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly', localStorage: 'readonly',
  sessionStorage: 'readonly', indexedDB: 'readonly', crypto: 'readonly',
  performance: 'readonly', queueMicrotask: 'readonly',
  structuredClone: 'readonly', atob: 'readonly', btoa: 'readonly',
  alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
  matchMedia: 'writable', AudioContext: 'readonly', webkitAudioContext: 'readonly',
  caches: 'readonly', self: 'readonly', importScripts: 'readonly',
  // RestroSuite runtime globals
  RS_API: 'readonly', RS_AUTH: 'readonly', RSActionFeedback: 'readonly',
  RSLicense: 'readonly', RSSkel: 'readonly', supabase: 'readonly',
  CONFIG: 'readonly', RS: 'readonly', RS_DB: 'readonly', RSModal: 'readonly',
  RSRecipeUnits: 'readonly', RSOps: 'readonly', RSReceipt: 'readonly',
  RS_SYNC: 'readonly', RSMenuIntel: 'readonly', RSSecurityShield: 'readonly',
  RSViewMode: 'readonly', RSInventoryBatches: 'readonly', RSReportPdf: 'readonly',
  RSKitchenLinkCoach: 'readonly', RSWaQueue: 'readonly', RSPinModal: 'readonly',
  RSPOS: 'readonly', RSOpsMode: 'readonly', RS_SETTINGS: 'readonly',
  RSStaffTableScanner: 'readonly', RSProgress: 'readonly', RSPrintBridge: 'readonly',
  INVENTORY: 'readonly', RSPosUI: 'readonly', RSTaxCountry: 'readonly',
  AndroidInterface: 'readonly', RSAmend: 'readonly', RSReceiptEngine: 'readonly',
  RSXlsxLite: 'readonly', RSInventoryToolbar: 'readonly', RSInventoryLedger: 'readonly',
  RSLanSync: 'readonly', RSInventoryUI: 'readonly', RSServiceAlerts: 'readonly',
  RS_SAAS: 'readonly', Image: 'readonly', RS_getTenantTaxProfile: 'readonly',
  RS_ROLE_DEFAULTS: 'readonly', RS_getOutletLocale: 'readonly',
  RS_getOutletTimezone: 'readonly', EventSource: 'readonly', playChime: 'readonly',
  activateTab: 'readonly', BarcodeDetector: 'readonly', TextEncoder: 'readonly',
  RS10: 'readonly',
};

const NODE_GLOBALS = {
  process: 'readonly', require: 'readonly', module: 'writable',
  exports: 'writable', __dirname: 'readonly', __filename: 'readonly',
  Buffer: 'readonly', global: 'readonly', setImmediate: 'readonly',
  clearImmediate: 'readonly',
};

// Full strict rule set — same rules as in .eslintrc.json but in flat-config shape
const STRICT_RULES = {
  // ── Definite bugs ──────────────────────────────────────────────────────
  'no-irregular-whitespace':     'error',
  'no-unreachable':              'error',
  'no-duplicate-case':           'error',
  'no-undef':                    'error',
  'no-dupe-keys':                'error',
  'no-dupe-args':                'error',
  'no-dupe-else-if':             'error',
  'no-self-assign':              'error',
  'no-self-compare':             'error',
  'no-sparse-arrays':            'error',
  'no-template-curly-in-string': 'error',
  'no-unexpected-multiline':     'error',
  'no-import-assign':            'error',
  'use-isnan':                   'error',
  'valid-typeof':                ['error', { requireStringLiterals: true }],
  'no-constant-condition':       ['error', { checkLoops: false }],
  'no-loss-of-precision':        'error',
  'no-promise-executor-return':  'error',
  // ── Warnings ────────────────────────────────────────────────────────────
  'no-unused-vars':    ['warn', { vars: 'all', args: 'none', ignoreRestSiblings: true, caughtErrors: 'none' }],
  'no-empty':          ['warn', { allowEmptyCatch: true }],
  'no-extra-semi':      'warn',
  'no-extra-boolean-cast': 'warn',
  'no-useless-escape':  'warn',
  'no-useless-return':  'warn',
  'no-useless-concat':  'warn',
  'no-useless-rename':  'warn',
  // ── Best practices ────────────────────────────────────────────────────
  'eqeqeq':            ['error', 'always', { null: 'ignore' }],
  'curly':             ['error', 'all'],
  'no-var':             'error',
  'prefer-const':      ['warn', { destructuring: 'any' }],
  'no-implicit-globals': 'error',
  'no-implicit-coercion': ['warn', { boolean: false, string: true, number: true }],
  'no-eval':            'error',
  'no-implied-eval':    'error',
  'no-new-func':        'error',
  'no-extend-native':   'error',
  'no-param-reassign': ['warn', { props: false }],
  'no-console':        ['warn', { allow: ['warn', 'error', 'info'] }],
  'no-alert':           'warn',
  'default-case':       'warn',
  'no-fallthrough':     'error',
  'no-use-before-define': ['warn', { functions: false, classes: true, variables: true }],
  'radix':              'error',
  'yoda':              ['warn', 'never'],
  // ── Async / Promise ───────────────────────────────────────────────────
  'no-async-promise-executor': 'error',
  'no-await-in-loop':           'warn',
  'require-atomic-updates':     'warn',
  // ── Style ────────────────────────────────────────────────────────────
  'no-trailing-spaces':    'warn',
  'no-multiple-empty-lines': ['warn', { max: 3, maxEOF: 1 }],
  'eol-last':  ['warn', 'always'],
  'semi':      ['warn', 'always'],
  'quotes':    ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: false }],
};

/** @type {import('eslint').Linter.FlatConfig[]} */
const config = [
  // ── Ignore generated / vendored paths ───────────────────────────────────
  {
    ignores: [
      'publish-static/**', 'assets/dist/**', 'assets/lib/**',
      'assets/qrcode.min.js', 'node_modules/**', '.wwebjs_auth/**',
      '.wwebjs_cache/**', 'android-app/**', 'desktop/**', '.gemini/**',
    ],
  },

  // ── Default: browser + Node globals, strict rules ───────────────────────
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...BROWSER_GLOBALS, ...NODE_GLOBALS },
    },
    rules: STRICT_RULES,
  },

  // ── Gateway + scripts — console is the logger ──────────────────────────
  {
    files: [
      'whatsapp-gateway.js', 'ngrok-service.js', 'gateway-modules/**/*.js',
      'scripts/**/*.cjs', 'scripts/**/*.js',
      'api/**/*.js', 'tests/**/*.cjs',
    ],
    languageOptions: {
      // CJS files: Node wraps each file in a function, so top-level function
      // declarations are NOT globals. 'commonjs' sourceType tells ESLint that.
      sourceType: 'commonjs',
    },
    rules: {
      'no-console':        'off',
      'no-var':            'warn',
      'no-param-reassign': 'off',
      // no-implicit-globals is a false-positive in CJS (Node module wrapper)
      'no-implicit-globals': 'off',
    },
  },

  // ── Test files ─────────────────────────────────────────────────────────
  {
    files: ['tests/**/*.cjs', 'tests/**/*.js'],
    rules: { 'no-unused-vars': 'off', 'prefer-const': 'off' },
  },

  // ── Vercel API routes + middleware (ESM) ─────────────────────────────
  {
    files: ['api/**/*.js', 'middleware.js'],
    languageOptions: { sourceType: 'module' },
  },
];

module.exports = config;
