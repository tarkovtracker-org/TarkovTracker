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
    error: vi.fn(),
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
function emptyResponse(status = 204): Response {
  return {
    ok: true,
    status,
    text: async () => '',
  } as Response;
}
describe('POST /api/admin/supporter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockReadBody.mockReset();
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
  });
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });
  it('requires service config', async () => {
    runtimeConfig.supabaseServiceKey = '';
    const { default: handler } = await import('@/server/api/admin/supporter.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 500,
    });
  });
  it('requires authentication', async () => {
    const { default: handler } = await import('@/server/api/admin/supporter.post');
    await expect(handler(makeEvent(null))).rejects.toMatchObject({ statusCode: 401 });
  });
  it('rejects non-admin users', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: false }]));
    const { default: handler } = await import('@/server/api/admin/supporter.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it('normalizes Supabase fetch failures', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network unavailable'));
    const { default: handler } = await import('@/server/api/admin/supporter.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 502,
    });
  });
  it('upserts an active supporter tier for admins', async () => {
    mockReadBody.mockResolvedValue({
      enabled: true,
      targetUserId: 'c191868d-26e3-40f0-87e0-b2bc07d95d4c',
      tier: 'chad',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ is_admin: true }]))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            expires_at: null,
            has_ever_supported: true,
            started_at: '2026-05-28T12:00:00.000Z',
            status: 'active',
            tier: 'chad',
            type: 'subscription',
          },
        ])
      )
      .mockResolvedValueOnce(emptyResponse());
    const { default: handler } = await import('@/server/api/admin/supporter.post');
    const result = await handler(makeEvent({ id: 'admin-1', email: 'admin@example.com' }));
    expect(result).toEqual({
      supporter: {
        expiresAt: null,
        hasEverSupported: true,
        startedAt: '2026-05-28T12:00:00.000Z',
        status: 'active',
        tier: 'chad',
        type: 'subscription',
      },
    });
    const [, upsertInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(upsertInit.body as string)).toMatchObject({
      expires_at: null,
      has_ever_supported: true,
      status: 'active',
      tier: 'chad',
      type: 'subscription',
      user_id: 'c191868d-26e3-40f0-87e0-b2bc07d95d4c',
    });
  });
  it('disables active supporter access by expiring the row', async () => {
    mockReadBody.mockResolvedValue({
      enabled: false,
      targetUserId: 'c191868d-26e3-40f0-87e0-b2bc07d95d4c',
      tier: 'chad',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ is_admin: true }]))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            expires_at: '2026-05-28T12:00:00.000Z',
            has_ever_supported: true,
            started_at: '2026-05-28T12:00:00.000Z',
            status: 'expired',
            tier: 'supporter',
            type: 'subscription',
          },
        ])
      )
      .mockResolvedValueOnce(emptyResponse());
    const { default: handler } = await import('@/server/api/admin/supporter.post');
    await handler(makeEvent({ id: 'admin-1' }));
    const [, upsertInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(upsertInit.body as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      status: 'expired',
      tier: 'supporter',
      type: 'subscription',
      has_ever_supported: true,
    });
    expect(typeof payload.expires_at).toBe('string');
  });
  it('validates target user id', async () => {
    mockReadBody.mockResolvedValue({
      enabled: true,
      targetUserId: 'not-a-user-id',
      tier: 'chad',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/supporter.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it('validates tier', async () => {
    mockReadBody.mockResolvedValue({
      enabled: true,
      targetUserId: 'c191868d-26e3-40f0-87e0-b2bc07d95d4c',
      tier: 'invalid-tier',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: true }]));
    const { default: handler } = await import('@/server/api/admin/supporter.post');
    await expect(handler(makeEvent({ id: 'admin-1' }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
