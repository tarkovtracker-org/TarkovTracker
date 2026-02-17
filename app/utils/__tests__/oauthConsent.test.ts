import { describe, expect, it } from 'vitest';
import {
  CIRCULAR_LOG_VALUE,
  PII_LOG_KEYS,
  REDACTED_LOG_VALUE,
  sanitizeForDebugLog,
  toSafeRedirectUri,
  validateOAuthRedirectUri,
} from '@/utils/oauthConsent';
describe('oauthConsent', () => {
  it('redacts pii keys recursively across objects and arrays', () => {
    const sanitized = sanitizeForDebugLog({
      Email: 'test@example.com',
      nested: {
        keep: 'value',
        list: [{ phone: '123' }, { user_metadata: { city: 'hidden' } }],
      },
      values: ['safe', { Full_Name: 'John Doe' }],
    });
    expect(sanitized).toEqual({
      Email: REDACTED_LOG_VALUE,
      nested: {
        keep: 'value',
        list: [{ phone: REDACTED_LOG_VALUE }, { user_metadata: REDACTED_LOG_VALUE }],
      },
      values: ['safe', { Full_Name: REDACTED_LOG_VALUE }],
    });
  });
  it('uses lowercase comparisons for pii key matching', () => {
    expect(PII_LOG_KEYS.has('email')).toBe(true);
    expect(sanitizeForDebugLog({ FIRST_NAME: 'Alice' })).toEqual({
      FIRST_NAME: REDACTED_LOG_VALUE,
    });
  });
  it('preserves primitive values without modification', () => {
    expect(sanitizeForDebugLog('value')).toBe('value');
    expect(sanitizeForDebugLog(42)).toBe(42);
    expect(sanitizeForDebugLog(null)).toBeNull();
    expect(sanitizeForDebugLog(false)).toBe(false);
  });
  it('replaces circular references with a sentinel value', () => {
    const circularObject: { nested?: unknown } = {};
    circularObject.nested = circularObject;
    expect(sanitizeForDebugLog(circularObject)).toEqual({
      nested: CIRCULAR_LOG_VALUE,
    });
  });
  it('returns origin and pathname for valid absolute urls', () => {
    expect(toSafeRedirectUri('https://example.com/callback/path?code=1#section')).toBe(
      'https://example.com/callback/path'
    );
  });
  it('falls back by stripping query and hash for non-url values', () => {
    expect(toSafeRedirectUri('callback/path?code=1#section')).toBe('callback/path');
  });
  it('returns original string when fallback split result is empty', () => {
    expect(toSafeRedirectUri('?code=1')).toBe('?code=1');
  });
  it('returns undefined for empty url strings', () => {
    expect(toSafeRedirectUri('')).toBeUndefined();
  });
  it('returns undefined for missing url', () => {
    expect(toSafeRedirectUri(undefined)).toBeUndefined();
  });
  it('validates redirect target against expected origin and path', () => {
    expect(
      validateOAuthRedirectUri('https://example.com/callback?code=abc&state=xyz', {
        expectedRedirectUri: 'https://example.com/callback',
      })
    ).toBe(true);
  });
  it('rejects redirects when expected origin or path do not match', () => {
    expect(
      validateOAuthRedirectUri('https://malicious.example/callback?code=abc&state=xyz', {
        expectedRedirectUri: 'https://example.com/callback',
      })
    ).toBe(false);
    expect(
      validateOAuthRedirectUri('https://example.com/other?code=abc&state=xyz', {
        expectedRedirectUri: 'https://example.com/callback',
      })
    ).toBe(false);
  });
  it('rejects redirects missing required oauth params', () => {
    expect(validateOAuthRedirectUri('https://example.com/callback?code=abc')).toBe(false);
    expect(validateOAuthRedirectUri('https://example.com/callback?state=xyz')).toBe(false);
  });
  it('accepts oauth error redirects when state is present', () => {
    expect(
      validateOAuthRedirectUri('https://example.com/callback?error=access_denied&state=xyz')
    ).toBe(true);
  });
  it('allows preserved oauth params from a known source', () => {
    expect(
      validateOAuthRedirectUri('https://example.com/callback', {
        preservedQuerySource: 'https://example.com/callback?code=abc&state=xyz',
      })
    ).toBe(true);
  });
});
