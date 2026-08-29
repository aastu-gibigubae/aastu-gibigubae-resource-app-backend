import js from '@eslint/js';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'generated/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],

    rules: {
      'no-console': 'off',
    },
  },
];