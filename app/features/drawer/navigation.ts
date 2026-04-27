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
) => {
  if (!targetPath) {
    return false;
  }
  if (targetPath === '/settings') {
    return SETTINGS_ROUTE_PATHS.has(routePath);
  }
  return routePath === targetPath;
};
