/**
 * Async Utilities
 *
 * Common async helper functions.
 */
/**
 * Maximum safe timeout value for setTimeout (2^31 - 1 ms, ~24.8 days).
 */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/**
 * Simple delay utility for async operations with optional cancellation.
 *
 * @param ms - Milliseconds to wait
 * @param signal - Optional AbortSignal to cancel the delay
 * @returns Promise that resolves after the delay or rejects if aborted
 *
 * @example
 * ```ts
 * await delay(1000); // Wait 1 second
 *
 * // With cancellation
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 500);
 * await delay(1000, controller.signal); // Rejects after 500ms
 * ```
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_TIMEOUT_MS) {
    throw new RangeError(`delay must be a finite, non-negative number <= ${MAX_TIMEOUT_MS}`);
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    // Use { once: true } to ensure the onAbort listener automatically removes itself after firing,
    // making the code more robust by avoiding manual listener cleanup on the abort path
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
