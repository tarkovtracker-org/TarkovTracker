import { describe, expect, it } from 'vitest';
import {
  buildPrestigeRequirementRows,
  summarizePrestigeRequirementRows,
} from '@/stores/tarkov/prestige';
import type { UserProgressData } from '@/stores/progressState';
import type {
  GameEdition,
  HideoutStation,
  PrestigeLevel,
  StoryChapter,
  Task,
  TaskObjective,
} from '@/types/tarkov';
const createProgressData = (): UserProgressData => ({
  apiUpdateHistory: [],
  displayName: null,
  hideoutModules: {},
  hideoutParts: {},
  level: 1,
  pmcFaction: 'USEC',
  prestigeLevel: 0,
  progressEpoch: 0,
  skillOffsets: {},
  skills: {},
  storyChapters: {},
  taskCompletions: {},
  taskObjectives: {},
  traders: {},
  xpOffset: 0,
});
const edition: Pick<GameEdition, 'defaultCultistCircleLevel' | 'defaultStashLevel'> = {
  defaultCultistCircleLevel: 0,
  defaultStashLevel: 0,
};
const hideoutStations: HideoutStation[] = [];
const createPrestigeLevel = (
  prestigeLevel: number,
  conditions: TaskObjective[]
): PrestigeLevel => ({
  conditions,
  id: `prestige-${prestigeLevel}`,
  level: prestigeLevel,
  prestigeLevel,
});
describe('buildPrestigeRequirementRows', () => {
  it('falls back to the wiki player level requirement when prestige metadata is incomplete', () => {
    const rows = buildPrestigeRequirementRows({
      currentPrestigeLevel: 0,
      edition,
      hideoutStations,
      prestigeLevels: [
        createPrestigeLevel(1, [
          {
            type: 'playerLevel',
            id: 'player-level',
          },
        ]),
      ],
      pvpProgress: createProgressData(),
      storyChapters: [],
      tasks: [],
    });
    expect(rows.find((row) => row.kind === 'playerLevel')).toMatchObject({
      currentValue: 1,
      requiredValue: 47,
      source: 'wiki',
      status: 'unmet',
    });
  });
  it('injects the wiki player level requirement when a stale prestige payload omits it entirely', () => {
    const rows = buildPrestigeRequirementRows({
      currentPrestigeLevel: 0,
      edition,
      hideoutStations,
      prestigeLevels: [createPrestigeLevel(1, [])],
      pvpProgress: createProgressData(),
      storyChapters: [],
      tasks: [],
    });
    expect(rows.find((row) => row.kind === 'playerLevel')).toMatchObject({
      currentValue: 1,
      requiredValue: 47,
      source: 'wiki',
      status: 'unmet',
    });
  });
  it('supplements prestige 5 with overlay New Beginning and manual Ticket from Tarkov checks', () => {
    const pvpProgress = createProgressData();
    const tasks: Task[] = [
      {
        id: 'new_beginning_prestige_5',
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning_(Prestige_5)',
      },
    ];
    const storyChapters: StoryChapter[] = [
      {
        id: 'tour',
        name: 'Tour',
        normalizedName: 'tour',
        order: 1,
        wikiLink: 'https://example.com/tour',
      },
      {
        id: 'they-are-already-here',
        name: 'They Are Already Here',
        normalizedName: 'they-are-already-here',
        order: 2,
        wikiLink: 'https://example.com/they-are-already-here',
      },
    ];
    const prestigeLevels = [
      createPrestigeLevel(5, [
        {
          type: 'playerLevel',
          id: 'player-level',
          playerLevel: 47,
        },
        {
          type: 'taskStatus',
          id: 'collector',
          task: {
            id: 'collector',
            name: 'Collector',
          },
        },
        {
          type: 'haveItem',
          count: 20000000,
          id: 'roubles',
          items: [
            {
              id: 'roubles',
              name: 'Roubles',
            },
          ],
        },
      ]),
    ];
    const rows = buildPrestigeRequirementRows({
      currentPrestigeLevel: 4,
      edition,
      hideoutStations,
      prestigeLevels,
      pvpProgress,
      storyChapters,
      tasks,
    });
    expect(rows.find((row) => row.id === 'task:new_beginning_prestige_5')).toMatchObject({
      source: 'overlay',
      status: 'unmet',
      taskRole: 'newBeginning',
      tracked: true,
    });
    expect(rows.find((row) => row.name === '20,000,000 Roubles')).toMatchObject({
      source: 'tarkov.dev',
      status: 'manual',
      tracked: false,
    });
    expect(rows.find((row) => row.name === '1 Ticket from Tarkov')).toMatchObject({
      source: 'wiki',
      status: 'manual',
      tracked: false,
    });
    expect(rows.find((row) => row.name === 'Tour')).toBeTruthy();
    expect(rows.find((row) => row.name === 'They Are Already Here')).toBeTruthy();
  });
  it('uses the prestige 6 story chapter rule and marks ready state from tracked rows only', () => {
    const pvpProgress = createProgressData();
    pvpProgress.level = 47;
    pvpProgress.taskCompletions = {
      new_beginning_prestige_6: {
        complete: true,
        failed: false,
      },
    };
    pvpProgress.storyChapters = {
      'the-ticket': {
        complete: true,
      },
    };
    const tasks: Task[] = [
      {
        id: 'new_beginning_prestige_6',
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning_(Prestige_6)',
      },
    ];
    const storyChapters: StoryChapter[] = [
      {
        id: 'tour',
        name: 'Tour',
        normalizedName: 'tour',
        order: 1,
        wikiLink: 'https://example.com/tour',
      },
      {
        id: 'the-ticket',
        name: 'The Ticket',
        normalizedName: 'the-ticket',
        order: 2,
        wikiLink: 'https://example.com/the-ticket',
      },
    ];
    const prestigeLevels = [
      createPrestigeLevel(6, [
        {
          type: 'playerLevel',
          id: 'player-level',
          playerLevel: 47,
        },
      ]),
    ];
    const rows = buildPrestigeRequirementRows({
      currentPrestigeLevel: 5,
      edition,
      hideoutStations,
      prestigeLevels,
      pvpProgress,
      storyChapters,
      tasks,
    });
    const summary = summarizePrestigeRequirementRows(rows);
    expect(rows.find((row) => row.name === 'The Ticket')).toMatchObject({
      kind: 'storyChapter',
      source: 'overlay',
      status: 'met',
    });
    expect(rows.find((row) => row.name === 'Tour')).toBeUndefined();
    expect(summary.allTrackedMet).toBe(true);
    expect(summary.manualCount).toBe(0);
  });
  it('maps task objective item rows from the first accepted item only', () => {
    const rows = buildPrestigeRequirementRows({
      currentPrestigeLevel: 0,
      edition,
      hideoutStations,
      prestigeLevels: [
        createPrestigeLevel(1, [
          {
            type: 'playerLevel',
            id: 'player-level',
            playerLevel: 47,
          },
          {
            type: 'haveItem',
            count: 3,
            id: 'item-objective',
            items: [
              {
                id: 'gas-analyzer',
                name: 'Gas analyzer',
                wikiLink: 'https://example.com/gas-analyzer',
              },
            ],
          },
        ]),
      ],
      pvpProgress: createProgressData(),
      storyChapters: [],
      tasks: [],
    });
    expect(rows.find((row) => row.id === 'item:Gas analyzer:3')).toMatchObject({
      href: 'https://example.com/gas-analyzer',
      kind: 'item',
      name: '3 Gas analyzer',
      requiredValue: 3,
      source: 'tarkov.dev',
      status: 'manual',
      tracked: false,
    });
  });
  it('renders skill and hideout station requirement rows when configured', () => {
    const pvpProgress = createProgressData();
    pvpProgress.skillOffsets = { Vitality: 3 };
    const stations: HideoutStation[] = [
      {
        id: 'station1',
        name: 'Test Station',
        levels: [
          {
            id: 'station1-1',
            level: 1,
            constructionTime: 0,
            itemRequirements: [],
            stationLevelRequirements: [],
            skillRequirements: [],
            traderRequirements: [],
            crafts: [],
          },
        ],
      },
    ];
    pvpProgress.hideoutModules = { 'station1-1': { complete: true } };
    const rows = buildPrestigeRequirementRows({
      currentPrestigeLevel: 0,
      edition,
      hideoutStations: stations,
      prestigeLevels: [
        createPrestigeLevel(1, [
          {
            type: 'skill',
            id: 'skill-condition',
            skillLevel: {
              id: 'skill-1',
              name: 'Vitality',
              level: 5,
              skill: { id: 'Vitality', name: 'Vitality' },
            },
          },
          {
            type: 'hideoutStation',
            id: 'hideout-condition',
            hideoutStation: { id: 'station1', name: 'Test Station' },
            stationLevel: 2,
          },
        ]),
      ],
      pvpProgress,
      storyChapters: [],
      tasks: [],
    });
    expect(rows.find((row) => row.kind === 'skill')).toMatchObject({
      currentValue: 3,
      id: 'skill:Vitality:5',
      kind: 'skill',
      name: 'Vitality',
      requiredValue: 5,
      source: 'tarkov.dev',
      status: 'unmet',
    });
    expect(rows.find((row) => row.kind === 'hideoutStation')).toMatchObject({
      currentValue: 1,
      id: 'hideout:station1:2',
      kind: 'hideoutStation',
      name: 'Test Station',
      requiredValue: 2,
      source: 'tarkov.dev',
      status: 'unmet',
    });
  });
  it('skips taskStatus, skill, and hideout conditions when required references are missing', () => {
    const rows = buildPrestigeRequirementRows({
      currentPrestigeLevel: 0,
      edition,
      hideoutStations,
      prestigeLevels: [
        createPrestigeLevel(1, [
          {
            type: 'taskStatus',
            id: 'no-task-id',
            task: { name: 'Missing id' },
          } as TaskObjective,
          {
            type: 'skill',
            id: 'no-skill-name',
            skillLevel: { id: 'skill-1', level: 5 },
          } as TaskObjective,
          {
            type: 'hideoutStation',
            id: 'no-station-id',
            hideoutStation: { name: 'Missing id' },
            stationLevel: 1,
          } as TaskObjective,
        ]),
      ],
      pvpProgress: createProgressData(),
      storyChapters: [],
      tasks: [],
    });
    expect(rows.some((row) => row.kind === 'task')).toBe(false);
    expect(rows.some((row) => row.kind === 'skill')).toBe(false);
    expect(rows.some((row) => row.kind === 'hideoutStation')).toBe(false);
    expect(rows.find((row) => row.kind === 'playerLevel')).toBeTruthy();
  });
  it.each(['findItem', 'giveItem', 'haveItem', 'plantItem', 'sellItem'])(
    'renders an item requirement row for the %s condition type',
    (conditionType) => {
      const rows = buildPrestigeRequirementRows({
        currentPrestigeLevel: 0,
        edition,
        hideoutStations,
        prestigeLevels: [
          createPrestigeLevel(1, [
            {
              type: conditionType,
              count: 2,
              id: 'item-objective',
              items: [{ id: 'bitcoin', name: 'Physical bitcoin' }],
            },
          ]),
        ],
        pvpProgress: createProgressData(),
        storyChapters: [],
        tasks: [],
      });
      expect(rows.find((row) => row.id === 'item:Physical bitcoin:2')).toMatchObject({
        kind: 'item',
        name: '2 Physical bitcoin',
        requiredValue: 2,
        source: 'tarkov.dev',
      });
    }
  );
});
