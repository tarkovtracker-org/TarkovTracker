import { IncomingMessage } from 'node:http';
import { getRequestWebStream, type H3Event } from 'h3';
export function clientLogRequestStream(event: H3Event): ReadableStream<Uint8Array> | undefined {
  const request = event.node.req;
  if (request instanceof IncomingMessage && !event.web?.request) return nodeRequestStream(request);
  return getRequestWebStream(event);
}
function nodeRequestStream(request: IncomingMessage): ReadableStream<Uint8Array> {
  let cleanup = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (request.destroyed || request.aborted) {
        controller.error(new Error('Client log request already closed'));
        return;
      }
      if (request.readableEnded) {
        controller.close();
        return;
      }
      const onData = (chunk: Uint8Array) => {
        request.pause();
        controller.enqueue(chunk);
      };
      const onEnd = () => {
        cleanup();
        controller.close();
      };
      const onError = (error: Error) => {
        cleanup();
        controller.error(error);
      };
      const onClose = () => onError(new Error('Client log request closed before end'));
      cleanup = () => {
        request.off('data', onData);
        request.off('end', onEnd);
        request.off('error', onError);
        request.off('close', onClose);
      };
      request.on('data', onData).once('end', onEnd).once('error', onError).once('close', onClose);
      request.pause();
    },
    pull() {
      request.resume();
    },
    cancel() {
      cleanup();
      // Drain without retaining bytes so the quiet 204 can still reach the uploader.
      request.once('error', () => undefined);
      request.resume();
    },
  });
}
