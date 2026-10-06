import { describe, expect, it } from 'vitest';
import { buildTaskFailureAlternatives } from '../taskFailureEdges';
const task = (id: string, failConditions: unknown = [], status?: string[]) => ({
  id,
  failConditions,
  taskRequirements: status ? [{ task: 'A', status }] : [],
});
describe('completion-triggered failure edges', () => {
  it.each(['complete', 'completed', 'COMPLETE', 'Completed'])(
    'normalizes %s and raw/hydrated references without inventing reverse edges',
    (status) => {
      const raw = [task('A'), task('B', [{ task: 'A', status: [status] }])];
      const hydrated = [task('A'), task('B', { failure: { task: { id: 'A' }, status: [status] } })];
      expect(buildTaskFailureAlternatives(raw)).toEqual({ A: ['B'] });
      expect(buildTaskFailureAlternatives(hydrated)).toEqual({ A: ['B'] });
    }
  );
  it.each(['active', 'accept', 'ACCEPTED'])(
    'preserves the existing reciprocal %s-only requirement pattern',
    (status) => {
      expect(
        buildTaskFailureAlternatives([
          task('A', [{ task: 'B', status: ['complete'] }]),
          task('B', [], [status]),
        ])
      ).toEqual({ A: ['B'], B: ['A'] });
    }
  );
  it('ignores missing references, self links, non-completion failures and duplicates', () => {
    const tasks = [
      task('A'),
      task('B', [
        { task: 'absent', status: ['complete'] },
        { task: 'B', status: ['complete'] },
        { task: 'A', status: ['failed'] },
        { task: 'A', status: ['complete'] },
        { task: { id: 'A' }, status: ['completed'] },
      ]),
    ];
    expect(buildTaskFailureAlternatives(tasks)).toEqual({ A: ['B'] });
  });
  it('does not infer branches from failed-only or completion-accepting requirements', () => {
    for (const status of [['failed'], ['active', 'failed'], ['active', 'completed']]) {
      expect(
        buildTaskFailureAlternatives([
          task('A', [{ task: 'B', status: ['complete'] }]),
          task('B', [], status),
        ])
      ).toEqual({ B: ['A'] });
    }
  });
});
