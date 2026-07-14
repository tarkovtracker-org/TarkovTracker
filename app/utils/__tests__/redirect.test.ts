import { describe, expect, it, vi } from 'vitest';
import { openExternalUrl, sanitizeInternalRedirect } from '@/utils/redirect';
describe('openExternalUrl', () => {
  it('opens an isolated browser tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openExternalUrl('https://example.com');
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});
describe('sanitizeInternalRedirect', () => {
  it('returns valid internal path', () => {
    expect(sanitizeInternalRedirect('/tasks?task=abc#header')).toBe('/tasks?task=abc#header');
  });
  it('returns first valid array value', () => {
    expect(sanitizeInternalRedirect(['/overview', '/tasks'])).toBe('/overview');
  });
  it('uses fallback for external URL', () => {
    expect(sanitizeInternalRedirect('https://example.com', '/safe')).toBe('/safe');
  });
  it('uses fallback for protocol-relative URL', () => {
    expect(sanitizeInternalRedirect('//example.com', '/safe')).toBe('/safe');
  });
  it('uses fallback for relative path without leading slash', () => {
    expect(sanitizeInternalRedirect('tasks', '/safe')).toBe('/safe');
  });
  it('uses fallback for missing value', () => {
    expect(sanitizeInternalRedirect(undefined, '/safe')).toBe('/safe');
  });
});
