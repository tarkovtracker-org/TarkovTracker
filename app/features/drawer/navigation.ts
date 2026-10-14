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
export const getDrawerIconClass = (isActive: boolean): string =>
  isActive
    ? 'text-white light:text-surface-50'
    : 'text-surface-300 group-hover:text-white light:group-hover:text-surface-50';
