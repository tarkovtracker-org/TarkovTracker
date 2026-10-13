// @vitest-environment node
import { once } from 'node:events';
import { createServer, IncomingMessage, request, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { createApp, defineEventHandler, setResponseStatus, toNodeListener, createEvent } from 'h3';
import { describe, expect, it } from 'vitest';
import { readClientLogBytes } from '@/server/utils/clientLogBody';
import { clientLogRequestStream } from '@/server/utils/clientLogRequestStream';
describe('native Node client-log streaming', () => {
  it('rejects a request destroyed before stream construction', async () => {
    const incoming = new IncomingMessage(new Socket());
    incoming.destroy();
    await once(incoming, 'close');
    const stream = clientLogRequestStream(createEvent(incoming, new ServerResponse(incoming)))!;
    await expect(stream.getReader().read()).rejects.toThrow('already closed');
  }, 1000);
  it('rejects premature close while reading', async () => {
    const incoming = new IncomingMessage(new Socket());
    const reader = clientLogRequestStream(
      createEvent(incoming, new ServerResponse(incoming))
    )!.getReader();
    const reading = reader.read();
    incoming.destroy();
    await expect(reading).rejects.toThrow('closed before end');
  }, 1000);
  it('drains later chunks and end after rejecting an oversized HTTP upload', async () => {
    let accepted: boolean | undefined;
    let receivedBytes = 0;
    let resolveEnded!: () => void;
    const ended = new Promise<void>((resolve) => {
      resolveEnded = resolve;
    });
    const app = createApp().use(
      defineEventHandler(async (event) => {
        event.node.req.on('data', (chunk: Uint8Array) => {
          receivedBytes += chunk.byteLength;
        });
        event.node.req.once('end', resolveEnded);
        accepted = (await readClientLogBytes(clientLogRequestStream(event)!)) !== null;
        setResponseStatus(event, 204);
        return null;
      })
    );
    const server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    try {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const upload = request(
          { host: '127.0.0.1', port: address.port, method: 'POST' },
          (response) => {
            response.resume();
            response.once('end', () => {
              void Promise.all([finished, ended]).then(() => resolve(response.statusCode), reject);
            });
          }
        );
        upload.on('error', reject);
        const finished = once(upload, 'finish');
        void (async () => {
          for (let index = 0; index < 6; index++) {
            upload.write(new Uint8Array(32 * 1024));
            await setTimeout(5);
          }
          upload.end();
          await finished;
          await ended;
        })().catch(reject);
      });
      expect(status).toBe(204);
      expect(accepted).toBe(false);
      await ended;
      expect(receivedBytes).toBe(6 * 32 * 1024);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 2000);
});
