import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { overlayAuthHeaders } from '@/server/utils/overlayAuth';
const raw =
  'https://raw.githubusercontent.com/tarkovtracker-org/tarkov-data-overlay/main/dist/overlay.json';
describe('overlayAuthHeaders', () => {
  beforeEach(() => {
    vi.stubEnv('OVERLAY_TOKEN', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('attaches a bearer token to GitHub hosts over HTTPS', () => {
    expect(overlayAuthHeaders(raw, ' tok ')).toEqual({ Authorization: 'Bearer tok' });
    expect(overlayAuthHeaders('https://api.github.com/repos/o/r/contents/x', 'tok')).toEqual({
      Authorization: 'Bearer tok',
    });
  });
  it('sends nothing without a token', () => {
    expect(overlayAuthHeaders(raw, undefined)).toEqual({});
    expect(overlayAuthHeaders(raw, '   ')).toEqual({});
  });
  it('reads the configured token when no explicit token is supplied', () => {
    vi.stubEnv('OVERLAY_TOKEN', ' overlay-test-sentinel ');
    expect(overlayAuthHeaders(raw)).toEqual({ Authorization: 'Bearer overlay-test-sentinel' });
  });
  it.each([
    'http://raw.githubusercontent.com/x',
    'https://overlay.example.com/overlay.json',
    'https://raw.githubusercontent.com.evil.example/x',
    'https://evil.example/?u=raw.githubusercontent.com',
    'not a url',
  ])('never sends the token to %s', (url) => {
    expect(overlayAuthHeaders(url, 'tok')).toEqual({});
  });
});
