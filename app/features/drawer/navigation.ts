const SETTINGS_ROUTE_PATHS = new Set([
  '/settings',
  '/account',
  '/progression',
  '/prestige',
  '/preferences',
]);
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
  if (targetPath === '/resources') {
    return routePath === '/resources' || routePath.startsWith('/resources/');
  }
  return routePath === targetPath;
};
export const getDrawerIconClass = (isActive: boolean): string =>
  isActive
    ? 'text-white light:text-surface-50'
    : 'text-surface-300 group-hover:text-white light:group-hover:text-surface-50';
