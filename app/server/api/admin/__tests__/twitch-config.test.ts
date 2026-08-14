// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('requires service config', async () => {
    runtimeConfig.supabaseServiceKey = '';
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 500,
    });
  });
  it('requires authentication', async () => {
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent(null))).rejects.toMatchObject({ statusCode: 401 });
  });
  it('rejects non-admin users', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: false }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it('upserts the Twitch config and writes an audit log', async () => {
    mockReadBody.mockResolvedValue({
      channel: 'NewStreamer',
      displayName: 'New Streamer',
      enabled: false,
    });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }])).mockResolvedValueOnce(
      jsonResponse([
        {
          value: { channel: 'newstreamer', displayName: 'New Streamer', enabled: false },
          version: 4,
        },
      ])
    );
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    const result = await handler(makeEvent({ id: 'admin-1', email: 'admin@example.com' }));
    expect(result).toEqual({
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
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }])).mockResolvedValueOnce(
      jsonResponse([
        {
          value: { channel: 'onlychannel', displayName: 'onlychannel', enabled: true },
          version: 1,
        },
      ])
    );
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await handler(makeEvent({ id: 'admin-1' }));
    const upsertCall = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(upsertCall[1].body as string)).toMatchObject({
      p_value: { channel: 'onlychannel', displayName: 'onlychannel', enabled: true },
    });
  });
  it.each(['bad name!', 'a'.repeat(26)])('validates the channel name %s', async (channel) => {
    mockReadBody.mockResolvedValue({ channel, enabled: true });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it('validates the enabled flag', async () => {
    mockReadBody.mockResolvedValue({ channel: 'validchannel', enabled: 'yes' });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it('validates the display name length', async () => {
    mockReadBody.mockResolvedValue({
      channel: 'validchannel',
      displayName: 'x'.repeat(51),
      enabled: true,
    });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it('rejects a non-string display name', async () => {
    mockReadBody.mockResolvedValue({ channel: 'validchannel', displayName: 123, enabled: true });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it.each([null, undefined])('rejects an empty body (%s) with a 400', async (body) => {
    mockReadBody.mockResolvedValue(body);
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it('normalizes a Supabase URL that carries a query string', async () => {
    runtimeConfig.supabaseUrl = 'https://test.supabase.co/?apikey=leaked';
    mockReadBody.mockResolvedValue({ channel: 'validchannel', enabled: true });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }])).mockResolvedValueOnce(
      jsonResponse([
        {
          value: { channel: 'validchannel', displayName: 'validchannel', enabled: true },
          version: 1,
        },
      ])
    );
    const { default: handler } = await import('@/server/api/admin/twitch-config.post');
    await handler(makeEvent({ id: 'admin-1' }));
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://test.supabase.co/rest/v1/user_system?select=is_admin&user_id=eq.admin-1&limit=1'
    );
  });
});
