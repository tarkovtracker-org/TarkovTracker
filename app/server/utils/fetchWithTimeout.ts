import { createError } from 'h3';
export const isAbortError = (error: unknown): boolean => {
  return (Object(error) as { name?: unknown }).name === 'AbortError';
};
export const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw createError({ statusCode: 504, statusMessage: timeoutMessage });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
