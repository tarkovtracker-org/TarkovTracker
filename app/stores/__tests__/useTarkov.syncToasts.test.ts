import { describe, expect, it, vi } from 'vitest';
import { runApiUpdateHandlers } from '@/stores/useTarkov';
describe('runApiUpdateHandlers', () => {
  it('evaluates all handlers even when the first one returns true', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => false);
    const handled = runApiUpdateHandlers([first, second]);
    expect(handled).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('returns false when no handler reports an API update', () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => false);
    const handled = runApiUpdateHandlers([first, second]);
    expect(handled).toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
