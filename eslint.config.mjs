import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const IGNORED = [
  '**/node_modules/**',
  '**/dist/**',
  'backend/uploads/**',
  'backups/**',
  'scratch/**',
  'docs/**',
  '.workbuddy-ai/**'
];

// Aturan berikut sengaja diset `warn`, bukan `error`, supaya lint bisa dipasang
// sekarang tanpa memblokir pekerjaan yang sedang berjalan. Naikkan ke `error`
// setelah kode bersih (lihat docs/siaga-improvement-plan.md, Fase 1.3).
const softRules = {
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-undef': 'warn',
  'no-console': 'off'
};

export default [
  { ignores: IGNORED },

  // Backend + skrip: Node, CommonJS
  {
    files: ['backend/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: { ...js.configs.recommended.rules, ...softRules }
  },

  // Frontend: browser, ESM, React + JSX
  {
    files: ['frontend/src/**/*.{js,jsx}', 'frontend/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 }
    },
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs['recommended-latest'].rules,
      ...softRules,
      'react/prop-types': 'off',
      // Stilistik: React merender `"` di teks JSX dengan benar. Diturunkan ke
      // `warn` agar tidak memaksa suntingan di file besar yang akan dipecah.
      'react/no-unescaped-entities': 'warn',
      'react-refresh/only-export-components': 'warn'
    }
  }
];
