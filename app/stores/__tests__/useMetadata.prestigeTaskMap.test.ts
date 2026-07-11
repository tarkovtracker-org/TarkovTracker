import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import type { PrestigeLevel, Task, TaskObjective } from '@/types/tarkov';
const NEW_BEGINNING_TASK_IDS = [
  '6761f28a022f60bb320f3e95',
  '6761ff17cdc36bd66102e9d0',
  '6848100b00afffa81f09e365',
  '68481881f43abfdda2058369',
] as const;
const createCondition = (id: string, name: string): TaskObjective => ({
  id: `cond-${id}`,
  status: ['complete'],
  task: { id, name },
});
const createPrestigeLevel = (
  prestigeLevel: number,
  conditions: TaskObjective[]
): PrestigeLevel => ({
  id: `prestige-${prestigeLevel}`,
  level: prestigeLevel,
  prestigeLevel,
  conditions,
});
describe('useMetadataStore prestigeTaskMap', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  it('maps all New Beginning tiers, including overlay-only prestige 5 and 6 tasks', () => {
    const store = useMetadataStore();
    const collectorCondition = createCondition('5c51aac186f77432ea65c552', 'Collector');
    store.tasks = [
      {
        id: NEW_BEGINNING_TASK_IDS[0],
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning',
      },
      {
        id: NEW_BEGINNING_TASK_IDS[1],
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning',
      },
      {
        id: NEW_BEGINNING_TASK_IDS[2],
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning',
      },
      {
        id: NEW_BEGINNING_TASK_IDS[3],
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning',
      },
      {
        id: 'new_beginning_prestige_5',
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning_(Prestige_5)',
      },
      {
        id: 'new_beginning_prestige_6',
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning_(Prestige_6)',
      },
    ] as Task[];
    store.prestigeLevels = [
      createPrestigeLevel(1, [
        collectorCondition,
        createCondition(NEW_BEGINNING_TASK_IDS[0], 'New Beginning'),
      ]),
      createPrestigeLevel(2, [
        collectorCondition,
        createCondition(NEW_BEGINNING_TASK_IDS[1], 'New Beginning'),
      ]),
      createPrestigeLevel(3, [
        collectorCondition,
        createCondition(NEW_BEGINNING_TASK_IDS[2], 'New Beginning'),
      ]),
      createPrestigeLevel(4, [
        collectorCondition,
        createCondition(NEW_BEGINNING_TASK_IDS[3], 'New Beginning'),
      ]),
      createPrestigeLevel(5, [collectorCondition]),
      createPrestigeLevel(6, [collectorCondition]),
    ];
    const map = store.prestigeTaskMap;
    expect(map.get(NEW_BEGINNING_TASK_IDS[0])).toBe(0);
    expect(map.get(NEW_BEGINNING_TASK_IDS[1])).toBe(1);
    expect(map.get(NEW_BEGINNING_TASK_IDS[2])).toBe(2);
    expect(map.get(NEW_BEGINNING_TASK_IDS[3])).toBe(3);
    expect(map.get('new_beginning_prestige_5')).toBe(4);
    expect(map.get('new_beginning_prestige_6')).toBe(5);
    expect(map.has('5c51aac186f77432ea65c552')).toBe(false);
    expect(map.size).toBe(6);
  });
  it('falls back to prestige conditions when tasks are not loaded yet', () => {
    const store = useMetadataStore();
    store.tasks = [];
    store.prestigeLevels = [
      createPrestigeLevel(1, [
        createCondition('5c51aac186f77432ea65c552', 'Collector'),
        createCondition('6761f28a022f60bb320f3e95', 'New Beginning'),
      ]),
    ];
    const map = store.prestigeTaskMap;
    expect(map.get('6761f28a022f60bb320f3e95')).toBe(0);
    expect(map.has('5c51aac186f77432ea65c552')).toBe(false);
    expect(map.size).toBe(1);
  });
  it('infers user prestige level from New Beginning wiki links when no prestige condition exists', () => {
    const store = useMetadataStore();
    store.tasks = [
      {
        id: 'custom-new-beginning-tier',
        name: 'Quest Name Varies',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning_(Prestige_5)',
      },
    ] as Task[];
    store.prestigeLevels = [];
    const map = store.prestigeTaskMap;
    expect(map.get('custom-new-beginning-tier')).toBe(4);
    expect(map.size).toBe(1);
  });
  it('maps tasks by requiredPrestige even when names and wiki links are localized', () => {
    const store = useMetadataStore();
    store.tasks = [
      {
        id: NEW_BEGINNING_TASK_IDS[1],
        name: 'Neuanfang',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Neuanfang',
        requiredPrestige: { id: 'prestige-1' },
      },
      {
        id: NEW_BEGINNING_TASK_IDS[2],
        name: 'Neuanfang',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Neuanfang',
        requiredPrestige: { id: 'prestige-2' },
      },
      {
        id: 'regular-task',
        name: 'Debut',
      },
    ] as Task[];
    store.prestigeLevels = [
      createPrestigeLevel(1, []),
      createPrestigeLevel(2, []),
      createPrestigeLevel(3, []),
    ];
    const map = store.prestigeTaskMap;
    expect(map.get(NEW_BEGINNING_TASK_IDS[1])).toBe(1);
    expect(map.get(NEW_BEGINNING_TASK_IDS[2])).toBe(2);
    expect(map.has('regular-task')).toBe(false);
    expect(map.size).toBe(2);
  });
  it('prefers requiredPrestige over prestige condition inference for the same task', () => {
    const store = useMetadataStore();
    store.tasks = [
      {
        id: NEW_BEGINNING_TASK_IDS[1],
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning',
        requiredPrestige: { id: 'prestige-1' },
      },
    ] as Task[];
    store.prestigeLevels = [
      createPrestigeLevel(1, []),
      createPrestigeLevel(2, [createCondition(NEW_BEGINNING_TASK_IDS[1], 'New Beginning')]),
    ];
    const map = store.prestigeTaskMap;
    expect(map.get(NEW_BEGINNING_TASK_IDS[1])).toBe(1);
    expect(map.size).toBe(1);
  });
  it('ignores requiredPrestige ids that do not resolve to a known prestige level', () => {
    const store = useMetadataStore();
    store.tasks = [
      {
        id: 'unknown-ref-task',
        name: 'Localized Name',
        requiredPrestige: { id: 'prestige-missing' },
      },
    ] as Task[];
    store.prestigeLevels = [createPrestigeLevel(1, [])];
    const map = store.prestigeTaskMap;
    expect(map.has('unknown-ref-task')).toBe(false);
    expect(map.size).toBe(0);
  });
});
