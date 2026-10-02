import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(map.get('app/components/ui/GameItem.vue')).toEqual(['GameItem', 'LazyGameItem']);
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
      {
        executable: 'pnpm',
        args: ['exec', 'vitest', 'run', './app/a.test.ts', './scripts/ci/e.test.mjs'],
      },
      {
        executable: 'pnpm',
        args: [
          'exec',
          'vitest',
          'run',
          '--config',
          'workers/api-gateway/vitest.config.ts',
          './src/__tests__/b.test.ts',
        ],
      },
      { executable: 'node', args: ['--test', '--', './scripts/workflow-tests/c.mjs'] },
      { executable: 'deno', args: ['test', './supabase/functions/_shared/d.deno.test.ts'] },
    ]);
  });
  it('preserves inert filenames as separate arguments instead of shell text', () => {
    const paths = [
      'app/space name.test.ts',
      "app/single'quote.test.ts",
      'app/double"quote.test.ts',
      'app/$(inert).test.ts',
      'app/semi;and&pipe|.test.ts',
      '-leading.test.ts',
    ];
    expect(testCommands(paths)).toEqual([
      { executable: 'pnpm', args: ['exec', 'vitest', 'run', ...paths.map((path) => `./${path}`)] },
    ]);
    for (const prefix of [
      'workers/api-gateway/',
      'scripts/workflow-tests/',
      'supabase/functions/',
    ]) {
      const filename = "space 'quote' $(inert);&-file";
      const extension = prefix === 'supabase/functions/' ? '.deno.test.ts' : '.test.mjs';
      const [command] = testCommands([`${prefix}${filename}${extension}`]);
      const operand = prefix === 'workers/api-gateway/' ? '' : prefix;
      expect(command.args.at(-1)).toBe(`./${operand}${filename}${extension}`);
      expect(typeof command.executable).toBe('string');
    }
  });
  it('keeps Deno file selection before its script-argument delimiter', () => {
    const [command] = testCommands(['-selected space.deno.test.ts']);
    expect(command).toEqual({
      executable: 'deno',
      args: ['test', './-selected space.deno.test.ts'],
    });
  });
  it.skipIf(!process.env.DENO_EXECUTABLE)('runs only the selected Deno fixture', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'change-brief-deno-'));
    const selected = '-selected space.deno.test.ts';
    const other = 'other.deno.test.ts';
    writeFileSync(
      join(cwd, selected),
      'Deno.test("selected", () => { if (Deno.args.length) throw new Error("unexpected script args"); });'
    );
    writeFileSync(
      join(cwd, other),
      'Deno.test("unselected", () => { throw new Error("unselected file ran"); });'
    );
    try {
      const [command] = testCommands([selected]);
      const output = execFileSync(process.env.DENO_EXECUTABLE, command.args, {
        cwd,
        encoding: 'utf8',
        shell: false,
        timeout: 10000,
      });
      expect(output).toContain('1 passed');
      expect(output).not.toContain('unselected');
    } finally {
      unlinkSync(join(cwd, selected));
      unlinkSync(join(cwd, other));
      rmdirSync(cwd);
    }
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
  it('selects typecheck for every TypeScript extension', () => {
    for (const path of ['app/a.tsx', 'shared/b.mts', 'shared/c.cts']) {
      expect(validationFor([path]).commands).toContain('pnpm run typecheck');
    }
    expect(validationFor(['scripts/ci/x.mjs']).commands).not.toContain('pnpm run typecheck');
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
  it('includes the exact gateway contract checks for targets and affected consumers', () => {
    const required = [
      'pnpm --filter api-gateway run types:check',
      'pnpm --filter api-gateway exec wrangler deploy --config wrangler.toml --dry-run',
    ];
    const gateway = 'workers/api-gateway/src/utils/gameMode.ts';
    for (const [paths, affected] of [
      [[gateway], [gateway]],
      [['shared/utils/seasonNumber.ts'], ['shared/utils/seasonNumber.ts', gateway]],
    ]) {
      const checks = validationFor(paths, affected).scoped.join('\n');
      for (const command of required) expect(checks).toContain(command);
    }
  });
});
describe('buildBrief', () => {
  it('finds lazy-only templates in PascalCase and kebab-case', async () => {
    const io = fakeIo({ reports: { 'app/components/ui/GameItem.vue': trace([]) } });
    const templates = new Map([
      ['app/pages/lazy.vue', '<LazyGameItem />'],
      ['app/pages/kebab.vue', '<lazy-game-item />'],
      ['app/pages/unrelated.vue', '<OtherComponent />'],
    ]);
    io.grepFiles = (args) => {
      const pattern = new RegExp(`\\b(?:${args[2]})\\b`);
      return [...templates].filter(([, text]) => pattern.test(text)).map(([file]) => file);
    };
    const brief = await buildBrief(io, { targets: [{ file: 'app/components/ui/GameItem.vue' }] });
    expect(brief.targets[0].textOnlyConsumers).toEqual([
      'app/pages/lazy.vue',
      'app/pages/kebab.vue',
    ]);
    expect(renderBrief(brief)).toContain('UNVERIFIED');
    expect(brief.uncertainty[0]).toMatch(/component auto-registration.*Confirm each/);
  });
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
      'GameItem|LazyGameItem|game-item|lazy-game-item',
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
      {
        executable: 'pnpm',
        args: [
          'exec',
          'vitest',
          'run',
          '--config',
          'workers/api-gateway/vitest.config.ts',
          './src/__tests__/gameMode.test.ts',
        ],
      },
    ]);
    const text = renderBrief(brief);
    expect(text).toContain('Executable/argv records (JSON data; do not paste into a shell');
    expect(text).toContain(JSON.stringify(brief.tests.broaderCommands[0]));
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
  it.each(['docs/api.md', 'app/locales/de.json'])(
    'does not search for owning docs without code targets in a %s diff',
    async (changedPath) => {
      const io = fakeIo({ grepLines: ['docs/unrelated.md:12:*.md'] });
      const brief = await buildBrief(io, {
        targets: [],
        changedPaths: [changedPath],
        base: 'origin/main',
      });
      expect(brief.docs).toEqual([]);
      expect(
        io.calls.filter((call) => call.kind === 'lines' && call.specs.includes('*.md'))
      ).toEqual([]);
    }
  );
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
