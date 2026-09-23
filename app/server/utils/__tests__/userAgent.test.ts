import { describe, expect, it } from 'vitest';
import { resolveTarkovTrackerUserAgent, TARKOVTRACKER_USER_AGENT } from '@/server/utils/userAgent';
const UPSTREAM_USER_AGENT = 'TarkovTracker/1.0 (+https://tarkovtracker.org)';
describe('resolveTarkovTrackerUserAgent', () => {
  it('names this instance when APP_URL is configured', () => {
    expect(resolveTarkovTrackerUserAgent({ APP_URL: 'https://tracker.example.com' })).toBe(
      'TarkovTracker/1.0 (+https://tracker.example.com)'
    );
  });
  it('names this instance when only the Cloudflare Pages deployment url is set', () => {
    expect(resolveTarkovTrackerUserAgent({ CF_PAGES_URL: 'deploy-preview.pages.dev' })).toBe(
      'TarkovTracker/1.0 (+https://deploy-preview.pages.dev)'
    );
  });
  it('normalizes a bare hostname (no scheme) into an https origin', () => {
    expect(resolveTarkovTrackerUserAgent({ APP_URL: 'tracker.example.com' })).toBe(
      'TarkovTracker/1.0 (+https://tracker.example.com)'
    );
  });
  it('drops a configured path/query/hash, keeping only the origin', () => {
    expect(
      resolveTarkovTrackerUserAgent({
        APP_URL: 'https://tracker.example.com/some/path?x=1#h',
      })
    ).toBe('TarkovTracker/1.0 (+https://tracker.example.com)');
  });
  it('falls back to the upstream value when no app url is configured', () => {
    expect(resolveTarkovTrackerUserAgent({})).toBe(UPSTREAM_USER_AGENT);
  });
  it('falls back to the upstream value for an empty APP_URL', () => {
    expect(resolveTarkovTrackerUserAgent({ APP_URL: '' })).toBe(UPSTREAM_USER_AGENT);
  });
  it('falls back to the upstream value for a whitespace-only APP_URL', () => {
    expect(resolveTarkovTrackerUserAgent({ APP_URL: '   ' })).toBe(UPSTREAM_USER_AGENT);
  });
  it('falls back to the upstream value for a malformed APP_URL', () => {
    expect(resolveTarkovTrackerUserAgent({ APP_URL: 'not a url ::: broken' })).toBe(
      UPSTREAM_USER_AGENT
    );
  });
  it('falls back to the upstream value when the app url resolves to the local dev default', () => {
    // resolvePublicAppUrl({}) === 'http://localhost:3000'; the local dev fallback must never
    // leak into an outbound header that identifies this deployment to a third party.
    expect(resolveTarkovTrackerUserAgent({ APP_URL: 'localhost:3000' })).toBe(UPSTREAM_USER_AGENT);
    expect(resolveTarkovTrackerUserAgent({ APP_URL: 'http://127.0.0.1:3000' })).toBe(
      UPSTREAM_USER_AGENT
    );
  });
  it('is not vulnerable to header-injection via whitespace/CRLF in the app url', () => {
    const result = resolveTarkovTrackerUserAgent({
      APP_URL: 'https://tracker.example.com\r\nX-Injected: 1',
    });
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\n');
    expect(result).not.toContain('X-Injected');
  });
});
describe('TARKOVTRACKER_USER_AGENT', () => {
  it('is the value resolved from the actual process env at module load', () => {
    expect(TARKOVTRACKER_USER_AGENT).toBe(resolveTarkovTrackerUserAgent(process.env));
  });
});
