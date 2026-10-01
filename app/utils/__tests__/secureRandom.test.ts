import { afterEach, describe, expect, it, vi } from 'vitest';
import { secureRandomAlphanumeric } from '@/utils/secureRandom';
describe('secureRandomAlphanumeric', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('returns alphanumeric strings of the requested length', () => {
    expect(secureRandomAlphanumeric(12)).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(secureRandomAlphanumeric(0)).toBe('');
  });
  it('uses the platform CSPRNG instead of Math.random', () => {
    const mathRandom = vi.spyOn(Math, 'random');
    const getRandomValues = vi.spyOn(crypto, 'getRandomValues');
    secureRandomAlphanumeric(8);
    expect(getRandomValues).toHaveBeenCalled();
    expect(mathRandom).not.toHaveBeenCalled();
  });
  it('rejects bytes that would bias the character distribution', () => {
    const bytes = [255, 248, 0, 61];
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(
      (array: ArrayBufferView<ArrayBuffer>) => {
        (array as unknown as Uint8Array)[0] = bytes.shift() ?? 0;
        return array;
      }
    );
    expect(secureRandomAlphanumeric(2)).toBe('A9');
  });
});
