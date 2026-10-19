/** Keep the historical message recognizable across old/new database deployments. */
export const isProgressPayloadTooLarge = (error: unknown): error is { message: string } =>
  error !== null &&
  typeof error === 'object' &&
  'message' in error &&
  error.message === 'p_modes exceeds the maximum payload size';
