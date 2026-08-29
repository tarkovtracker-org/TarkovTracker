import { createError, readBody } from 'h3';
import { ADMIN_ERROR_CODES, type AdminErrorCode } from '@/utils/adminErrors';
import type { H3Event } from 'h3';
export function createAdminError(
  statusCode: number,
  code: AdminErrorCode,
  message: string
): ReturnType<typeof createError> {
  return createError({ statusCode, statusMessage: message, message, data: { code } });
}
export async function readAdminBody<T>(event: H3Event): Promise<T> {
  const body = await readAdminBodyValue(event);
  if (!isAdminBody(body)) throw invalidAdminBodyError();
  return body as T;
}
async function readAdminBodyValue(event: H3Event): Promise<unknown> {
  try {
    return await readBody(event);
  } catch {
    throw invalidAdminBodyError();
  }
}
function isAdminBody(body: unknown): body is object {
  return body !== null && typeof body === 'object' && !Array.isArray(body);
}
function invalidAdminBodyError(): ReturnType<typeof createError> {
  return createAdminError(400, ADMIN_ERROR_CODES.INVALID_REQUEST_BODY, 'Invalid request body');
}
