export const TOKEN_PERMISSIONS = ['GP', 'TP', 'WP'] as const;
export type TokenPermission = (typeof TOKEN_PERMISSIONS)[number];
export const isTokenPermission = (value: unknown): value is TokenPermission =>
  typeof value === 'string' && (TOKEN_PERMISSIONS as readonly string[]).includes(value);
const isSupportedPermissionList = (value: unknown): value is readonly TokenPermission[] =>
  Array.isArray(value) && value.length > 0 && value.every(isTokenPermission);
export const parseTokenPermissions = (value: unknown): TokenPermission[] | null =>
  isSupportedPermissionList(value) ? [...value] : null;
