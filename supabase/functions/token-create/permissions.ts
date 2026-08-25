export const TOKEN_PERMISSIONS = ['GP', 'TP', 'WP'] as const;
export type TokenPermission = (typeof TOKEN_PERMISSIONS)[number];
export const isTokenPermission = (value: unknown): value is TokenPermission =>
  typeof value === 'string' && (TOKEN_PERMISSIONS as readonly string[]).includes(value);
export const parseTokenPermissions = (value: unknown): TokenPermission[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const permissions: TokenPermission[] = [];
  for (const permission of value) {
    if (!isTokenPermission(permission)) return null;
    permissions.push(permission);
  }
  return permissions;
};
