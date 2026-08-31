import { setResponseHeaders } from 'h3';
import type { OverlayMeta } from '@/server/utils/overlay';
import type { H3Event } from 'h3';
type OverlayHeadersMeta = Pick<OverlayMeta, 'generated' | 'sha256' | 'status' | 'version'>;
type OverlayHeaderField = keyof OverlayHeadersMeta;
const INVALID_HEADER_CODE_POINTS = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 127,
]);
const OVERLAY_HEADERS: ReadonlyArray<readonly [OverlayHeaderField, string]> = [
  ['status', 'X-Overlay-Status'],
  ['version', 'X-Overlay-Version'],
  ['generated', 'X-Overlay-Generated'],
  ['sha256', 'X-Overlay-Sha256'],
];
function getOverlayMeta(payload: unknown): OverlayHeadersMeta | null {
  const meta = (payload as { dataOverlay?: unknown } | null)?.dataOverlay;
  return typeof meta === 'object' && meta !== null ? (meta as OverlayHeadersMeta) : null;
}
function isSafeHeaderValue(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  return Array.from(value).every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 255 && !INVALID_HEADER_CODE_POINTS.has(codePoint);
  });
}
export function buildOverlayResponseHeaders(meta: unknown): Record<string, string> {
  const candidate = (meta ?? {}) as Record<OverlayHeaderField, unknown>;
  const headers: Record<string, string> = {};
  for (const [field, header] of OVERLAY_HEADERS) {
    const value = candidate[field];
    if (isSafeHeaderValue(value)) headers[header] = value;
  }
  return headers;
}
export function setOverlayResponseHeaders(
  event: H3Event,
  payload: unknown,
  setHeaders: typeof setResponseHeaders = setResponseHeaders
): void {
  const meta = getOverlayMeta(payload);
  if (!meta) return;
  setHeaders(event, buildOverlayResponseHeaders(meta));
}
