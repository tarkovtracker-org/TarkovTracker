import { scanError } from '@/utils/stashScan/types';
export function scanJsonObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw scanError('catalog_invalid');
  return value as Record<string, unknown>;
}
/** Catalog failures cross the worker boundary as stable translation keys. */
export function decodeScanJsonObject(bytes: Uint8Array): Record<string, unknown> {
  try {
    return scanJsonObject(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    throw scanError('catalog_invalid');
  }
}
