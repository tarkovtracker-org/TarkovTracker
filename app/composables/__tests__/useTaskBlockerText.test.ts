import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { useTaskBlockerText } from '@/composables/useTaskBlockerText';
const en = JSON.parse(readFileSync('app/locales/en.json', 'utf8'));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    tasks: [{ id: 'prior', name: 'Prior quest' }],
    storyChapters: [{ id: 'story', name: 'Story route' }],
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
  it.each([
    [[], 'completed'],
    [['Complete', 'Failed'], 'completed or failed'],
    [['Accepted'], 'active or accepted'],
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
});
