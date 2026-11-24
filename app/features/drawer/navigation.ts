const SETTINGS_ROUTE_PATHS = new Set([
  '/settings',
  '/account',
  '/progression',
  '/prestige',
  '/preferences',
]);
const SECTION_ROUTE_PATHS = new Set(['/resources', '/tasks']);
export const isNavigationRouteActive = (
  targetPath: string | null | undefined,
  routePath: string
): boolean => {
  if (!targetPath) {
    return false;
  }
  if (targetPath === '/settings') {
    return SETTINGS_ROUTE_PATHS.has(routePath);
  }
  // Section entries stay highlighted on their sub-pages, such as the task views.
  if (SECTION_ROUTE_PATHS.has(targetPath)) {
    return routePath === targetPath || routePath.startsWith(`${targetPath}/`);
  }
  return routePath === targetPath;
};
/**
 * Image icons keep their own artwork colors, so opacity carries the inactive and hover states for
 * them; icon-font glyphs also follow the text color.
 */
export const getDrawerIconClass = (isActive: boolean): string =>
  isActive
    ? 'text-white transition-opacity light:text-surface-50'
    : 'text-surface-300 opacity-75 transition-opacity group-hover:text-white group-hover:opacity-100 light:group-hover:text-surface-50';
