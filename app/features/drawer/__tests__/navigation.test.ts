import { describe, expect, it } from 'vitest';
import { isNavigationRouteActive } from '@/features/drawer/navigation';
describe('isNavigationRouteActive', () => {
  it('returns false when target path is missing', () => {
    expect(isNavigationRouteActive(null, '/resources')).toBe(false);
    expect(isNavigationRouteActive(undefined, '/resources')).toBe(false);
    expect(isNavigationRouteActive('', '/resources')).toBe(false);
  });
  it.each(['/settings', '/account', '/prestige', '/preferences', '/progression'])(
    'marks settings active on %s',
    (path) => {
      expect(isNavigationRouteActive('/settings', path)).toBe(true);
    }
  );
  it('does not mark settings active outside the settings route group', () => {
    expect(isNavigationRouteActive('/settings', '/tasks')).toBe(false);
    expect(isNavigationRouteActive('/settings', '/resources')).toBe(false);
  });
  it.each(['/resources', '/resources/ratscanner', '/resources/tarkovmonitor', '/resources/'])(
    'marks resources active on %s',
    (path) => {
      expect(isNavigationRouteActive('/resources', path)).toBe(true);
    }
  );
  it.each(['/tasks', '/settings', '/resourcesevil', '/resource'])(
    'does not mark resources active on %s',
    (path) => {
      expect(isNavigationRouteActive('/resources', path)).toBe(false);
    }
  );
  it('uses exact match for ordinary routes', () => {
    expect(isNavigationRouteActive('/hideout', '/hideout')).toBe(true);
    expect(isNavigationRouteActive('/hideout', '/hideout/extra')).toBe(false);
  });
  it.each(['/tasks', '/tasks/traders', '/tasks/maps', '/tasks/graph'])(
    'keeps Tasks active on the %s view',
    (path) => {
      expect(isNavigationRouteActive('/tasks', path)).toBe(true);
    }
  );
  it.each(['/tasksevil', '/task', '/storyline'])('does not mark Tasks active on %s', (path) => {
    expect(isNavigationRouteActive('/tasks', path)).toBe(false);
  });
});
