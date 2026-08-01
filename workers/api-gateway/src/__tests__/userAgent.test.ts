import { describe, expect, it } from 'vitest';
import { INBOUND_USER_AGENT_MAX_LENGTH, normalizeInboundUserAgent } from '../utils/userAgent';

describe('normalizeInboundUserAgent', () => {
  it.each([null, undefined, '', '   '])('returns null for %s', (value) => {
    expect(normalizeInboundUserAgent(value)).toBeNull();
  });

  it('trims valid values', () => {
    expect(normalizeInboundUserAgent('  Client/1.0  ')).toBe('Client/1.0');
  });

  it('rejects oversized values', () => {
    const value = 'x'.repeat(INBOUND_USER_AGENT_MAX_LENGTH + 1);
    expect(normalizeInboundUserAgent(value)).toBeNull();
  });
});
