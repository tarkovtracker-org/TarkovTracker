import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { useCraftableItem } from '@/composables/useCraftableItem';
import en from '@/locales/en.json';
import type { CraftSource } from '@/stores/useMetadata';
import { createTestLocaleMessages } from '#tests/test-helpers/i18nMessages';
const i18n = createI18n({ legacy: false, locale: 'en', messages: createTestLocaleMessages(en) });
const craftSourcesByItemId = new Map<string, CraftSource[]>();
const hideoutLevels: Record<string, { self: number }> = {};
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => i18n.global,
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({ craftSourcesByItemId }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({ hideoutLevels }),
}));
const source = (stationId: string, stationName: string, stationLevel: number) =>
  ({ stationId, stationName, stationLevel }) as CraftSource;
describe('useCraftableItem craftableTitle', () => {
  it('is empty when the item has no craft sources', () => {
    expect(useCraftableItem('missing').craftableTitle.value).toBe('');
  });
  it('lists up to three sources with the player levels and counts the rest', () => {
    craftSourcesByItemId.set('item-1', [
      source('workbench', 'Workbench', 2),
      source('lavatory', 'Lavatory', 1),
      source('medstation', 'Medstation', 3),
      source('nutrition', 'Nutrition Unit', 2),
    ]);
    hideoutLevels.workbench = { self: 1 };
    hideoutLevels.lavatory = { self: 1 };
    expect(useCraftableItem('item-1').craftableTitle.value).toBe(
      'Craftable now: Workbench 2 (you: 1), Lavatory 1 (you: 1), Medstation 3 (you: 0) +1 more'
    );
  });
  it('says the station level is too low when no source is available', () => {
    craftSourcesByItemId.set('item-2', [source('workbench', 'Workbench', 3)]);
    hideoutLevels.workbench = { self: 1 };
    expect(useCraftableItem('item-2').craftableTitle.value).toBe(
      'Craftable (station level too low): Workbench 3 (you: 1)'
    );
  });
  it('uses the active locale', () => {
    i18n.global.setLocaleMessage('de', {
      needed_items: {
        craft: {
          available: 'Jetzt herstellbar',
          source: '{station} Stufe {level} (du: {current})',
          title: '{status} – {sources}{more}',
        },
      },
    } as never);
    i18n.global.locale.value = 'de';
    craftSourcesByItemId.set('item-3', [source('workbench', 'Werkbank', 1)]);
    hideoutLevels.workbench = { self: 1 };
    try {
      expect(useCraftableItem('item-3').craftableTitle.value).toBe(
        'Jetzt herstellbar – Werkbank Stufe 1 (du: 1)'
      );
    } finally {
      i18n.global.locale.value = 'en';
    }
  });
});
