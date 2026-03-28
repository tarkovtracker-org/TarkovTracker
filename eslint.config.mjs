// @ts-check
import importX from 'eslint-plugin-import-x';
import withNuxt from './.nuxt/eslint.config.mjs';
// import-x targets ESLint v8; its rule typings don't line up with ESLint v9 flat config types.
// Cast via unknown to Plugin so @ts-check doesn't complain while keeping runtime behaviour the same.
// The intermediate unknown avoids TS2352 about structural mismatch.
const importXPlugin = /** @type {import('eslint').ESLint.Plugin} */ (
  /** @type {unknown} */ (importX)
);
// Target: Vue 3.5+ / Nuxt 4.3+ (see package.json dependencies).
const AUTO_VUE_IMPORT_NAMES = [
  'Component',
  'ComponentPublicInstance',
  'ComputedRef',
  'DirectiveBinding',
  'ExtractDefaultPropTypes',
  'ExtractPropTypes',
  'ExtractPublicPropTypes',
  'InjectionKey',
  'MaybeRef',
  'MaybeRefOrGetter',
  'PropType',
  'Ref',
  'VNode',
  'WritableComputedRef',
  'computed',
  'customRef',
  'defineAsyncComponent',
  'defineComponent',
  'effect',
  'effectScope',
  'getCurrentInstance',
  'getCurrentScope',
  'h',
  'hasInjectionContext',
  'inject',
  'isProxy',
  'isReactive',
  'isReadonly',
  'isRef',
  'isShallow',
  'markRaw',
  'nextTick',
  'onActivated',
  'onBeforeMount',
  'onBeforeUnmount',
  'onBeforeUpdate',
  'onDeactivated',
  'onErrorCaptured',
  'onMounted',
  'onRenderTracked',
  'onRenderTriggered',
  'onScopeDispose',
  'onServerPrefetch',
  'onUnmounted',
  'onUpdated',
  'onWatcherCleanup',
  'provide',
  'proxyRefs',
  'reactive',
  'readonly',
  'ref',
  'resolveComponent',
  'shallowReactive',
  'shallowReadonly',
  'shallowRef',
  'toRaw',
  'toRef',
  'toRefs',
  'toValue',
  'triggerRef',
  'unref',
  'useAttrs',
  'useCssModule',
  'useCssVars',
  'useId',
  'useModel',
  'useShadowRoot',
  'useSlots',
  'useTemplateRef',
  'useTransitionState',
  'watch',
  'watchEffect',
  'watchPostEffect',
  'watchSyncEffect',
  'withCtx',
  'withDirectives',
  'withKeys',
  'withMemo',
  'withModifiers',
  'withScopeId',
];
const AUTO_VUE_IMPORT_NAMES_WITHOUT_REF = AUTO_VUE_IMPORT_NAMES.filter((name) => name !== 'Ref');
export default withNuxt(
  {
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
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Keep visual noise down; no blank lines anywhere
      'no-multiple-empty-lines': ['warn', { max: 0, maxBOF: 0, maxEOF: 0 }],
      // Block parent relative imports (use @/ aliases instead)
      'import-x/no-relative-parent-imports': 'error',
      // Import order: builtin → external → internal → parent → sibling → index → object → type
      // (Keep in sync with CLAUDE.md, AGENTS.md, GEMINI.md)
      'import-x/order': [
        'warn',
        {
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          pathGroups: [
            { pattern: '#imports', group: 'internal', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'before' },
          ],
          pathGroupsExcludedImportTypes: ['builtin', 'type'],
        },
      ],
    },
  },
  {
    files: ['app/**/*.{js,jsx,ts,tsx,vue}'],
    ignores: ['app/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vue',
              importNames: AUTO_VUE_IMPORT_NAMES,
              message: 'Use Nuxt auto-imports instead of importing from vue.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['app/composables/useMapResize.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vue',
              importNames: AUTO_VUE_IMPORT_NAMES_WITHOUT_REF,
              message: 'Use Nuxt auto-imports instead of importing from vue.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['app/**/*.vue'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'vue/no-unused-vars': 'error',
    },
  }
);
