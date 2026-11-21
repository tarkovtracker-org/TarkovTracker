import { describe, expect, it } from 'vitest';
import { previewModifiers, previewRules } from '@/features/seasonal-modifiers/seasonTwo';
import { parseSeasonPreview } from '@/server/utils/seasonPreview';
import { UNTAR_CONTROL_POSTER_URL, UNTAR_CONTROL_PREVIEW_ID } from '@/types/seasonPreview';
import type { PreviewPerk, SeasonPreview } from '@/types/seasonPreview';
const perk = <T extends number | null>(slug: string, points: T): PreviewPerk<T> => {
  const id = UNTAR_CONTROL_PREVIEW_ID + ':' + slug;
  return {
    id,
    name: id + ' name',
    description: id + ' description',
    points,
    exclusiveToPerks: [],
    imageLink: null,
  };
};
function fixture(): SeasonPreview {
  const common = [perk('smart_pmcs', null)];
  const personal = [perk('prodigy', -4), perk('deadline', 4)];
  const name = UNTAR_CONTROL_PREVIEW_ID + ' name';
  return {
    provisional: true,
    source: UNTAR_CONTROL_POSTER_URL,
    season: {
      data: {
        id: UNTAR_CONTROL_PREVIEW_ID,
        name,
        start: null,
        end: null,
        perks: { common, personal },
      },
      translations: ['$.data.name', '$.data.perks.*.*.name', '$.data.perks.*.*.description'],
    },
    season_en: {
      data: {
        [name]: 'UNTAR Control',
        [common[0]!.name]: 'Smart PMCs',
        [common[0]!.description]: 'Gain skill experience 25% faster.',
        [personal[0]!.name]: 'Prodigy',
        [personal[0]!.description]: 'Gain skill experience 20% faster.',
        [personal[1]!.name]: 'Deadline',
        [personal[1]!.description]: 'Reach an ending within 30 days.',
      },
    },
  };
}
describe('provisional season catalog', () => {
  it('preserves Tarkov.dev-shaped point signs and converts them only in the planner', () => {
    const payload = fixture();
    expect(parseSeasonPreview(payload)).toBe(payload);
    expect(previewRules(payload)).toMatchObject([{ name: 'Smart PMCs' }]);
    expect(previewModifiers(payload)).toMatchObject([
      {
        name: 'Prodigy',
        netCost: 4,
        category: 'skills',
        effect: 'Gain skill experience **20% faster**.',
      },
      { name: 'Deadline', netCost: -4, category: 'gear_goals' },
    ]);
    expect(payload.season.data.perks.personal.map((entry) => entry.points)).toEqual([-4, 4]);
  });
  it('rejects an active-season feed and any preview without explicit provenance', () => {
    const payload = fixture();
    expect(parseSeasonPreview(payload.season)).toBeNull();
    expect(parseSeasonPreview({ ...payload, provisional: false })).toBeNull();
    expect(parseSeasonPreview({ ...payload, source: 'https://example.com/season' })).toBeNull();
  });
  it('rejects duplicate perk IDs, missing translations, and invalid common points', () => {
    const duplicate = fixture();
    const duplicatePerks = duplicate.season.data.perks.personal;
    duplicatePerks.push(duplicatePerks[0]!);
    expect(parseSeasonPreview(duplicate)).toBeNull();
    const untranslated = fixture();
    untranslated.season_en.data[untranslated.season.data.perks.personal[0]!.name] = '';
    expect(parseSeasonPreview(untranslated)).toBeNull();
    const invalid = fixture();
    Object.assign(invalid.season.data.perks.common[0]!, { points: 1 });
    expect(parseSeasonPreview(invalid)).toBeNull();
  });
});
