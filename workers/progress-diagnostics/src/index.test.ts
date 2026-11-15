// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MAX_CLIENT_LOG_BYTES } from '@/server/utils/clientLogBody';
import { diagnosticEvent } from '~~/scripts/checks/progress-diagnostic-fixture';
import worker from '~~/workers/progress-diagnostics/src/index';
const request = (value: unknown) =>
  new Request('https://progress-diagnostics.internal/', {
    method: 'POST',
    body: JSON.stringify(value),
  });
describe('private aggregate collector', () => {
  it('revalidates and reconstructs the only logged event', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const input = diagnosticEvent();
    Object.assign(input, { userId: 'private-id', href: 'private-url', args: ['private'] });
    Object.assign(input.modes.pvp.counts, { rawKey: 42 });
    const response = await worker.fetch(request(input));
    expect(response.status).toBe(204);
    expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(diagnosticEvent()));
  });
  it.each(['pvp', 'pve', 'seasonal'])('accepts each supported mode', async (mode) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const input = diagnosticEvent();
    const payload = { ...input, modes: { [mode]: input.modes.pvp }, batchModes: [mode] };
    expect((await worker.fetch(request(payload))).status).toBe(204);
    expect(log).toHaveBeenCalledWith(JSON.stringify(payload));
  });
  it.each(['accepted', 'failed', 'superseded', 'payload_too_large'])(
    'accepts the known outcome %s',
    async (outcome) => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      expect((await worker.fetch(request({ ...diagnosticEvent(), outcome }))).status).toBe(204);
    }
  );
  it('rejects an unknown mode even when its numeric summary is valid', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const input = diagnosticEvent();
    const payload = {
      ...input,
      modes: { privateMode: input.modes.pvp },
      batchModes: ['privateMode'],
    };
    expect((await worker.fetch(request(payload))).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });
  it.each([-1, 0.5, '123', null, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid fixed counts %s',
    async (count) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const input = diagnosticEvent();
      Object.assign(input.modes.pvp.counts, { taskObjectives: count });
      expect((await worker.fetch(request(input))).status).toBe(400);
      expect(log).not.toHaveBeenCalled();
    }
  );
  it('accepts the empty commit produced by local builds', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect((await worker.fetch(request({ ...diagnosticEvent(), buildCommit: '' }))).status).toBe(
      204
    );
    expect(log).toHaveBeenCalledWith(JSON.stringify({ ...diagnosticEvent(), buildCommit: '' }));
  });
  it.each([
    { buildCommit: 'private-id' },
    { buildCommit: 123 },
    { outcome: 'private-error' },
    { aggregateWireBytes: -1 },
    { requestWireBytes: 1.5 },
    { requestWireBytes: Number.MAX_SAFE_INTEGER + 1 },
    { modes: { privateUser: {} } },
    { modes: {} },
    { modes: null },
    { batchModes: ['private-mode'] },
    { batchModes: ['pvp', 'pvp'] },
    { batchModes: ['pve'] },
    { batchModes: [] },
    { modes: { pvp: { wireBytes: 1, counts: {} } } },
  ])('rejects invalid aggregate contracts %j', async (patch) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect((await worker.fetch(request({ ...diagnosticEvent(), ...patch }))).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });
  it('cancels the oversized stream before reading later chunks', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cancel = vi.fn();
    let reads = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          if (reads === 1)
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify(diagnosticEvent()).slice(0, -1) + ',"ignored":"'
              )
            );
          else if (reads === 2)
            controller.enqueue(new TextEncoder().encode('x'.repeat(MAX_CLIENT_LOG_BYTES)));
          else {
            controller.enqueue(new TextEncoder().encode('"}'));
            controller.close();
          }
        },
        cancel,
      },
      { highWaterMark: 0 }
    );
    const incoming = new Request('https://progress-diagnostics.internal/', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect((await worker.fetch(incoming)).status).toBe(400);
    expect(reads).toBe(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });
  it.each([
    '{bad',
    JSON.stringify(diagnosticEvent()).slice(0, -1) +
      ',"ignored":' +
      '['.repeat(10_000) +
      '0' +
      ']'.repeat(10_000) +
      '}',
  ])('rejects malformed or deep input quietly', async (raw) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await worker.fetch(
      new Request('https://progress-diagnostics.internal/', {
        method: 'POST',
        body: raw,
      })
    );
    expect(response.status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });
  it('is private and persists custom logs without invocation logs or traces', () => {
    const config = JSON.parse(
      readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(
        /,\s*([}\]])/g,
        '$1'
      )
    );
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.routes).toEqual([]);
    expect(config.observability.logs).toEqual({
      enabled: true,
      persist: true,
      head_sampling_rate: 1,
      invocation_logs: false,
    });
    expect(config.observability.traces).toEqual({ enabled: false, persist: false });
  });
});
