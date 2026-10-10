import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Tanpa eslint-plugin-react, komponen yang hanya dipakai di JSX diawali huruf kapital
      // (atau `m`, komponen ringan Motion for React yang dipakai sebagai <m.div>).
      'no-unused-vars': ['error', { varsIgnorePattern: '^(?:[A-Z_]|m$)', argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Modul konfigurasi route (bukan modul komponen), aman diabaikan untuk fast refresh.
    files: ['src/routes.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['vite.config.js', 'playwright.config.js', 'scripts/**/*.js', 'e2e/**/*.js', 'src/test/**/*.js', 'src/**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
