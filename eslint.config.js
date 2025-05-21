import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  // Global ignores. ESLint ignores node_modules and dotfiles by default.
  {
    ignores: [
      '**/dist/**',
      '**/lib/**',
      'frontend/public/**',
      'frontend/.output/**',
      'docs/openapi.json',
      'docs/openapi.js',
      'functions/vitest.config.js',
      'node_modules/**',
    ],
  },
  // Configuration for JS test files in functions/test (must come before the main functions config)
  {
    files: ['functions/test/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    // No TypeScript plugin or rules for plain JS test files
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'max-len': ['warn', { code: 120 }],
    },
  },
  // Configuration for the 'functions' directory
  {
    files: ['functions/**/*.ts', 'functions/**/*.js'],
    ignores: ['functions/test/**/*.js'],
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
  // Configuration for the 'frontend' directory
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
    files: ['frontend/src/**/*.{ts,js}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './frontend/tsconfig.eslint.json',
        tsconfigRootDir: '.',
        sourceType: 'module',
      },
    },
    rules: {
      ...tseslint.configs.recommended.reduce((acc, config) => ({ ...acc, ...config.rules }), {}),
    },
  },
  // Configuration for frontend root TypeScript files (e.g., vite.config.ts)
  {
    files: ['frontend/*.ts'], // Specifically targets files like vite.config.ts in frontend root
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Vite config runs in Node.js environment
        ...globals.node,
        ...globals.es2022,
      },
      parser: tseslint.parser,
      parserOptions: {
        project: './frontend/tsconfig.json', // Assumes vite.config.ts is covered by this tsconfig
        tsconfigRootDir: '.', // Consistent with how other tsconfigs are referenced
        sourceType: 'module',
      },
    },
    rules: {
      // Start with recommended TypeScript rules
      ...tseslint.configs.recommended.reduce((acc, config) => ({ ...acc, ...config.rules }), {}),
      // Common overrides for config files
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // You might need to add other specific rules, for example, to allow devDependencies:
      // 'import/no-extraneous-dependencies': ['error', { 'devDependencies': true, 'optionalDependencies': false }],
    },
  },
  // Vue configuration using eslint-plugin-vue's flat config
  // This sets up vue-eslint-parser for .vue files and integrates with TypeScript for <script> blocks.
  // pluginVue.configs['flat/recommended'] is an array, so spread it.
  ...(pluginVue.configs['flat/recommended'] || []).map((config) => ({
    ...config,
    files: ['frontend/**/*.vue'], // Ensure it's scoped to frontend .vue files
    // Ensure parser options for TypeScript within <script lang="ts"> are set
    // The flat/recommended should handle most of this, but explicit options can be merged if needed.
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...(config.languageOptions?.parserOptions || {}),
        parser: tseslint.parser,
        project: './frontend/tsconfig.eslint.json',
        tsconfigRootDir: '.',
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
    plugins: {
      ...config.plugins,
      '@typescript-eslint': tseslint.plugin,
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
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-debugger': 'off',
      'no-unused-vars': 'off', // Disable base ESLint rule
      'vue/no-unused-vars': 'off', // Disable Vue's version to rely on TypeScript's for script blocks
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'max-len': ['warn', { code: 100 }],
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
        ...globals.node,
      },
    },
  },
];
