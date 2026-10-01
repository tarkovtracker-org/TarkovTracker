import { describe, expect, it } from 'vitest';
import {
  buildBrief,
  isTestPath,
  kebabCase,
  parseAutoImportMap,
  parseComponentMap,
  renderBrief,
  scopedInstructions,
  testCommands,
  validationFor,
} from './change-brief-lib.mjs';
const componentsDts = [
  `export const GameItem: typeof import("../app/components/ui/GameItem.vue")['default']`,
  `export const LazyGameItem: LazyComponent<typeof import("../app/components/ui/GameItem.vue")['default']>`,
  `export const NeededItemRow: typeof import("../app/features/neededitems/NeededItemRow.vue")['default']`,
].join('\n');
const importsDts = [
  `export { useWikiLink } from '../app/composables/useWikiLink';`,
  `export { ACTIVE_SEASON, GAME_MODES as MODES } from '../app/utils/constants';`,
  `export { useNuxtApp } from '#app/nuxt';`,
].join('\n');
const trace = (importedBy, transitive = [], exports = []) => ({
  evidence: {
    trace_file: { data: { imported_by: importedBy, exports: exports.map((name) => ({ name })) } },
    trace_export: {
      data: {
        direct_references: importedBy.map((from_file) => ({ from_file, kind: 'named import' })),
      },
    },
    impact_closure: { data: { affected_not_shown: transitive } },
    dead_code: {
      data: {
        workspace_diagnostics: [
          {
            path: 'supabase/functions',
            degrades_analysis: true,
            message: 'undeclared workspace',
          },
        ],
      },
    },
  },
});
const files = [
  'AGENTS.md',
  'workers/api-gateway/AGENTS.md',
  'app/components/ui/GameItem.vue',
  'app/components/ui/__tests__/GameItem.test.ts',
  'app/features/hideout/HideoutRequirement.vue',
  'app/features/neededitems/NeededItemRow.vue',
  'app/features/neededitems/__tests__/NeededItemRow.test.ts',
  'app/features/hideout/__tests__/HideoutRequirement.test.ts',
  'app/pages/__tests__/hideout.page.test.ts',
  'shared/utils/seasonNumber.ts',
  'workers/api-gateway/src/utils/gameMode.ts',
  'workers/api-gateway/src/__tests__/gameMode.test.ts',
];
const fakeIo = ({ reports = {}, grepFiles = [], grepLines = [], generated = true } = {}) => {
  const calls = [];
  return {
    calls,
    inspect: async (target) =>
      reports[target.file] || {
        error: true,
        message: `file '${target.file}' not found in module graph`,
      },
    map: (items, task) => Promise.all(items.map(task)),
    generated: () =>
      generated
        ? {
            present: true,
            components: parseComponentMap(componentsDts),
            autoImports: parseAutoImportMap(importsDts),
          }
        : { present: false, components: null, autoImports: null },
    grepFiles: (args, specs) => {
      calls.push({ kind: 'files', args, specs });
      return grepFiles;
    },
    grepLines: (args, specs) => {
      calls.push({ kind: 'lines', args, specs });
      const docs = specs.includes('*.md');
      return grepLines.filter((line) => line.includes('.md:') === docs);
    },
    listFiles: () => files,
    instructionFiles: () => files.filter((path) => path.endsWith('AGENTS.md')),
  };
};
describe('generated Nuxt declarations', () => {
  it('maps component files to registered and lazy names', () => {
    const map = parseComponentMap(componentsDts);
    expect(map.get('app/components/ui/GameItem.vue')).toEqual(['GameItem']);
    expect(map.get('app/features/neededitems/NeededItemRow.vue')).toEqual(['NeededItemRow']);
  });
  it('maps auto-import modules to exposed names and ignores framework modules', () => {
    const map = parseAutoImportMap(importsDts);
    expect(map.get('app/composables/useWikiLink')).toEqual(['useWikiLink']);
    expect(map.get('app/utils/constants')).toEqual(['ACTIVE_SEASON', 'MODES']);
    expect([...map.keys()].some((key) => key.includes('#app'))).toBe(false);
  });
  it('kebab-cases component names for template matching', () => {
    expect(kebabCase('GameItem')).toBe('game-item');
    expect(kebabCase('UIButton')).toBe('ui-button');
  });
});
describe('path helpers', () => {
  it('classifies test files across runners', () => {
    expect(isTestPath('app/components/ui/__tests__/GameItem.test.ts')).toBe(true);
    expect(isTestPath('scripts/workflow-tests/validation.mjs')).toBe(true);
    expect(isTestPath('scripts/codex-review/codex-review-tests.mjs')).toBe(true);
    expect(isTestPath('scripts/workflow-tests/README.md')).toBe(false);
    expect(isTestPath('app/components/ui/GameItem.vue')).toBe(false);
  });
  it('collects AGENTS.md files on each ancestor chain', () => {
    expect(
      scopedInstructions(
        ['workers/api-gateway/src/utils/gameMode.ts', 'app/utils/x.ts'],
        ['AGENTS.md', 'workers/api-gateway/AGENTS.md', 'supabase/AGENTS.md']
      )
    ).toEqual(['AGENTS.md', 'workers/api-gateway/AGENTS.md']);
  });
  it('groups tests into one command per runner', () => {
    expect(
      testCommands([
        'app/a.test.ts',
        'workers/api-gateway/src/__tests__/b.test.ts',
        'scripts/workflow-tests/c.mjs',
        'supabase/functions/_shared/d.deno.test.ts',
        'scripts/ci/e.test.mjs',
      ])
    ).toEqual([
      'pnpm exec vitest run app/a.test.ts scripts/ci/e.test.mjs',
      'pnpm exec vitest run --config workers/api-gateway/vitest.config.ts src/__tests__/b.test.ts',
      'node --test scripts/workflow-tests/c.mjs',
      'deno test supabase/functions/_shared/d.deno.test.ts',
    ]);
  });
});
describe('validationFor', () => {
  it('keeps the full required checks for executable changes', () => {
    const validation = validationFor(['app/components/ui/GameItem.vue']);
    expect(validation.full).toBe(true);
    expect(validation.previewRequired).toBe(true);
    expect(validation.commands).toEqual([
      'pnpm run lint',
      'pnpm run typecheck',
      'pnpm run lint:fallow',
      'pnpm run format:check',
    ]);
  });
  it('selects reduced checks for documentation and adds scoped checks for affected areas', () => {
    const validation = validationFor(['docs/api.md'], ['docs/api.md', 'supabase/migrations/x.sql']);
    expect(validation.full).toBe(false);
    expect(validation.commands).toEqual(['pnpm run format:check']);
    expect(validation.scoped).toEqual(['supabase/AGENTS.md checks (supabase:check)']);
  });
  it('selects locale and workflow checks from the classifier', () => {
    const commands = validationFor(['app/locales/en.json', '.github/workflows/ci.yml']).commands;
    expect(commands).toContain('pnpm run i18n:check');
    expect(commands).toContain('pnpm run test:workflow');
  });
});
describe('buildBrief', () => {
  it('adds component consumers Fallow cannot see and labels them unverified', async () => {
    const io = fakeIo({
      reports: {
        'app/components/ui/GameItem.vue': trace(
          [
            'app/features/hideout/HideoutRequirement.vue',
            'app/components/ui/__tests__/GameItem.test.ts',
          ],
          ['app/pages/__tests__/hideout.page.test.ts']
        ),
      },
      grepFiles: [
        'app/components/ui/GameItem.vue',
        'app/features/hideout/HideoutRequirement.vue',
        'app/features/neededitems/NeededItemRow.vue',
      ],
    });
    const brief = await buildBrief(io, { targets: [{ file: 'app/components/ui/GameItem.vue' }] });
    const [target] = brief.targets;
    expect(target.consumers).toEqual(['app/features/hideout/HideoutRequirement.vue']);
    expect(target.textOnlyConsumers).toEqual(['app/features/neededitems/NeededItemRow.vue']);
    expect(io.calls.find((call) => call.kind === 'files').args).toEqual([
      '-w',
      '-E',
      'GameItem|game-item',
    ]);
    expect(brief.uncertainty[0]).toMatch(/component auto-registration.*Confirm each/);
    expect(brief.tests.direct).toEqual(['app/components/ui/__tests__/GameItem.test.ts']);
    expect(brief.tests.nearby).toEqual([
      'app/features/hideout/__tests__/HideoutRequirement.test.ts',
    ]);
    expect(brief.tests.transitive).toEqual(['app/pages/__tests__/hideout.page.test.ts']);
  });
  it('reports a symbol’s direct consumers, scoped instructions, and path references', async () => {
    const io = fakeIo({
      reports: {
        'shared/utils/seasonNumber.ts': trace(
          ['workers/api-gateway/src/utils/gameMode.ts'],
          ['workers/api-gateway/src/__tests__/gameMode.test.ts']
        ),
      },
      grepLines: [
        '.github/workflows/ci.yml:          node shared/utils/seasonNumber.ts',
        'docs/systems/progress-storage.md:146:  (`shared/utils/seasonNumber.ts`)',
      ],
    });
    const brief = await buildBrief(io, {
      targets: [{ file: 'shared/utils/seasonNumber.ts', symbol: 'isSeasonNumber' }],
    });
    expect(brief.targets[0].target).toBe('shared/utils/seasonNumber.ts:isSeasonNumber');
    expect(brief.targets[0].consumers).toEqual(['workers/api-gateway/src/utils/gameMode.ts']);
    expect(brief.instructions).toEqual(['AGENTS.md', 'workers/api-gateway/AGENTS.md']);
    expect(brief.pathReferences).toEqual([
      { file: '.github/workflows/ci.yml', references: 'shared/utils/seasonNumber.ts' },
    ]);
    expect(brief.docs).toEqual([{ file: 'docs/systems/progress-storage.md', lines: [146] }]);
    expect(brief.tests.commands).toEqual([]);
    expect(brief.tests.broaderCommands).toEqual([
      'pnpm exec vitest run --config workers/api-gateway/vitest.config.ts src/__tests__/gameMode.test.ts',
    ]);
    expect(brief.validation.scoped[0]).toMatch(/^workers\/api-gateway\/AGENTS\.md checks/);
    expect(brief.uncertainty).toEqual([]);
  });
  it('surfaces Fallow failures, missing generated types, and relevant degraded analysis', async () => {
    const io = fakeIo({
      generated: false,
      reports: { 'supabase/functions/x/index.ts': trace([]) },
    });
    const brief = await buildBrief(io, {
      targets: [{ file: 'app/missing.ts' }, { file: 'supabase/functions/x/index.ts' }],
    });
    expect(brief.uncertainty).toEqual([
      "Fallow could not analyze app/missing.ts: file 'app/missing.ts' not found in module graph",
      'Missing .nuxt/*.d.ts: run `pnpm exec nuxt prepare`; auto-import and component checks were skipped.',
      'Fallow analysis degraded for supabase/functions: undeclared workspace',
    ]);
  });
  it('lists changed non-code paths and plans validation for the whole diff', async () => {
    const io = fakeIo();
    const brief = await buildBrief(io, {
      targets: [],
      changedPaths: ['docs/api.md', 'app/locales/de.json'],
      base: 'origin/main',
    });
    expect(brief.unanalyzedChanges).toEqual(['docs/api.md', 'app/locales/de.json']);
    expect(brief.validation.full).toBe(false);
    expect(renderBrief(brief)).toContain('# Change brief (vs origin/main)');
  });
  it('renders capped lists and always states the graph-wide blind spots', async () => {
    const consumers = Array.from({ length: 15 }, (_, index) => `app/features/f${index}.vue`);
    const io = fakeIo({ reports: { 'shared/utils/seasonNumber.ts': trace(consumers) } });
    const text = renderBrief(
      await buildBrief(io, { targets: [{ file: 'shared/utils/seasonNumber.ts' }] })
    );
    expect(text).toContain('consumers (Fallow graph, 15)');
    expect(text).toContain('… 3 more (--format json)');
    expect(text).not.toContain('app/features/f14.vue');
    expect(text).toMatch(/Never in any graph: runtime string lookups/);
    expect(text).toContain('Advisory only: CI and AGENTS.md remain authoritative.');
  });
});
