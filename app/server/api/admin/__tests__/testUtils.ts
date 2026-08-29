import { expect } from 'vitest';
import type { AdminErrorCode } from '@/utils/adminErrors';
export async function expectAdminError(
  result: Promise<unknown>,
  statusCode: number,
  code: AdminErrorCode
): Promise<void> {
  await expect(result).rejects.toMatchObject({ statusCode, data: { code } });
}
