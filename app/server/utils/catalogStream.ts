import { catalogByteLimit } from '@/utils/catalogDatasets';
export const CATALOG_BYTES_HEADER = 'X-Catalog-Bytes';
export function limitCompressedCatalog(
  source: ReadableStream<Uint8Array>,
  limit = 25 * 1024 * 1024
) {
  let bytes = 0;
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > limit) throw new Error('Compressed catalog byte limit exceeded');
        controller.enqueue(chunk);
      },
    })
  );
}
export function gateCatalogCacheBody(
  source: ReadableStream<Uint8Array>,
  completion: Promise<void>
) {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) await completion;
          forwardChunk(chunk, controller);
        } catch (error) {
          controller.error(error);
          void reader.cancel(error).catch(() => undefined);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 }
  );
}
export function validateCatalogBytes(value: unknown, scope: string): number {
  if (typeof value !== 'number') throw new Error('Invalid catalog byte length');
  if (![Number.isSafeInteger(value), value > 0, value <= catalogByteLimit(scope)].every(Boolean))
    throw new Error('Invalid catalog byte length');
  return value;
}
async function readBoundedChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { bytes: number },
  expected: number
) {
  const chunk = await reader.read();
  if (chunk.done) {
    if (state.bytes !== expected) throw new Error('Catalog byte length mismatch');
    return chunk;
  }
  state.bytes += chunk.value.byteLength;
  if (state.bytes > expected) throw new Error('Catalog byte length exceeded');
  return chunk;
}
function forwardChunk(
  chunk: ReadableStreamReadResult<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  if (chunk.done) controller.close();
  else controller.enqueue(chunk.value);
}
/** Prime one bounded decompressed chunk before committing successful response headers. */
export async function openCatalogBody(value: Response, scope: string) {
  const expected = validateCatalogBytes(Number(value.headers.get(CATALOG_BYTES_HEADER)), scope);
  if (!value.body) throw new Error('Missing catalog body');
  const reader = value.body.pipeThrough(new DecompressionStream('gzip')).getReader();
  const state = { bytes: 0 };
  let first: ReadableStreamReadResult<Uint8Array>;
  try {
    first = await readBoundedChunk(reader, state, expected);
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  }
  let complete!: () => void;
  let fail!: (error: unknown) => void;
  const completion = new Promise<void>((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  // A response without an edge writer must still consume validation failures safely.
  void completion.catch(() => undefined);
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        forwardChunk(first, controller);
      },
      async pull(controller) {
        try {
          const chunk = await readBoundedChunk(reader, state, expected);
          if (chunk.done) complete();
          forwardChunk(chunk, controller);
        } catch (error) {
          fail(error);
          controller.error(error);
          void reader.cancel(error).catch(() => undefined);
        }
      },
      cancel(reason) {
        fail(new Error('Catalog response cancelled', { cause: reason }));
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 }
  );
  return { body, completion };
}
