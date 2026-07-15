import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addRole,
  classifyDiscordRoleStatus,
  DISCORD_REQUEST_TIMEOUT_MS,
  removeRole,
} from './discord.ts';

type DenoEnv = {
  get: (key: string) => string | undefined;
};

function stubDiscordEnv(values: Record<string, string> = {}) {
  const env: Record<string, string> = {
    DISCORD_BOT_TOKEN: 'bot-token',
    DISCORD_GUILD_ID: 'guild-1',
    DISCORD_SUPPORTER_ROLE_ID: 'supporter-role',
    ...values,
  };

  const deno = {
    env: {
      get: (key: string) => env[key],
    } satisfies DenoEnv,
  };

  vi.stubGlobal('Deno', deno);
}

describe('classifyDiscordRoleStatus', () => {
  it('classifies successful role changes', () => {
    expect(classifyDiscordRoleStatus(204)).toBe('success');
    expect(classifyDiscordRoleStatus(200)).toBe('success');
  });

  it('classifies unknown members and users as not in the guild', () => {
    expect(classifyDiscordRoleStatus(404, 10007)).toBe('not_in_guild');
    expect(classifyDiscordRoleStatus(404, 10013)).toBe('not_in_guild');
  });

  it('keeps other Discord failures distinct', () => {
    expect(classifyDiscordRoleStatus(403, 50013)).toBe('failed');
    expect(classifyDiscordRoleStatus(404)).toBe('failed');
  });
});

describe('discordFetch role operations', () => {
  beforeEach(() => {
    stubDiscordEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects stalled Discord requests after the total deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
            return;
          }
          signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            },
            { once: true }
          );
        });
      })
    );

    const pending = addRole({
      guildId: 'guild-1',
      userId: 'user-1',
      roleId: 'role-1',
    });
    const expectation = expect(pending).rejects.toThrow(
      `Discord request timed out after ${DISCORD_REQUEST_TIMEOUT_MS}ms`
    );

    await vi.advanceTimersByTimeAsync(DISCORD_REQUEST_TIMEOUT_MS);
    await expectation;
  });

  it('retries on 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { 'retry-after': '1' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();

    const pending = addRole({
      guildId: 'guild-1',
      userId: 'user-1',
      roleId: 'role-1',
    });

    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts rate-limit waits when the total deadline elapses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { 'retry-after': '30' },
      })
    );

    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();

    const pending = removeRole({
      guildId: 'guild-1',
      userId: 'user-1',
      roleId: 'role-1',
    });
    const expectation = expect(pending).rejects.toThrow(
      `Discord request timed out after ${DISCORD_REQUEST_TIMEOUT_MS}ms`
    );

    await vi.advanceTimersByTimeAsync(DISCORD_REQUEST_TIMEOUT_MS);
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns false for non-timeout Discord API failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 50013 }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await expect(
      addRole({
        guildId: 'guild-1',
        userId: 'user-1',
        roleId: 'role-1',
      })
    ).resolves.toBe(false);
  });
});
