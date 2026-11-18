import { afterEach, expect, it, vi } from 'vitest';
import { loadItemChecklist } from '@/server/utils/loadItemChecklist';
const item = { id: 'med', name: 'Medicine' };
const objective = {
  id: 'give',
  type: 'giveItem',
  items: [item, { id: 'other' }],
  count: 3,
  description: 'Hand over any medicine',
  foundInRaid: true,
  optional: true,
};
function mockCatalogs(tasks = [{ id: 'quest', objectives: [objective] }]) {
  const catalogs: Record<string, unknown> = {
    'tasks-core': { tasks: [{ id: 'quest', name: 'First Aid', factionName: 'USEC' }] },
    'tasks-objectives': { tasks },
    'items-lite': { items: [item] },
    hideout: {
      hideoutStations: [
        {
          id: 'station',
          name: 'Medstation',
          levels: [{ id: 'level', level: 2, itemRequirements: [{ id: 'req', item, count: 5 }] }],
        },
      ],
    },
  };
  vi.stubGlobal(
    '$fetch',
    vi.fn(async (url: string) => ({
      data: catalogs[new URL(url).pathname.split('/').at(-1)!],
    }))
  );
}
afterEach(() => vi.unstubAllGlobals());
it('preserves pooled quantities, optional objectives and station-level costs', async () => {
  mockCatalogs();
  const checklist = await loadItemChecklist();
  expect(checklist.tasks).toMatchObject([
    {
      id: 'quest',
      faction: 'USEC',
      rows: [{ name: objective.description, count: 3, optional: true, fir: true }],
    },
  ]);
  expect(checklist.hideout).toMatchObject([
    { source: 'Medstation', level: 2, rows: [{ name: 'Medicine', count: 5 }] },
  ]);
});
it('rejects a half-empty public reference', async () => {
  mockCatalogs([]);
  await expect(loadItemChecklist()).rejects.toThrow('Empty public item checklist');
});
