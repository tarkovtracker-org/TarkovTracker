import { expect, it } from 'vitest';
import { ADMIN_ERROR_CODES, type AdminErrorCode } from '@/utils/adminErrors';
import type { H3Event } from 'h3';
interface AdminRuntimeConfig {
  supabaseServiceKey: string;
  supabaseUrl: string;
}
interface AdminFetchMock {
  mockResolvedValueOnce(value: unknown): unknown;
}
type AdminEventFactory = (authUser: { id?: string } | null) => H3Event;
type AdminHandler = (event: H3Event) => Promise<unknown>;
type AdminHandlerLoader = () => Promise<{ default: AdminHandler }>;
export async function expectAdminError(
  result: Promise<unknown>,
  statusCode: number,
  code: AdminErrorCode
): Promise<void> {
  await expect(result).rejects.toMatchObject({ statusCode, data: { code } });
}
export function defineAdminAccessTests(
  runtimeConfig: AdminRuntimeConfig,
  mockFetch: AdminFetchMock,
  makeEvent: AdminEventFactory,
  jsonResponse: (body: unknown) => Response,
  loadHandler: AdminHandlerLoader
): void {
  it('requires service config', async () => {
    const originalServiceKey = runtimeConfig.supabaseServiceKey;
    runtimeConfig.supabaseServiceKey = '';
    try {
      const { default: handler } = await loadHandler();
      await expectAdminError(
        handler(makeEvent({ id: 'admin-1' })),
        500,
        ADMIN_ERROR_CODES.SERVICE_CONFIG_MISSING
      );
    } finally {
      runtimeConfig.supabaseServiceKey = originalServiceKey;
    }
  });
  it('requires authentication', async () => {
    const { default: handler } = await loadHandler();
    await expectAdminError(
      handler(makeEvent(null)),
      401,
      ADMIN_ERROR_CODES.AUTHENTICATION_REQUIRED
    );
  });
  it('rejects non-admin users', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ is_admin: false }]));
    const { default: handler } = await loadHandler();
    await expectAdminError(
      handler(makeEvent({ id: 'user-1' })),
      403,
      ADMIN_ERROR_CODES.ADMIN_PRIVILEGES_REQUIRED
    );
  });
}
