import { describe, expect, it, vi } from 'vitest';
import {
  buildOverlayResponseHeaders,
  setOverlayResponseHeaders,
} from '@/server/utils/overlayResponseHeaders';
import type { H3Event, setResponseHeaders } from 'h3';
describe('setOverlayResponseHeaders', () => {
  const event = {} as H3Event;
  it('sets available overlay metadata headers', () => {
    const setHeaders = vi.fn() as unknown as typeof setResponseHeaders;
    setOverlayResponseHeaders(
      event,
      {
        dataOverlay: {
          generated: '2026-08-14T12:00:00.000Z',
          sha256: 'overlay-sha',
          status: 'cached',
          version: 'locale-test-v1',
        },
      },
      setHeaders
    );
    expect(setHeaders).toHaveBeenCalledWith(event, {
      'X-Overlay-Generated': '2026-08-14T12:00:00.000Z',
      'X-Overlay-Sha256': 'overlay-sha',
      'X-Overlay-Status': 'cached',
      'X-Overlay-Version': 'locale-test-v1',
    });
  });
  it('omits metadata that is not safe for an HTTP header', () => {
    expect(
      buildOverlayResponseHeaders({
        generated: 'unsafe-😀',
        sha256: 'safe-sha',
        status: 42,
        version: 'unsafe\nvalue',
      })
    ).toEqual({ 'X-Overlay-Sha256': 'safe-sha' });
    expect(buildOverlayResponseHeaders({ version: '' })).toEqual({});
  });
  it.each([null, {}, { dataOverlay: null }])(
    'ignores payloads without overlay metadata',
    (payload) => {
      const setHeaders = vi.fn() as unknown as typeof setResponseHeaders;
      setOverlayResponseHeaders(event, payload, setHeaders);
      expect(setHeaders).not.toHaveBeenCalled();
    }
  );
});
