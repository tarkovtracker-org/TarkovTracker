// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import tasksLegacyViewMiddleware from '@/middleware/tasks-legacy-view.global';
const { navigateToMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn((target: unknown) => target),
}));
mockNuxtImport('navigateTo', () => navigateToMock);
mockNuxtImport(
  'defineNuxtRouteMiddleware',
  () => (handler: (...args: unknown[]) => unknown) => handler
);
type RouteArg = Parameters<typeof tasksLegacyViewMiddleware>[0];
const run = (path: string, query: Record<string, string>) =>
  tasksLegacyViewMiddleware({ path, query } as unknown as RouteArg, {} as RouteArg);
describe('tasks legacy view middleware', () => {
  beforeEach(() => {
    navigateToMock.mockClear();
  });
  it('replaces an old ?view=maps link with the maps route', () => {
    const target = { path: '/tasks/maps', query: { q: 'mole' } };
    expect(run('/tasks', { view: 'maps', q: 'mole' })).toEqual(target);
    expect(navigateToMock).toHaveBeenCalledWith(target, { replace: true });
  });
  it('lets ordinary task links through', () => {
    expect(run('/tasks', { q: 'mole' })).toBeUndefined();
    expect(run('/tasks/graph', {})).toBeUndefined();
    expect(navigateToMock).not.toHaveBeenCalled();
  });
});
