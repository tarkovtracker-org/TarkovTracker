// @vitest-environment node
import { createApp, toWebHandler } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    Object.assign(payload.season.data, { start: 1_800_000_000 });
    expect(parseSeasonPreview(payload)).toBeNull();
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
  it('requires translated nonzero personal points of both signs and the declared paths', () => {
    const zeroPoints = fixture();
    zeroPoints.season.data.perks.personal[0]!.points = 0;
    const noNegative = fixture();
    noNegative.season.data.perks.personal[0]!.points = 1;
    const { season_en: _english, ...noEnglish } = fixture();
    const wrongPaths = fixture();
    wrongPaths.season.translations = ['$.data.name'];
    for (const invalid of [zeroPoints, noNegative, noEnglish, wrongPaths]) {
      expect(parseSeasonPreview(invalid)).toBeNull();
    }
  });
  it('highlights complete effect terms without splitting longer words', () => {
    const payload = fixture();
    const item = payload.season.data.perks.personal[0]!;
    payload.season_en.data[item.description] =
      'heavy bleeding, Fresh Wounds, heavy bleed, Fresh Wound';
    expect(previewModifiers(payload)[0]?.effect).toBe(
      'heavy bleeding, Fresh Wounds, **heavy bleed**, **Fresh Wound**'
    );
  });
  it('keeps signs in effect highlights without capturing commas', () => {
    const payload = fixture();
    const item = payload.season.data.perks.personal[0]!;
    payload.season_en.data[item.description] = '+2%,-5%,\u221210%';
    expect(previewModifiers(payload)[0]?.effect).toBe('**+2%**,**-5%**,**\u221210%**');
  });
});
describe('season preview route', () => {
  const token = 'synthetic-season-preview-token';
  const url = 'https://app.example/api/tarkov/season-preview';
  const upstream =
    'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/a749270dcad82b26334ccf6feb15b8f4a66ff145/src/previews/untar-control.json';
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('OVERLAY_TOKEN', token);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  async function webHandler() {
    const { default: handler } = await import('@/server/api/tarkov/season-preview.get');
    return toWebHandler(createApp().use(handler));
  }
  it('coalesces authenticated GET and HEAD and keeps the validated immutable catalog', async () => {
    const pending = Promise.withResolvers<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const handle = await webHandler();
    const get = handle(new Request(url));
    const head = handle(new Request(url, { method: 'HEAD' }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      upstream,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
        redirect: 'error',
      })
    );
    pending.resolve(Response.json(fixture()));
    expect(await (await get).json()).toEqual(fixture());
    expect((await head).status).toBe(200);
    expect(await (await head).text()).toBe('');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 600_000);
    fetchMock.mockRejectedValue(new Error('network unavailable'));
    expect((await handle(new Request(url))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('fails closed without credentials and never exposes the server token', async () => {
    vi.stubEnv('OVERLAY_TOKEN', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const handle = await webHandler();
    const unavailable = await handle(new Request(url));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('Cache-Control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('OVERLAY_TOKEN', token);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const denied = await handle(new Request(url));
    expect(denied.status).toBe(503);
    expect(await denied.text()).not.toContain(token);
    fetchMock.mockResolvedValueOnce(Response.json(fixture()));
    expect((await handle(new Request(url))).status).toBe(200);
  });
});
