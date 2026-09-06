import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentGameMode } from '@/stores/utils/gameMode';
import { logger } from '@/utils/logger';
const { getMode, getStore } = vi.hoisted(() => ({ getMode: vi.fn(), getStore: vi.fn() }));
vi.mock('@/stores/useTarkov', () => ({ useTarkovStore: getStore }));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn() } }));
describe('getCurrentGameMode', () => {
  beforeEach(() => {
    getStore.mockReturnValue({ getCurrentGameMode: getMode });
  });
  it.each(['pvp', 'pve', 'seasonal'])('preserves the selected %s mode', (mode) => {
    getMode.mockReturnValue(mode);
    expect(getCurrentGameMode()).toBe(mode);
  });
  it.each([undefined, null, '', 'regular', 'unknown'])('falls back for invalid mode %s', (mode) => {
    getMode.mockReturnValue(mode);
    expect(getCurrentGameMode()).toBe('pvp');
  });
  it('tolerates an unavailable getter during initialization', () => {
    getStore.mockReturnValue({});
    expect(getCurrentGameMode()).toBe('pvp');
  });
  it('reports an unavailable store and returns the fallback', () => {
    const error = new Error('no active Pinia');
    getStore.mockImplementationOnce(() => {
      throw error;
    });
    expect(getCurrentGameMode()).toBe('pvp');
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), error);
  });
});
