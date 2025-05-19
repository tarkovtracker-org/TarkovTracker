import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueEslintParser from 'vue-eslint-parser';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  // Global ignores. ESLint ignores node_modules and dotfiles by default.
  {
    ignores: [
      '**/dist/**',
      '**/lib/**',
      'frontend/public/**', // Static assets, images, etc.
      'frontend/.output/**',
      'docs/openapi.json',
      'docs/openapi.js',
      'functions/vitest.config.js',
      'node_modules/**',
    ],
  },
  // Configuration for the 'functions' directory
  {
    files: ['functions/**/*.ts', 'functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parser: tseslint.parser,
      parserOptions: {
        project: './functions/tsconfig.json', // Path relative to eslint.config.js (root)
        tsconfigRootDir: '.',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      // Custom rules from functions/.eslintrc.js, overriding if necessary
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
      'require-jsdoc': 'off',
      'valid-jsdoc': 'off',
      'new-cap': 'off',
      'max-len': ['warn', { code: 120 }],
    },
  },
  // --- Configuration for the 'frontend' directory ---

  // Base JS configuration (applies to .js, .ts, .vue unless overridden)
  {
    files: ['frontend/**/*.{js,ts,vue}'],
    ...js.configs.recommended, // Spread rules and other base JS settings
    languageOptions: {
      // Define globals and JS features for frontend
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node, // Note: Node globals might be too broad; refine if necessary
      },
    },
  },

  // TypeScript configuration for .ts and .js files in frontend
  // This uses tseslint.parser for these files.
  {
    files: ['frontend/**/*.{ts,js}'], // Explicitly target .ts and .js, NOT .vue here
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './frontend/tsconfig.json',
        tsconfigRootDir: '.',
        sourceType: 'module',
      },
    },
    rules: {
      // Spread all rule objects from tseslint.configs.recommended
      // tseslint.configs.recommended is an array of config objects
      ...tseslint.configs.recommended.reduce((acc, config) => ({ ...acc, ...config.rules }), {}),
    },
  },

  // Vue configuration using eslint-plugin-vue's flat config
  // This sets up vue-eslint-parser for .vue files and integrates with TypeScript for <script> blocks.
  // pluginVue.configs['flat/vue3-recommended'] is an array, so spread it.
  ...pluginVue.configs['flat/vue3-recommended'].map((config) => ({
    ...config,
    files: ['frontend/**/*.vue'], // Ensure it's scoped to frontend .vue files
    // Ensure parser options for TypeScript within <script lang="ts"> are set
    // The flat/vue3-recommended should handle most of this, but explicit options can be merged if needed.
    languageOptions: {
      ...config.languageOptions, // Preserve existing languageOptions from flat/vue3-recommended
      parserOptions: {
        ...(config.languageOptions?.parserOptions || {}),
        parser: tseslint.parser, // This is for <script lang="ts"> blocks, vue-eslint-parser delegates
        project: './frontend/tsconfig.json',
        tsconfigRootDir: '.',
        extraFileExtensions: ['.vue'], // Important for TS to understand .vue files
        sourceType: 'module',
      },
    },
    plugins: {
      // Ensure vue and typescript plugins are correctly referenced
      ...config.plugins,
      '@typescript-eslint': tseslint.plugin, // Ensure TS plugin is available for Vue SFCs
    },
  })),

  // Prettier config - should be last to override styling rules
  {
    files: ['frontend/**/*.{ts,js,vue}'], // Apply to all relevant frontend files
    ...eslintConfigPrettier,
  },

  // Custom rule overrides for frontend (applied after all presets)
  {
    files: ['frontend/**/*.{ts,js,vue}'],
    rules: {
      'no-debugger': 'off',
      'no-unused-vars': 'off', // Disable base rule, prefer @typescript-eslint/no-unused-vars
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'max-len': ['warn', { code: 100 }],
      // Vue specific overrides can go here too
      // e.g. 'vue/no-v-html': 'off'
    },
  },

  // Configuration for JS files directly under frontend (e.g., vite.config.js if it were there)
  // This was present in the original config; keeping its spirit if applicable.
  {
    files: ['frontend/*.js', 'frontend/*.cjs', 'frontend/*.mjs'],
    languageOptions: {
      // Assuming CommonJS for .js/.cjs unless .mjs implies ESM
      // sourceType: 'script', // Or 'module' for .mjs
      globals: {
        ...globals.node, // These are typically Node-based config files
      },
    },
    // No TS/Vue specific plugins here unless these root files actually use them.
  },
];
