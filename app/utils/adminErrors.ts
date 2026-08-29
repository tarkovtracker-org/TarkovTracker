export const ADMIN_ERROR_CODES = {
  ADMIN_PRIVILEGES_REQUIRED: 'admin_privileges_required',
  AUTHENTICATION_REQUIRED: 'authentication_required',
  INVALID_CHANNEL: 'invalid_channel',
  INVALID_DISPLAY_NAME: 'invalid_display_name',
  INVALID_ENABLED_FLAG: 'invalid_enabled_flag',
  INVALID_REQUEST_BODY: 'invalid_request_body',
  INVALID_TARGET_USER_ID: 'invalid_target_user_id',
  INVALID_TIER: 'invalid_tier',
  SERVICE_CONFIG_MISSING: 'service_config_missing',
  SUPABASE_REQUEST_FAILED: 'supabase_request_failed',
  SUPPORTER_UPDATE_FAILED: 'supporter_update_failed',
  TWITCH_CONFIG_UPDATE_FAILED: 'twitch_config_update_failed',
} as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[keyof typeof ADMIN_ERROR_CODES];
export const ADMIN_ERROR_LOCALE_KEYS: Record<AdminErrorCode, string> = {
  [ADMIN_ERROR_CODES.ADMIN_PRIVILEGES_REQUIRED]: 'admin.error.admin_privileges_required',
  [ADMIN_ERROR_CODES.AUTHENTICATION_REQUIRED]: 'admin.error.authentication_required',
  [ADMIN_ERROR_CODES.INVALID_CHANNEL]: 'admin.error.invalid_channel',
  [ADMIN_ERROR_CODES.INVALID_DISPLAY_NAME]: 'admin.error.invalid_display_name',
  [ADMIN_ERROR_CODES.INVALID_ENABLED_FLAG]: 'admin.error.invalid_enabled_flag',
  [ADMIN_ERROR_CODES.INVALID_REQUEST_BODY]: 'admin.error.invalid_request_body',
  [ADMIN_ERROR_CODES.INVALID_TARGET_USER_ID]: 'admin.error.invalid_target_user_id',
  [ADMIN_ERROR_CODES.INVALID_TIER]: 'admin.error.invalid_tier',
  [ADMIN_ERROR_CODES.SERVICE_CONFIG_MISSING]: 'admin.error.service_config_missing',
  [ADMIN_ERROR_CODES.SUPABASE_REQUEST_FAILED]: 'admin.error.supabase_request_failed',
  [ADMIN_ERROR_CODES.SUPPORTER_UPDATE_FAILED]: 'admin.error.supporter_update_failed',
  [ADMIN_ERROR_CODES.TWITCH_CONFIG_UPDATE_FAILED]: 'admin.error.twitch_config_update_failed',
};
const ADMIN_ERROR_CODE_SET = new Set<AdminErrorCode>(Object.values(ADMIN_ERROR_CODES));
function isObjectLike(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}
function readProperty(value: unknown, key: string): unknown {
  if (!isObjectLike(value)) {
    return undefined;
  }
  return readPropertySafely(value, key);
}
function readPropertySafely(value: object, key: string): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}
function readAdminErrorCode(error: unknown): unknown {
  const errorData = readProperty(error, 'data');
  return readProperty(readProperty(errorData, 'data'), 'code') ?? readProperty(errorData, 'code');
}
function isAdminErrorCode(value: unknown): value is AdminErrorCode {
  return typeof value === 'string' && ADMIN_ERROR_CODE_SET.has(value as AdminErrorCode);
}
export const getAdminErrorCode = (error: unknown): AdminErrorCode | null => {
  const code = readAdminErrorCode(error);
  return isAdminErrorCode(code) ? code : null;
};
