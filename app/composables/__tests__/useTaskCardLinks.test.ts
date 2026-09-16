// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { useTaskCardLinks } from '@/composables/useTaskCardLinks';
import type { Task } from '@/types/tarkov';
mockNuxtImport('useRouter', () => () => ({ resolve: () => ({ href: '/tasks' }) }));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({ playerLevel: () => 15, getCurrentGameMode: () => 'pve' }),
}));
vi.mock('@/composables/useWikiLink', () => ({
  useWikiLink: () => ({ toWikiUrl: (url: string) => url }),
}));
describe('task data issue context', () => {
  it('includes declared trader requirements and unsupported requirement diagnostics', () => {
    const task: Task = {
      id: 'quest',
      name: 'Quest',
      minPlayerLevel: 10,
      normalizedTraderRequirements: [
        {
          id: 'rep',
          trader: { id: 'prapor', name: 'Prapor' },
          requirementType: 'reputation',
          compareMethod: '>=',
          value: 0.5,
        },
        { id: 'unsupported', requirementType: 'unknown', reason: 'type' },
      ],
    };
    const links = useTaskCardLinks({ task: () => task, objectives: () => [{ id: 'objective' }] });
    const url = new URL(links.getTaskDataIssueUrl());
    expect(url.searchParams.get('description')).toContain(
      'Trader requirement: Prapor reputation >= 0.5'
    );
    expect(url.searchParams.get('description')).toContain(
      'Unsupported requirement: unsupported (type)'
    );
    expect(url.searchParams.get('description')).toContain('USER MODE: PVE');
  });
});
