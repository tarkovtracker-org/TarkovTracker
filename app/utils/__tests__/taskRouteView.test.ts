import { describe, expect, it } from 'vitest';
import {
  isTaskListPath,
  resolveLegacyTaskViewRedirect,
  resolveTaskRouteView,
} from '@/utils/taskRouteView';
describe('taskRouteView', () => {
  it.each([
    ['/tasks', 'list'],
    ['/tasks/', 'list'],
    ['/tasks/maps', 'maps'],
    ['/tasks/maps/', 'maps'],
    ['/tasks/traders', 'traders'],
    ['/tasks/graph', 'graph'],
    ['/tasks/unknown', 'list'],
  ])('resolves %s to the %s view', (path, view) => {
    expect(resolveTaskRouteView(path)).toBe(view);
  });
  it('only treats the list path as the list route', () => {
    expect(isTaskListPath('/tasks/')).toBe(true);
    expect(isTaskListPath('/tasks/maps')).toBe(false);
  });
  it.each([
    ['maps', '/tasks/maps'],
    ['graph', '/tasks/graph'],
    ['traders', '/tasks/traders'],
    ['all', '/tasks'],
    ['bogus', '/tasks'],
    ['constructor', '/tasks'],
    ['toString', '/tasks'],
  ])('sends ?view=%s to %s and keeps the other params', (view, path) => {
    expect(resolveLegacyTaskViewRedirect('/tasks', { view, trader: 'prapor', q: 'mole' })).toEqual({
      path,
      query: { trader: 'prapor', q: 'mole' },
    });
  });
  it('uses the first value of a repeated view param', () => {
    expect(resolveLegacyTaskViewRedirect('/tasks', { view: ['graph', 'maps'] })).toEqual({
      path: '/tasks/graph',
      query: {},
    });
  });
  it('leaves links without a view param and other routes alone', () => {
    expect(resolveLegacyTaskViewRedirect('/tasks', { q: 'mole' })).toBeNull();
    expect(resolveLegacyTaskViewRedirect('/tasks/maps', { view: 'graph' })).toBeNull();
    expect(resolveLegacyTaskViewRedirect('/hideout', { view: 'maps' })).toBeNull();
  });
});
