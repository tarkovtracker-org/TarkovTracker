import type { Task } from '@/types/tarkov';
/** A localized message key plus its interpolation values. */
export type DurationMessage = { key: string; params: Record<string, number> };
export type TaskTimeGate = { min: number; max: number };
type TimeGateFields = Pick<Task, 'availableDelaySecondsMax' | 'availableDelaySecondsMin'>;
const isPositiveSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
/**
 * The stated in-game delay between a task's prerequisites completing and the task being offered.
 * A one-sided value is treated as a fixed delay; returns null when the task has no delay.
 */
export function resolveTaskTimeGate(task: TimeGateFields): TaskTimeGate | null {
  const values = [task.availableDelaySecondsMin, task.availableDelaySecondsMax].filter(
    isPositiveSeconds
  );
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}
function formatMinutes(totalMinutes: number): DurationMessage {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return { key: 'page.tasks.questcard.duration_minutes', params: { minutes } };
  if (minutes === 0) return { key: 'page.tasks.questcard.duration_hours', params: { hours } };
  return { key: 'page.tasks.questcard.duration_hours_minutes', params: { hours, minutes } };
}
/** Compact h/m wording for a positive duration; sub-minute delays keep their seconds. */
export function formatDelayDuration(seconds: number): DurationMessage {
  if (seconds < 60) {
    return {
      key: 'page.tasks.questcard.duration_seconds',
      params: { seconds: Math.ceil(seconds) },
    };
  }
  return formatMinutes(Math.round(seconds / 60));
}
