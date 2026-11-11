import { describe, expect, it } from 'vitest';
import bundledCues from '@/data/extractCues.json';
import bundledRequirements from '@/data/extractRequirements.json';
import {
  extractRuleSource,
  extractRulesForMode,
  isExtractCuesSection,
  isExtractRequirementsSection,
  type ExtractRuleData,
} from '@/utils/extractRuleData';
const source = { clientBuild: '1.3.0.0.48484', definitionsSha256: 'a'.repeat(64) };
const section = (rules: unknown[], sources: unknown = { regular: source }) => ({
  sources,
  maps: { map: { exit: { name: 'exit', rules } } },
});
describe('extract rule data validation', () => {
  it('accepts the bundled sections', () => {
    expect(isExtractRequirementsSection(bundledRequirements)).toBe(true);
    expect(isExtractCuesSection(bundledCues)).toBe(true);
  });
  it.each([
    ['a non-hex definitions hash', section([], { regular: { ...source, definitionsSha256: 'x' } })],
    ['an empty catalog', { sources: { regular: source }, maps: {} }],
    ['a catalog of empty maps', { sources: { regular: source }, maps: { map: {} } }],
    ['a chance above 100%', section([{ type: 'chance', percent: 101 }])],
    ['a PvE chance above 100%', section([{ type: 'chance', percent: 50, percentPve: 150 }])],
    ['a transfer without an item', section([{ type: 'transfer', count: 20000 }])],
    ['a transfer without a count', section([{ type: 'transfer', item: 'roubles' }])],
    ['an item rule without an item', section([{ type: 'item', count: 1 }])],
    ['an empty-slot rule without a slot', section([{ type: 'empty' }])],
    ['an unknown rule type', section([{ type: 'teleport' }])],
  ])('rejects %s', (_case, value) => {
    expect(isExtractRequirementsSection(value)).toBe(false);
  });
  it('accepts complete rules and requires keys on key cues', () => {
    expect(
      isExtractRequirementsSection(
        section([
          { type: 'transfer', item: 'roubles', count: 20000, vehicle: true },
          { type: 'chance', percent: 100, percentPve: 0 },
        ])
      )
    ).toBe(true);
    const cue = (cues: unknown[]) => ({ map: { exit: { name: 'exit', cues, reference: 'ref' } } });
    expect(isExtractCuesSection(cue([{ type: 'key', item: 'key-id' }]))).toBe(true);
    expect(isExtractCuesSection(cue([{ type: 'key' }]))).toBe(false);
    // An empty cue section is valid: a release may carry no curated cues.
    expect(isExtractCuesSection({})).toBe(true);
  });
});
describe('extract rule selection', () => {
  const coop = [{ type: 'coop' as const }];
  const data = (entry: object, sources: object = { regular: source }) =>
    ({
      requirements: { sources, maps: { map: { exit: { name: 'exit', ...entry } } } },
      cues: {},
    }) as ExtractRuleData;
  const ids = { mapId: 'map', extractId: 'exit' };
  it('prefers shared rules, then the mode list, with PvE on the regular list', () => {
    const both = { regular: source, 'pvp-season': source };
    const split = data({ pvp: coop, seasonal: [] }, both);
    expect(extractRulesForMode(split, ids, 'pvp')).toEqual(coop);
    expect(extractRulesForMode(split, ids, 'pve')).toEqual(coop);
    expect(extractRulesForMode(split, ids, 'seasonal')).toEqual([]);
    expect(extractRulesForMode(data({ rules: coop }, both), ids, 'seasonal')).toEqual(coop);
  });
  it('gives a mode without a capture no rules, even when shared rules exist', () => {
    const regularOnly = data({ rules: coop });
    expect(extractRulesForMode(regularOnly, ids, 'seasonal')).toBeUndefined();
    expect(extractRuleSource(regularOnly, 'seasonal')).toBeUndefined();
    expect(extractRulesForMode(regularOnly, ids, 'arena')).toBeUndefined();
    expect(extractRulesForMode(regularOnly, { mapId: 'map', extractId: 'toString' }, 'pvp')).toBe(
      undefined
    );
  });
});
