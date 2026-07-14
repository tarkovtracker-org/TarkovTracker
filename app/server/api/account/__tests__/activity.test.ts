// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, H3EventContext } from 'h3';
const runtimeConfig = {
  accountIpHashSecret: 'audit-secret',
  apiProtection: { trustProxy: true },
  supabaseServiceKey: 'service-key',
  supabaseUrl: 'https://test.supabase.co',
};
const mockAdminSupabaseFetch = vi.fn();
const mockGetClientAddress = vi.fn();
const mockGetRequestHeader = vi.fn();
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3');
  return {
    ...actual,
    getRequestHeader: (...args: unknown[]) => mockGetRequestHeader(...args),
  };
});
vi.mock('@/server/utils/adminSupabase', () => ({
  adminSupabaseFetch: (...args: unknown[]) => mockAdminSupabaseFetch(...args),
}));
vi.mock('@/server/utils/requestIdentity', () => ({
  getClientAddress: (...args: unknown[]) => mockGetClientAddress(...args),
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
function makeEvent(userId: string | null): H3Event {
  return {
    context: userId ? { auth: { user: { id: userId } } } : ({} as H3EventContext),
  } as unknown as H3Event;
}
describe('POST /api/account/activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfig.accountIpHashSecret = 'audit-secret';
    runtimeConfig.supabaseServiceKey = 'service-key';
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    mockGetClientAddress.mockReturnValue('203.0.113.22');
    mockGetRequestHeader.mockReturnValue('TarkovTracker test');
    mockAdminSupabaseFetch.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.resetModules();
  });
  it('requires authentication', async () => {
    const { default: handler } = await import('@/server/api/account/activity.post');
    await expect(handler(makeEvent(null))).rejects.toMatchObject({ statusCode: 401 });
  });
  it('requires the private IP hashing secret', async () => {
    runtimeConfig.accountIpHashSecret = '';
    const { default: handler } = await import('@/server/api/account/activity.post');
    await expect(handler(makeEvent('user-1'))).rejects.toMatchObject({ statusCode: 500 });
  });
  it('stores a keyed hash rather than the raw IP address', async () => {
    const { default: handler } = await import('@/server/api/account/activity.post');
    await expect(handler(makeEvent('user-1'))).resolves.toEqual({ recorded: true });
    expect(mockGetClientAddress).toHaveBeenCalledWith(expect.anything(), true);
    expect(mockAdminSupabaseFetch).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'service-key',
      '/rest/v1/account_ip_audit?on_conflict=user_id,ip_hash',
      expect.objectContaining({ method: 'POST' })
    );
    const [, , , init] = mockAdminSupabaseFetch.mock.calls[0] as [
      string,
      string,
      string,
      RequestInit,
    ];
    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload).toMatchObject({ user_id: 'user-1', last_user_agent: 'TarkovTracker test' });
    expect(payload.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(payload)).not.toContain('203.0.113.22');
  });
  it('does not persist activity when no valid client address is available', async () => {
    mockGetClientAddress.mockReturnValue(null);
    const { default: handler } = await import('@/server/api/account/activity.post');
    await expect(handler(makeEvent('user-1'))).resolves.toEqual({ recorded: false });
    expect(mockAdminSupabaseFetch).not.toHaveBeenCalled();
  });
});
