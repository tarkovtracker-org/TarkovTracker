import { Unzip, UnzipInflate, UnzipPassThrough, type UnzipFile } from 'fflate';
import {
  createEftLogFileParser,
  isEftImportLogFileName,
  type EftParsedLogFile,
} from '@/utils/eftLogQuestParser';
// ZIP input chunks are smaller because DEFLATE can expand one chunk by roughly 1,000 times.
const RAW_CHUNK_BYTES = 256 * 1024;
const ZIP_CHUNK_BYTES = 16 * 1024;
export class EftLogArchiveError extends Error {
  constructor() {
    super('Invalid or incomplete EFT log archive.');
    this.name = 'EftLogArchiveError';
  }
}
export interface EftLogReadProgress {
  bytesRead: number;
  totalBytes: number;
}
interface ReadOptions {
  signal: AbortSignal;
  onProgress: (progress: EftLogReadProgress) => void;
}
/** Reads bounded slices with backpressure instead of loading a complete file into memory. */
async function readChunks(
  file: File,
  chunkSize: number,
  consume: (chunk: Uint8Array, final: boolean) => void,
  onChunk: (bytes: number) => void,
  signal: AbortSignal
): Promise<void> {
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    signal.throwIfAborted();
    const end = Math.min(offset + chunkSize, file.size);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    signal.throwIfAborted();
    consume(chunk, end === file.size);
    onChunk(chunk.byteLength);
  }
}
/** Decodes split UTF-8 sequences and releases text after each parser batch. */
function createLogDecoder(name: string) {
  const decoder = new TextDecoder();
  const parser = createEftLogFileParser(name);
  return {
    push(chunk: Uint8Array, final: boolean): void {
      parser.push(decoder.decode(chunk, { stream: !final }));
    },
    finish: parser.finish,
  };
}
/** Consumes ignored ZIP entries without inflation or fflate's deferred-entry buffering. */
function discardZipEntry(unzip: Unzip, entry: UnzipFile): void {
  class DiscardEntry extends UnzipPassThrough {
    static override compression = entry.compression;
  }
  unzip.register(DiscardEntry);
  entry.ondata = () => {};
  entry.start();
}
/** Rejects incorrect declared ZIP sizes without allocating based on those declarations. */
function checkZipEntrySize(entry: UnzipFile, bytesRead: number): void {
  if (entry.originalSize !== undefined && bytesRead !== entry.originalSize) {
    throw new EftLogArchiveError();
  }
}
/** Streams one supported archive entry into parsed evidence, checking its actual decoded size. */
function startZipLog(entry: UnzipFile, finish: (file: EftParsedLogFile) => void): void {
  const decoder = createLogDecoder(entry.name);
  let bytesRead = 0;
  entry.ondata = (error, chunk, final) => {
    if (error) throw error;
    bytesRead += chunk.byteLength;
    decoder.push(chunk, final);
    if (!final) return;
    checkZipEntrySize(entry, bytesRead);
    finish(decoder.finish());
  };
  entry.start();
}
/** Streams archive members immediately so neither compressed nor expanded whole files accumulate. */
async function readZip(
  file: File,
  onChunk: (bytes: number) => void,
  signal: AbortSignal
): Promise<{ files: EftParsedLogFile[]; scanned: number }> {
  const files: EftParsedLogFile[] = [];
  let scanned = 0;
  let pending = 0;
  const finish = (source: EftParsedLogFile) => {
    files.push(source);
    pending--;
  };
  const unzip = new Unzip((entry) => {
    scanned++;
    if (!isEftImportLogFileName(entry.name)) {
      discardZipEntry(unzip, entry);
      return;
    }
    // An ignored member may have temporarily registered a discard decoder for this method.
    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);
    pending++;
    startZipLog(entry, finish);
  });
  await readChunks(
    file,
    ZIP_CHUNK_BYTES,
    (chunk, final) => unzip.push(chunk, final),
    onChunk,
    signal
  );
  if (pending > 0) throw new EftLogArchiveError();
  return { files, scanned };
}
/** Reads a raw log through the same incremental UTF-8/record parser as archive entries. */
async function readRaw(
  file: File,
  onChunk: (bytes: number) => void,
  signal: AbortSignal
): Promise<EftParsedLogFile> {
  const decoder = createLogDecoder(file.webkitRelativePath || file.name);
  await readChunks(file, RAW_CHUNK_BYTES, decoder.push, onChunk, signal);
  return decoder.finish();
}
/** Identifies supported sources without imposing a file-count, file-size, or aggregate-byte cap. */
function isSupportedSource(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.zip') ||
    isEftImportLogFileName(file.webkitRelativePath || file.name)
  );
}
/** Processes sources sequentially, retaining parsed evidence instead of complete log text. */
export async function readEftLogSources(files: File[], options: ReadOptions) {
  const selected = files.filter(isSupportedSource);
  const totalBytes = selected.reduce((total, file) => total + file.size, 0);
  let bytesRead = 0;
  let scanned = files.length - selected.length;
  const sources: EftParsedLogFile[] = [];
  const onChunk = (bytes: number) => {
    bytesRead += bytes;
    options.onProgress({ bytesRead, totalBytes });
  };
  onChunk(0);
  for (const file of selected) {
    options.signal.throwIfAborted();
    if (file.name.toLowerCase().endsWith('.zip')) {
      const archive = await readZip(file, onChunk, options.signal);
      scanned += archive.scanned;
      for (const source of archive.files) sources.push(source);
    } else {
      sources.push(await readRaw(file, onChunk, options.signal));
      scanned++;
    }
  }
  return { sources, scanned };
}
