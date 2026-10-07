export const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  if (
    'context' in error &&
    error.context &&
    typeof error.context === 'object' &&
    'status' in error.context &&
    typeof error.context.status === 'number'
  ) {
    return error.context.status;
  }
  return null;
};
