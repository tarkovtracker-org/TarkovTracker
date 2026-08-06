import { createError } from 'h3';
export const isAbortError = (error: unknown): boolean => {
  return (Object(error) as { name?: unknown }).name === 'AbortError';
};
const isNoBodyStatus = (status: number): boolean =>
  status === 204 || status === 205 || status === 304;
const readResponseBody = async (response: Response): Promise<ArrayBuffer | null> =>
  isNoBodyStatus(response.status) ? null : response.arrayBuffer();
const normalizeFetchError = (
  error: unknown,
  timeoutController: AbortController,
  timeoutMessage: string
): unknown =>
  timeoutController.signal.aborted && isAbortError(error)
    ? createError({ statusCode: 504, statusMessage: timeoutMessage })
    : error;
export const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
): Promise<Response> => {
  const timeoutController = new AbortController();
  const signal = AbortSignal.any([
    timeoutController.signal,
    init.signal ?? timeoutController.signal,
  ]);
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal });
    // Buffer the body while the abort signal is still armed so the timeout covers the full body
    // download, not just the response headers; the returned Response is detached from the signal.
    // The arrayBuffer guard lets non-standard/mocked responses pass through untouched in tests.
    if (typeof response.arrayBuffer !== 'function') return response;
    const body = await readResponseBody(response);
    return new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    throw normalizeFetchError(error, timeoutController, timeoutMessage);
  } finally {
    clearTimeout(timeout);
  }
};
