import { describe, expect, it } from 'vitest';
import { attachTraderTaskGroups, validTraderTaskGroups } from '@/server/utils/overlayTaskGroups';
import { unknownOverlaySections } from '@/server/utils/overlayValidation';
import type { OverlayData } from '@/server/utils/overlayTypes';
const WET_JOB = '5a27bb8386f7741c770d2d0a';
const NEW_PATHS = '66aa58245ab22944110db6e9';
const UNGROUPED = '5936d90786f7742b1420ba5b';
const overlay: OverlayData = {
  $meta: { version: 'test', generated: '2026-10-20', sha256: 'test-sha' },
  editions: { standard: { title: 'Standard' } },
};
describe('validTraderTaskGroups', () => {
  it.each([
    [{}, true],
    [{ regular: {} }, true],
    [{ regular: { [WET_JOB]: 0 }, pve: { [NEW_PATHS]: 4 }, 'pvp-season': {} }, true],
    [null, false],
    [[], false],
    [{ pvp: { [WET_JOB]: 0 } }, false],
    [{ regular: { [WET_JOB]: 5 } }, false],
    [{ regular: { [WET_JOB]: -1 } }, false],
    [{ regular: { [WET_JOB]: 1.5 } }, false],
    [{ regular: { [WET_JOB]: '0' } }, false],
    [{ regular: { 'not-a-task-id': 0 } }, false],
    [{ regular: [] }, false],
  ])('%j -> %s', (registry, expected) => {
    expect(validTraderTaskGroups(registry)).toBe(expected);
  });
  it('is consumed only when valid', () => {
    expect(
      unknownOverlaySections({ ...overlay, traderTaskGroups: { regular: { [WET_JOB]: 0 } } })
    ).toEqual([]);
    expect(
      unknownOverlaySections({ ...overlay, traderTaskGroups: { regular: { [WET_JOB]: 9 } } })
    ).toEqual(['traderTaskGroups']);
  });
});
describe('attachTraderTaskGroups', () => {
  const registry = {
    traderTaskGroups: { regular: { [WET_JOB]: 0, [NEW_PATHS]: 1 }, pve: { [WET_JOB]: 2 } },
  };
  const tasks = () => [
    { id: WET_JOB },
    { id: NEW_PATHS },
    { id: UNGROUPED, traderTaskGroup: 3 as const },
  ];
  it('attaches the mode group and leaves unknown tasks without one', () => {
    expect(attachTraderTaskGroups(tasks(), registry, 'regular')).toEqual([
      { id: WET_JOB, traderTaskGroup: 0 },
      { id: NEW_PATHS, traderTaskGroup: 1 },
      { id: UNGROUPED },
    ]);
  });
  it('never falls back to another mode', () => {
    expect(attachTraderTaskGroups(tasks(), registry, 'pvp-season')).toEqual([
      { id: WET_JOB },
      { id: NEW_PATHS },
      { id: UNGROUPED },
    ]);
    expect(attachTraderTaskGroups(tasks(), registry, 'pve')[0]).toEqual({
      id: WET_JOB,
      traderTaskGroup: 2,
    });
  });
  it('applies nothing from a malformed registry', () => {
    const malformed = { traderTaskGroups: { regular: { [WET_JOB]: 0, [NEW_PATHS]: 7 } } };
    expect(attachTraderTaskGroups(tasks(), malformed, 'regular')).toEqual([
      { id: WET_JOB },
      { id: NEW_PATHS },
      { id: UNGROUPED },
    ]);
  });
});
