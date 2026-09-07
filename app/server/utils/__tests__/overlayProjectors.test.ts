import { describe, expect, it } from 'vitest';
import { addFallbackCrafts, addFallbackItems } from '@/server/utils/overlayAdditions';
import {
  projectEditions,
  projectRawPrestige,
  projectSeasonalPerks,
  projectStoryChapters,
} from '@/server/utils/overlayProjectors';
import { unknownOverlaySections, validateOverlayData } from '@/server/utils/overlayValidation';
import { adaptPrestigeResponse } from '@/server/utils/tarkov-json';
import type { OverlayData } from '@/server/utils/overlayTypes';
import type { HideoutStation, TarkovItem } from '@/types/tarkov';
const overlay: OverlayData = {
  $meta: { version: 'test', generated: '2026-09-07', sha256: 'test-sha' },
  storyChapters: {
    tour: {
      name: 'Tour',
      order: 1,
      objectives: { ticket: { id: 'ticket', description: 'Retrieve ticket' } },
    },
  },
  editions: { standard: { title: 'Standard', value: 1 } },
  tasksAdd: { synthetic: { name: 'New Beginning', disabled: false } },
  seasonalPerks: { perk: { name: 'Perk', effects: [], mutuallyExclusiveSeasonalPerkIds: [] } },
  modes: {
    regular: {
      prestige: {
        p5: {
          storyRequirements: [
            {
              type: 'storyObjectiveStatus',
              storyChapter: 'tour',
              objective: 'ticket',
              status: ['complete'],
            },
          ],
          conditions: {
            existing: { count: 2 },
            added: { type: 'taskStatus', task: 'synthetic', status: ['complete'] },
          },
        },
      },
    },
  },
  locales: {
    de: {
      tasks: { synthetic: { name: 'Neuanfang' } },
      storyChapters: {
        tour: { name: 'Tour DE', objectives: { ticket: { description: 'Ticket DE' } } },
      },
      prestige: { p5: { name: 'Prestige DE' } },
    },
  },
};
describe('endpoint overlay projectors', () => {
  it('patches and appends prestige conditions before task resolution and localization', () => {
    const raw = projectRawPrestige(
      {
        tasks: [],
        prestige: [
          {
            id: 'p5',
            prestigeLevel: 5,
            conditions: [{ id: 'existing', type: 'haveItem', count: 1 }],
          },
        ],
      },
      overlay,
      'regular',
      'de'
    );
    const level = adaptPrestigeResponse(raw).data.prestige[0]!;
    expect(level.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'existing', count: 2 }),
        expect.objectContaining({
          id: 'added',
          task: expect.objectContaining({ id: 'synthetic', name: 'Neuanfang' }),
        }),
      ])
    );
    expect(level.storyRequirements).toEqual([
      expect.objectContaining({ objective: 'ticket', name: 'Ticket DE', unresolved: false }),
    ]);
    expect(projectStoryChapters(overlay, 'regular', 'de')[0]?.name).toBe('Tour DE');
  });
  it('preserves condition arrays when locale patches target condition IDs', () => {
    const localized: OverlayData = {
      ...overlay,
      locales: { de: { prestige: { p5: { conditions: { existing: { name: 'Localized' } } } } } },
    };
    const raw = projectRawPrestige(
      { prestige: [{ id: 'p5', conditions: [{ id: 'existing', type: 'haveItem', count: 1 }] }] },
      localized,
      'regular',
      'de'
    );
    const conditions = adaptPrestigeResponse(raw).data.prestige[0]!.conditions;
    expect(conditions).toHaveLength(2);
    expect(conditions?.[0]).toMatchObject({ id: 'existing', name: 'Localized', count: 2 });
    expect(conditions?.[1]).toMatchObject({ id: 'added' });
  });
  it.each(['pve', 'pvp-season'])('does not leak regular prestige into %s', (mode) => {
    const raw = projectRawPrestige(
      { prestige: [{ id: 'p5', conditions: [] }] },
      overlay,
      mode,
      'en'
    );
    expect(raw.prestige[0]?.conditions).toEqual([]);
    expect(raw.prestige[0]?.storyRequirements).toBeUndefined();
  });
  it('preserves partial mode objective fields and does not invent locale-only prestige levels', () => {
    const scoped: OverlayData = {
      ...overlay,
      modes: {
        pve: {
          storyChapters: {
            tour: { objectives: { ticket: { description: 'PvE ticket' } } },
            added: { name: 'Mode chapter', order: 2 },
          },
        },
      },
    };
    const chapters = projectStoryChapters(scoped, 'pve', 'en');
    expect(chapters.map((chapter) => chapter.id)).toEqual(['tour', 'added']);
    expect(chapters[0]?.objectives?.ticket).toMatchObject({
      id: 'ticket',
      description: 'PvE ticket',
    });
    expect(projectRawPrestige({ prestige: [] }, overlay, 'pve', 'de').prestige).toEqual([]);
  });
  it('keeps complete upstream task entities ahead of synthetic fallbacks', () => {
    const raw = projectRawPrestige(
      { tasks: [{ id: 'synthetic', name: 'Upstream' }] },
      { ...overlay, tasksAdd: { synthetic: { name: 'Fallback', obsolete: true } } },
      'regular',
      'en'
    );
    expect(raw.tasks).toEqual([{ id: 'synthetic', name: 'Upstream' }]);
  });
  it('applies shared then mode edition data and gates perks to Seasonal', () => {
    const scoped = { ...overlay, modes: { pve: { editions: { standard: { value: 2 } } } } };
    expect(projectEditions(scoped, 'pve')[0]).toMatchObject({
      id: 'standard',
      title: 'Standard',
      value: 2,
    });
    expect(projectSeasonalPerks(overlay, 'regular')).toEqual([]);
    expect(projectSeasonalPerks(overlay, 'pve')).toEqual([]);
    expect(projectSeasonalPerks(overlay, 'pvp-season')).toHaveLength(1);
  });
  it('adapts missing items without shadowing existing upstream records', () => {
    const existing = { id: 'existing', name: 'Rich upstream', types: ['barter'] } as TarkovItem;
    const result = addFallbackItems(
      [existing],
      { itemsAdd: { existing: { name: 'Fallback' }, added: { name: 'Added' } } },
      'regular'
    );
    expect(result[0]).toBe(existing);
    expect(result[1]).toMatchObject({ id: 'added', name: 'Added' });
  });
  it('deduplicates crafts and preserves unknown task unlocks', () => {
    const station = {
      id: 'station',
      levels: [{ level: 1, crafts: [{ id: 'existing' }] }],
    } as HideoutStation;
    const craft = {
      station: 'station',
      level: 1,
      duration: 10,
      requiredItems: [{ item: 'input', count: 2 }],
      productItem: { item: 'output', count: 1 },
      taskUnlock: null,
    };
    const result = addFallbackCrafts(
      [station],
      { craftsAdd: { existing: craft, added: craft } },
      'regular'
    );
    expect(result[0]?.levels[0]?.crafts).toHaveLength(2);
    expect(result[0]?.levels[0]?.crafts?.[1]).toMatchObject({
      id: 'added',
      taskUnlock: null,
      unlockState: 'unknown',
      rewardItems: [{ item: { id: 'output' }, count: 1 }],
    });
  });
  it('accepts published chapter objective arrays and localizes their referenced requirements', () => {
    const published: OverlayData = {
      ...overlay,
      storyChapters: {
        tour: {
          name: 'Tour',
          order: 1,
          objectives: [{ id: 'ticket', description: 'Retrieve ticket' }],
        },
      },
    };
    expect(validateOverlayData(published)).toBe(true);
    const raw = projectRawPrestige({ prestige: [{ id: 'p5' }] }, published, 'regular', 'de');
    expect(adaptPrestigeResponse(raw).data.prestige[0]?.storyRequirements).toEqual([
      expect.objectContaining({ name: 'Ticket DE', unresolved: false }),
    ]);
    expect(
      validateOverlayData({ ...published, storyChapters: { tour: { objectives: [null] } } })
    ).toBe(false);
  });
  it('rejects bad references and malformed known sections, while reporting unknown sections', () => {
    expect(validateOverlayData(overlay)).toBe(true);
    expect(validateOverlayData({ ...overlay, storyChapters: {} })).toBe(false);
    expect(validateOverlayData({ ...overlay, seasonalPerks: { broken: { effects: null } } })).toBe(
      false
    );
    expect(unknownOverlaySections({ ...overlay, future: {} } as OverlayData)).toEqual(['future']);
  });
});
