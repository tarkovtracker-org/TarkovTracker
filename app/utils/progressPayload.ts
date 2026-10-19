const hasErrorMessage = (error: unknown, message: string): error is { message: string } =>
  error !== null && typeof error === 'object' && 'message' in error && error.message === message;
/** Keep the historical message recognizable across old/new database deployments. */
export const isProgressPayloadTooLarge = (error: unknown): error is { message: string } =>
  hasErrorMessage(error, 'p_modes exceeds the maximum payload size');
export const PROGRESS_SYNC_INTERRUPTED = { message: 'Progress sync superseded by newer state' };
export const isProgressSyncInterrupted = (error: unknown): boolean =>
  hasErrorMessage(error, PROGRESS_SYNC_INTERRUPTED.message);
