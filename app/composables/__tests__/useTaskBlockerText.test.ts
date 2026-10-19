import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { useTaskBlockerText } from '@/composables/useTaskBlockerText';
const en = JSON.parse(readFileSync('app/locales/en.json', 'utf8'));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    tasks: [{ id: 'prior', name: 'Prior quest' }],
    storyChapters: [{ id: 'story', name: 'Story route' }],
    traders: [{ id: 'mechanic', name: 'Mechanic' }],
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params: Record<string, string> = {}) => {
      const template = key
        .split('.')
        .reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], en) as string;
      return template.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? name);
    },
  }),
}));
describe('canonical blocker text', () => {
  it('uses the same named pool instruction for dashboard blockers', () => {
    expect(
      useTaskBlockerText()({
        type: 'global_variable_unknown',
        required: 3,
        compareMethod: '>=',
        taskPool: {
          traderId: 'mechanic',
          loyaltyLevel: 2,
          verification: 'unresolved',
          coverage: 'partial',
          derivation: { type: 'distinctTaskCompletions', taskIds: ['a'] },
        },
      })
    ).toBe(
      'Complete at least 3 LL2 tasks for Mechanic · Progress unverified · If this task is already available in-game, use Mark available. This does not complete any pool tasks.'
    );
  });
  it('names the trader and exact storyline unlock objective', () => {
    expect(
      useTaskBlockerText()({
        type: 'trader_unlock',
        trader: { id: 'prapor', name: 'Prapor' },
        chapterIds: ['story'],
        objective: { id: 'open', name: 'Hand over weapons to Mechanic' },
      })
    ).toBe('Unlock Prapor: Hand over weapons to Mechanic (Story route)');
  });
  it.each([
    [[], 'completed'],
    [['Complete', 'Failed'], 'completed or failed'],
    [['Accepted'], 'accepted'],
    [['Failed'], 'failed'],
  ])('shows the accepted statuses %j', (status, expected) => {
    const text = useTaskBlockerText()({
      type: 'prerequisite',
      requirements: [{ task: { id: 'prior' }, status: status as string[] }],
    });
    expect(text).toContain(`Prior quest (${expected})`);
  });
  it('explains a story alternative without losing the quest status', () => {
    expect(
      useTaskBlockerText()({
        type: 'prerequisite',
        requirements: [{ task: { id: 'prior' }, status: ['failed'] }],
        chapterIds: ['story'],
      })
    ).toContain('Prior quest (failed), or progress one of these story chapters: Story route');
  });
  it.each([
    [
      { type: 'player_level', current: 12, required: 15, compareMethod: '>=' },
      'Requires player level 15+ (you: 12).',
    ],
    [
      {
        type: 'trader_reputation',
        trader: { id: 'fence', name: 'Fence' },
        current: 0.1,
        required: 0.2,
        compareMethod: '>=',
      },
      'Requires Fence reputation 0.20+ (you: 0.10).',
    ],
    [
      { type: 'prestige', current: 0, required: 1, compareMethod: '=' },
      'Requires Prestige 1 (current: 0).',
    ],
    [
      { type: 'task_counter', current: 3, required: 5, compareMethod: '>=' },
      'Complete at least 5 tasks from the required pool · 3/5 tracked',
    ],
  ] as const)('phrases %o comparisons in plain language', (blocker, expected) => {
    const text = useTaskBlockerText()(blocker);
    expect(text).toContain(expected);
    expect(text).not.toMatch(/[<>]=?|!=/);
  });
});
