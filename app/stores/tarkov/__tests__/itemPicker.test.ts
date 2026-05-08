import { describe, expect, it } from 'vitest';
import { createItemPicker } from '@/stores/tarkov/itemPicker';
import type { TarkovItem } from '@/types/tarkov';
const makeItem = (overrides: Partial<TarkovItem> = {}): TarkovItem =>
  ({
    id: 'item-1',
    name: 'Test Item',
    shortName: 'TI',
    ...overrides,
  }) as TarkovItem;
describe('itemPicker', () => {
  describe('pickItemLite', () => {
    it('returns undefined for null input', () => {
      const { pickItemLite } = createItemPicker(new Map());
      expect(pickItemLite(null)).toBeUndefined();
    });
    it('returns undefined for undefined input', () => {
      const { pickItemLite } = createItemPicker(new Map());
      expect(pickItemLite(undefined)).toBeUndefined();
    });
    it('returns the item itself when it has no id', () => {
      const { pickItemLite } = createItemPicker(new Map());
      const item = { name: 'No ID' } as TarkovItem;
      expect(pickItemLite(item)).toBe(item);
    });
    it('returns the sparse item when no match in map', () => {
      const { pickItemLite } = createItemPicker(new Map());
      const item = makeItem({ id: 'missing' });
      expect(pickItemLite(item)).toBe(item);
    });
    it('merges full item data with sparse item', () => {
      const fullItem = makeItem({
        id: 'item-1',
        name: 'Full Name',
        iconLink: 'https://example.com/icon.png',
      });
      const itemsById = new Map<string, TarkovItem>([['item-1', fullItem]]);
      const { pickItemLite } = createItemPicker(itemsById);
      const sparse = makeItem({ id: 'item-1', name: 'Sparse Name' });
      const result = pickItemLite(sparse);
      expect(result?.name).toBe('Full Name');
      expect(result?.iconLink).toBe('https://example.com/icon.png');
    });
    it('lets sparse item properties override full item properties', () => {
      const fullItem = makeItem({
        id: 'item-1',
        properties: { weight: 1, size: 2 } as Record<string, unknown>,
      });
      const itemsById = new Map<string, TarkovItem>([['item-1', fullItem]]);
      const { pickItemLite } = createItemPicker(itemsById);
      const sparse = makeItem({
        id: 'item-1',
        properties: { weight: 5 } as Record<string, unknown>,
      });
      const result = pickItemLite(sparse);
      expect((result?.properties as Record<string, unknown>)?.weight).toBe(5);
      expect((result?.properties as Record<string, unknown>)?.size).toBe(2);
    });
    it('uses full item properties when sparse has none', () => {
      const fullItem = makeItem({
        id: 'item-1',
        properties: { caliber: '7.62' } as Record<string, unknown>,
      });
      const itemsById = new Map<string, TarkovItem>([['item-1', fullItem]]);
      const { pickItemLite } = createItemPicker(itemsById);
      const sparse = makeItem({ id: 'item-1' });
      const result = pickItemLite(sparse);
      expect((result?.properties as Record<string, unknown>)?.caliber).toBe('7.62');
    });
  });
  describe('pickItemArray', () => {
    it('returns undefined for null input', () => {
      const { pickItemArray } = createItemPicker(new Map());
      expect(pickItemArray(null)).toBeUndefined();
    });
    it('returns undefined for undefined input', () => {
      const { pickItemArray } = createItemPicker(new Map());
      expect(pickItemArray(undefined)).toBeUndefined();
    });
    it('maps each item through pickItemLite', () => {
      const fullItem = makeItem({ id: 'item-1', name: 'Full' });
      const itemsById = new Map<string, TarkovItem>([['item-1', fullItem]]);
      const { pickItemArray } = createItemPicker(itemsById);
      const result = pickItemArray([makeItem({ id: 'item-1', name: 'Sparse' })]);
      expect(result).toHaveLength(1);
      expect(result![0]!.name).toBe('Full');
    });
  });
  describe('pickItemMatrix', () => {
    it('returns undefined for null input', () => {
      const { pickItemMatrix } = createItemPicker(new Map());
      expect(pickItemMatrix(null)).toBeUndefined();
    });
    it('returns undefined for undefined input', () => {
      const { pickItemMatrix } = createItemPicker(new Map());
      expect(pickItemMatrix(undefined)).toBeUndefined();
    });
    it('maps nested arrays through pickItemArray', () => {
      const fullItem = makeItem({ id: 'item-1', name: 'Full' });
      const itemsById = new Map<string, TarkovItem>([['item-1', fullItem]]);
      const { pickItemMatrix } = createItemPicker(itemsById);
      const result = pickItemMatrix([[makeItem({ id: 'item-1', name: 'S' })]]);
      expect(result).toHaveLength(1);
      expect(result![0]!).toHaveLength(1);
      expect(result![0]![0]!.name).toBe('Full');
    });
  });
});
