import { hasSafeClientLogDepth, readClientLogBytes } from '@/server/utils/clientLogBody';
/** Bound bytes before parsing, then inspect all containers without recursive traversal. */
export const readProgressDiagnosticBody = async (
  stream: ReadableStream<Uint8Array> | null | undefined
): Promise<unknown> => {
  if (!stream) throw new Error('Missing body');
  const bytes = await readClientLogBytes(stream);
  if (!bytes) throw new Error('Body too large');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!hasSafeClientLogDepth([value])) throw new Error('Body too deep');
  return value;
};
