import { describe, it, expect } from 'vitest';
import {
  computeCriticalPathFloor,
  computeConfidence,
  dampenPace,
} from '@/features/profile/kappaProjectionHelpers';
import type { Task } from '@/types/tarkov';
const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  kappaRequired: true,
  ...overrides,
});
describe('kappaProjectionHelpers', () => {
  describe('computeConfidence', () => {
    it('returns null when sampleCount < 3', () => {
      expect(computeConfidence(2, 10)).toBeNull();
    });
    it('returns low when count >= 3 but days < 3', () => {
      expect(computeConfidence(37, 1)).toBe('low');
    });
    it('returns low when count >= 7 but days < 3', () => {
      expect(computeConfidence(10, 2)).toBe('low');
    });
    it('returns medium when count >= 7 and days >= 3', () => {
      expect(computeConfidence(7, 3)).toBe('medium');
    });
    it('returns medium when count >= 7 and days >= 3 but count < 15', () => {
      expect(computeConfidence(14, 5)).toBe('medium');
    });
    it('returns medium when count >= 15 but days < 7', () => {
      expect(computeConfidence(20, 5)).toBe('medium');
    });
    it('returns high when count >= 15 and days >= 7', () => {
      expect(computeConfidence(15, 7)).toBe('high');
    });
    it('returns high with large values', () => {
      expect(computeConfidence(100, 30)).toBe('high');
    });
    it('returns low when count is 3 and days is 1', () => {
      expect(computeConfidence(3, 1)).toBe('low');
    });
  });
  describe('dampenPace', () => {
    it('returns raw pace when sampleDays >= 3', () => {
      expect(dampenPace(5, 3)).toBe(5);
      expect(dampenPace(10, 10)).toBe(10);
    });
    it('dampens to 1/3 for 1-day sample', () => {
      expect(dampenPace(30, 1)).toBeCloseTo(10, 5);
    });
    it('dampens to 2/3 for 2-day sample', () => {
      expect(dampenPace(30, 2)).toBeCloseTo(20, 5);
    });
    it('returns 0 when raw pace is 0', () => {
      expect(dampenPace(0, 1)).toBe(0);
    });
  });
  describe('computeCriticalPathFloor', () => {
    it('returns 0 when no remaining kappa tasks', () => {
      const result = computeCriticalPathFloor([], new Map(), new Set(), 50);
      expect(result.floor).toBe(0);
    });
    it('returns 1 for a single task with no predecessors', () => {
      const task = makeTask('a');
      const allTasks = new Map([['a', task]]);
      const result = computeCriticalPathFloor([task], allTasks, new Set(), 50);
      expect(result.floor).toBe(1);
    });
    it('counts chain of incomplete predecessors', () => {
      const a = makeTask('a');
      const b = makeTask('b', { predecessors: ['a'] });
      const c = makeTask('c', { predecessors: ['b'] });
      const allTasks = new Map([
        ['a', a],
        ['b', b],
        ['c', c],
      ]);
      const result = computeCriticalPathFloor([a, b, c], allTasks, new Set(), 50);
      expect(result.floor).toBe(3);
      expect(result.longestChainTaskId).toBe('c');
    });
    it('does not count completed predecessors in chain', () => {
      const a = makeTask('a');
      const b = makeTask('b', { predecessors: ['a'] });
      const c = makeTask('c', { predecessors: ['b'] });
      const allTasks = new Map([
        ['a', a],
        ['b', b],
        ['c', c],
      ]);
      const completed = new Set(['a']);
      const result = computeCriticalPathFloor([b, c], allTasks, completed, 50);
      expect(result.floor).toBe(2);
      expect(result.longestChainTaskId).toBe('c');
    });
    it('adds level gap penalty', () => {
      const task = makeTask('a', { minPlayerLevel: 40 });
      const allTasks = new Map([['a', task]]);
      const result = computeCriticalPathFloor([task], allTasks, new Set(), 20);
      expect(result.floor).toBe(21);
    });
    it('does not add level gap when player meets requirement', () => {
      const task = makeTask('a', { minPlayerLevel: 15 });
      const allTasks = new Map([['a', task]]);
      const result = computeCriticalPathFloor([task], allTasks, new Set(), 20);
      expect(result.floor).toBe(1);
    });
    it('picks the longest chain across multiple branches', () => {
      const a = makeTask('a');
      const b = makeTask('b', { predecessors: ['a'] });
      const c = makeTask('c');
      const d = makeTask('d', { predecessors: ['c'] });
      const e = makeTask('e', { predecessors: ['d'] });
      const allTasks = new Map([
        ['a', a],
        ['b', b],
        ['c', c],
        ['d', d],
        ['e', e],
      ]);
      const result = computeCriticalPathFloor([a, b, c, d, e], allTasks, new Set(), 50);
      expect(result.floor).toBe(3);
      expect(result.longestChainTaskId).toBe('e');
    });
    it('handles non-kappa predecessors in chain', () => {
      const prereq = makeTask('prereq', { kappaRequired: false });
      const kappaTask = makeTask('kt', { predecessors: ['prereq'] });
      const allTasks = new Map([
        ['prereq', prereq],
        ['kt', kappaTask],
      ]);
      const result = computeCriticalPathFloor([kappaTask], allTasks, new Set(), 50);
      expect(result.floor).toBe(2);
    });
    it('level gap applies to deepest task and adds to chain', () => {
      const a = makeTask('a');
      const b = makeTask('b', { predecessors: ['a'], minPlayerLevel: 45 });
      const allTasks = new Map([
        ['a', a],
        ['b', b],
      ]);
      const result = computeCriticalPathFloor([a, b], allTasks, new Set(), 10);
      expect(result.floor).toBe(37);
    });
    it('handles cycles in predecessor data without crashing', () => {
      const a = makeTask('a', { predecessors: ['b'] });
      const b = makeTask('b', { predecessors: ['a'] });
      const allTasks = new Map([
        ['a', a],
        ['b', b],
      ]);
      const result = computeCriticalPathFloor([a, b], allTasks, new Set(), 50);
      expect(result.floor).toBeGreaterThanOrEqual(1);
    });
  });
});
