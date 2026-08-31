// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_ERROR_CODES } from '@/utils/adminErrors';
import { defineAdminAccessTests, expectAdminError } from './testUtils';
import type { H3Event, H3EventContext } from 'h3';
const runtimeConfig = {
  supabaseServiceKey: 'service-key',
  supabaseUrl: 'https://test.supabase.co',
};
const mockFetch = vi.fn();
const mockReadBody = vi.fn();
const loggerErrorMock = vi.fn();
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3');
  return {
    ...actual,
    readBody: (...args: unknown[]) => mockReadBody(...args),
  };
});
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
function makeEvent(authUser: { id?: string; email?: string } | null): H3Event {
  return {
    context: authUser ? { auth: { user: authUser } } : ({} as H3EventContext),
    node: {
      req: {
        headers: authUser ? { authorization: 'Bearer admin-token' } : {},
      },
    },
  } as unknown as H3Event;
}
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  const text = JSON.stringify(body);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => text,
  } as Response;
}
describe('POST /api/admin/twitch-config', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockReadBody.mockReset();
    loggerErrorMock.mockReset();
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
  });
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });
  defineAdminAccessTests(
    runtimeConfig,
    mockFetch,
    makeEvent,
    jsonResponse,
    () => import('@/server/api/admin/twitch-config.post')
  );
  it.each(['http://test.supabase.co', 'ftp://test.supabase.co'])(
    'rejects a non-HTTPS Supabase URL (%s)',
    async (url) => {
      runtimeConfig.supabaseUrl = url;
      const { default: handler } = await import('@/server/api/admin/twitch-config.post');
      await expectAdminError(
        handler(makeEvent({ id: 'admin-1' })),
        500,
        ADMIN_ERROR_CODES.SERVICE_CONFIG_MISSING
      );
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );
  it('upserts the Twitch config, writes an audit log, and purges the cache tag', async () => {
    mockReadBody.mockResolvedValue({
      channel: 'NewStreamer',
      displayName: 'New Streamer',
      enabled: false,
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ is_admin: true }]))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            value: { channel: 'newstreamer', displayName: 'New Streamer', enabled: false },
            version: 4,
          },
        ])
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    const result = await handler(makeEvent({ id: 'admin-1', email: 'admin@example.com' }));
    expect(result).toEqual({
      cacheInvalidated: true,
      config: { channel: 'newstreamer', displayName: 'New Streamer', enabled: false },
      version: 4,
    });
    const updateCall = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(updateCall[0]).toContain('/rest/v1/rpc/update_promoted_twitch_config');
    expect(JSON.parse(updateCall[1].body as string)).toEqual({
      p_value: { channel: 'newstreamer', displayName: 'New Streamer', enabled: false },
      p_admin_user_id: 'admin-1',
      p_admin_email: 'admin@example.com',
    });
    const purgeCall = mockFetch.mock.calls[2] as [string, RequestInit];
    expect(purgeCall[0]).toBe('https://test.supabase.co/functions/v1/admin-cache-purge');
    expect(purgeCall[1].headers).toMatchObject({ Authorization: 'Bearer admin-token' });
    expect(JSON.parse(purgeCall[1].body as string)).toEqual({ purgeType: 'twitch-config' });
  });
  it('does not purge the cache when the database update fails', async () => {
    mockReadBody.mockResolvedValue({ channel: 'validchannel', enabled: true });
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ is_admin: true }]))
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expectAdminError(
      handler(makeEvent({ id: 'admin-1' })),
      502,
      ADMIN_ERROR_CODES.SUPABASE_REQUEST_FAILED
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
  it('returns a stable code when the config update returns no row', async () => {
    mockReadBody.mockResolvedValue({ channel: 'validchannel', enabled: true });
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ is_admin: true }]))
      .mockResolvedValueOnce(jsonResponse([]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expectAdminError(
      handler(makeEvent({ id: 'admin-1' })),
      502,
      ADMIN_ERROR_CODES.TWITCH_CONFIG_UPDATE_FAILED
    );
  });
  it('returns the committed config with a warning when the cache purge fails', async () => {
    mockReadBody.mockResolvedValue({ channel: 'validchannel', enabled: true });
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ is_admin: true }]))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            value: { channel: 'validchannel', displayName: 'validchannel', enabled: true },
            version: 2,
          },
        ])
      )
      .mockResolvedValueOnce(jsonResponse({ success: false }, { ok: false, status: 502 }));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).resolves.toEqual({
      cacheInvalidated: false,
      config: { channel: 'validchannel', displayName: 'validchannel', enabled: true },
      version: 2,
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      '[AdminTwitchConfig] Failed to purge Twitch config cache',
      expect.objectContaining({
        action: 'purge_promoted_twitch_config',
        adminUserId: 'admin-1',
      })
    );
  });
  it('returns the committed config with a warning when purge authorization is missing', async () => {
    mockReadBody.mockResolvedValue({ channel: 'validchannel', enabled: true });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }])).mockResolvedValueOnce(
      jsonResponse([
        {
          value: { channel: 'validchannel', displayName: 'validchannel', enabled: true },
          version: 2,
        },
      ])
    );
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    const event = makeEvent({ id: 'admin-1' });
    (event as unknown as { node: { req: { headers: Record<string, string> } } }).node.req.headers =
      {};
    await expect(handler(event)).resolves.toEqual({
      cacheInvalidated: false,
      config: { channel: 'validchannel', displayName: 'validchannel', enabled: true },
      version: 2,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
  it('logs and propagates a transactional update failure', async () => {
    mockReadBody.mockResolvedValue({ channel: 'validchannel', enabled: true });
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ is_admin: true }]))
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({ statusCode: 502 });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      '[AdminTwitchConfig] Failed to update Twitch config',
      {
        action: 'update_promoted_twitch_config',
        adminUserId: 'admin-1',
        error: expect.objectContaining({ statusCode: 502 }),
      }
    );
  });
  it('defaults the display name to the channel when omitted', async () => {
    mockReadBody.mockResolvedValue({ channel: 'OnlyChannel', enabled: true });
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ is_admin: true }]))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            value: { channel: 'onlychannel', displayName: 'onlychannel', enabled: true },
            version: 1,
          },
        ])
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await handler(makeEvent({ id: 'admin-1' }));
    const upsertCall = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(upsertCall[1].body as string)).toMatchObject({
      p_value: { channel: 'onlychannel', displayName: 'onlychannel', enabled: true },
    });
  });
  it.each(['bad name!', 'a'.repeat(26), 123])('validates the channel name %s', async (channel) => {
    mockReadBody.mockResolvedValue({ channel, enabled: true });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expectAdminError(
      handler(makeEvent({ id: 'admin-1' })),
      400,
      ADMIN_ERROR_CODES.INVALID_CHANNEL
    );
  });
  it('validates the enabled flag', async () => {
    mockReadBody.mockResolvedValue({ channel: 'validchannel', enabled: 'yes' });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expectAdminError(
      handler(makeEvent({ id: 'admin-1' })),
      400,
      ADMIN_ERROR_CODES.INVALID_ENABLED_FLAG
    );
  });
  it.each([
    { displayName: 'x'.repeat(51), label: 'length' },
    { displayName: 123, label: 'type' },
  ])('validates the display name $label', async ({ displayName }) => {
    mockReadBody.mockResolvedValue({
      channel: 'validchannel',
      displayName,
      enabled: true,
    });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expectAdminError(
      handler(makeEvent({ id: 'admin-1' })),
      400,
      ADMIN_ERROR_CODES.INVALID_DISPLAY_NAME
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it.each([null, undefined])('rejects an empty body (%s) with a 400', async (body) => {
    mockReadBody.mockResolvedValue(body);
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expectAdminError(
      handler(makeEvent({ id: 'admin-1' })),
      400,
      ADMIN_ERROR_CODES.INVALID_REQUEST_BODY
    );
  });
  it('normalizes a Supabase URL that carries a query string', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co/?apikey=leaked';
    mockReadBody.mockResolvedValue({ channel: 'validchannel', enabled: true });
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ is_admin: true }]))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            value: { channel: 'validchannel', displayName: 'validchannel', enabled: true },
            version: 1,
          },
        ])
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await handler(makeEvent({ id: 'admin-1' }));
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://test.supabase.co/rest/v1/user_system?select=is_admin&user_id=eq.admin-1&limit=1'
    );
  });
});
