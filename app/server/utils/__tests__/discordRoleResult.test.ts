import { describe, expect, it } from 'vitest';
/**
 * Mirrors the Discord error-code classification used by
 * supabase/functions/_shared/discord.ts so Vitest can cover the pure policy
 * without the Deno edge runtime.
 */
const DISCORD_ERROR_UNKNOWN_MEMBER = 10007;
const DISCORD_ERROR_UNKNOWN_USER = 10013;
function classifyDiscordRoleStatus(
  status: number,
  errorCode: number | null
): 'ok' | 'not_in_guild' | 'failed' {
  if (status === 204 || status === 200) return 'ok';
  if (errorCode === DISCORD_ERROR_UNKNOWN_MEMBER || errorCode === DISCORD_ERROR_UNKNOWN_USER) {
    return 'not_in_guild';
  }
  return 'failed';
}
describe('Discord role status classification', () => {
  it('treats 200/204 as success', () => {
    expect(classifyDiscordRoleStatus(204, null)).toBe('ok');
    expect(classifyDiscordRoleStatus(200, null)).toBe('ok');
  });
  it('classifies unknown member/user as not_in_guild', () => {
    expect(classifyDiscordRoleStatus(404, DISCORD_ERROR_UNKNOWN_MEMBER)).toBe('not_in_guild');
    expect(classifyDiscordRoleStatus(404, DISCORD_ERROR_UNKNOWN_USER)).toBe('not_in_guild');
  });
  it('classifies other failures as retryable failures', () => {
    expect(classifyDiscordRoleStatus(403, 50013)).toBe('failed');
    expect(classifyDiscordRoleStatus(500, null)).toBe('failed');
    expect(classifyDiscordRoleStatus(404, null)).toBe('failed');
  });
});
