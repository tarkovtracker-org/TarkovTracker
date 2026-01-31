// @ts-check
import importX from 'eslint-plugin-import-x'
import withNuxt from './.nuxt/eslint.config.mjs'
// import-x targets ESLint v8; its rule typings don't line up with ESLint v9 flat config types.
// Cast via unknown to Plugin so @ts-check doesn't complain while keeping runtime behaviour the same.
// The intermediate unknown avoids TS2352 about structural mismatch.
const importXPlugin = /** @type {import('eslint').ESLint.Plugin} */ (/** @type {unknown} */ (importX))
export default withNuxt({
  ignores: [
    'supabase/functions/**', // Deno code, not Node.js - different linting rules apply
  ],
  plugins: {
    'import-x': importXPlugin,
  },
  rules: {
    // Soften migration noise from legacy codebase; tighten later as we refactor
    'vue/html-self-closing': 'off',
    'prefer-const': 'warn',
    'no-var': 'warn',
    // Keep visual noise down; no blank lines anywhere
    'no-multiple-empty-lines': ['warn', { max: 0, maxBOF: 0, maxEOF: 0 }],
    // Block parent relative imports (use @/ aliases instead)
    'import-x/no-relative-parent-imports': 'error',
    // Import order with zero blank lines between groups
    'import-x/order': ['warn', {
      'newlines-between': 'never',
      alphabetize: { order: 'asc', caseInsensitive: true },
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
      pathGroups: [
        { pattern: '@/**', group: 'internal', position: 'before' },
      ],
      pathGroupsExcludedImportTypes: ['builtin'],
    }],
  },
})
