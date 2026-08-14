import { setResponseHeaders } from 'h3';
import type { OverlayMeta } from '@/server/utils/overlay';
import type { H3Event } from 'h3';
type OverlayHeadersMeta = Pick<OverlayMeta, 'generated' | 'sha256' | 'status' | 'version'>;
const OVERLAY_HEADERS = [
  ['status', 'X-Overlay-Status'],
  ['version', 'X-Overlay-Version'],
  ['generated', 'X-Overlay-Generated'],
  ['sha256', 'X-Overlay-Sha256'],
] as const;
function getOverlayMeta(payload: unknown): OverlayHeadersMeta | null {
  const meta = (payload as { dataOverlay?: unknown } | null)?.dataOverlay;
  return typeof meta === 'object' && meta !== null ? (meta as OverlayHeadersMeta) : null;
}
export function setOverlayResponseHeaders(
  event: H3Event,
  payload: unknown,
  setHeaders: typeof setResponseHeaders = setResponseHeaders
): void {
  const meta = getOverlayMeta(payload);
  if (!meta) return;
  const headers: Record<string, string> = {};
  for (const [field, header] of OVERLAY_HEADERS) {
    const value = meta[field];
    if (value) headers[header] = value;
  }
  setHeaders(event, headers);
}
