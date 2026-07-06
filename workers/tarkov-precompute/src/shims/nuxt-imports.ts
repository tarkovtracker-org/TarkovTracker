/**
 * Shim for Nuxt's `#imports` virtual module so app/server/utils code can be
 * bundled into this standalone Worker. The shared modules (tarkov-json,
 * logger) only read optional keys from useRuntimeConfig and already handle
 * absent values, so an empty config is safe: they fall back to their built-in
 * defaults (json.tarkov.dev base URL, env-based log sink).
 */
export function useRuntimeConfig(): Record<string, unknown> {
  return {};
}
