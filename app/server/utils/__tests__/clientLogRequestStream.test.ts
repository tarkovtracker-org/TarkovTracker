// @vitest-environment node
import { createServer, request } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { createApp, defineEventHandler, setResponseStatus, toNodeListener } from 'h3';
import { describe, expect, it } from 'vitest';
import { readClientLogBytes } from '@/server/utils/clientLogBody';
import { clientLogRequestStream } from '@/server/utils/clientLogRequestStream';
describe('native Node client-log streaming', () => {
  it('drains later chunks and end after rejecting an oversized HTTP upload', async () => {
    let accepted: boolean | undefined;
    const app = createApp().use(
      defineEventHandler(async (event) => {
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
            response.once('end', () => resolve(response.statusCode));
          }
        );
        upload.on('error', reject);
        void (async () => {
          for (let index = 0; index < 6; index++) {
            upload.write(new Uint8Array(32 * 1024));
            await setTimeout(5);
          }
          upload.end();
        })().catch(reject);
      });
      expect(status).toBe(204);
      expect(accepted).toBe(false);
      await setTimeout(50);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
