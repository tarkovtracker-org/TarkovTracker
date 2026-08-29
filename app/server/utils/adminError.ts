import { createError } from 'h3';
import type { AdminErrorCode } from '@/utils/adminErrors';
export function createAdminError(
  statusCode: number,
  code: AdminErrorCode,
  message: string
): ReturnType<typeof createError> {
  return createError({ statusCode, message, data: { code } });
}
