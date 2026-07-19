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
const TRANSIENT_STATUS_CODES = new Set([0, 408, 502, 503, 504]);
const TRANSIENT_ERROR_CODES = new Set([
  'ABORT_ERR',
  'ABORT_ERROR',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'NETWORK_ERROR',
  'TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_CONNECT',
  'UND_ERR_SOCKET',
]);
const TRANSIENT_ERROR_PATTERNS = [
  /connection refused/i,
  /failed to fetch/i,
  /fetch failed/i,
  /network(?:\s+request)?\s+failed/i,
  /networkerror/i,
  /\btime(?:d?\s*out|out)\b/i,
];
const getErrorCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') {
    return null;
  }
  if ('code' in error && typeof error.code === 'string') {
    return error.code.toUpperCase();
  }
  const cause = 'cause' in error ? error.cause : null;
  if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string') {
    return cause.code.toUpperCase();
  }
  return null;
};
const getErrorMessages = (error: unknown): string[] => {
  const messages = new Set<string>();
  const addMessage = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = value.trim();
    if (normalized) {
      messages.add(normalized);
    }
  };
  addMessage(error);
  if (error instanceof Error) {
    addMessage(error.message);
  }
  if (!error || typeof error !== 'object') {
    return [...messages];
  }
  if ('message' in error) {
    addMessage(error.message);
  }
  if ('data' in error) {
    const { data } = error as { data?: unknown };
    addMessage(data);
    if (data && typeof data === 'object' && 'message' in data) {
      addMessage(data.message);
    }
  }
  const cause = 'cause' in error ? error.cause : null;
  if (cause instanceof Error) {
    addMessage(cause.message);
  } else if (cause && typeof cause === 'object' && 'message' in cause) {
    addMessage(cause.message);
  }
  return [...messages];
};
export const isTransientNetworkError = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status !== null) {
    return TRANSIENT_STATUS_CODES.has(status);
  }
  const code = getErrorCode(error);
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }
  return getErrorMessages(error).some((message) =>
    TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message))
  );
};
