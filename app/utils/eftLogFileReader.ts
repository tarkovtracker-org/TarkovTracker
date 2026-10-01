import { Unzip, UnzipInflate, UnzipPassThrough, type UnzipFile } from 'fflate';
import {
  createEftLogImportBudget,
  type EftLogImportBudget,
  type EftLogImportLimits,
} from '@/utils/eftLogImportBudget';
import {
  createEftLogFileParser,
  isEftImportLogFileName,
  type EftParsedLogFile,
} from '@/utils/eftLogQuestParser';
// ZIP input chunks are smaller because DEFLATE can expand one chunk by roughly 1,000 times.
const RAW_CHUNK_BYTES = 256 * 1024;
const ZIP_INFLATE_BYTES = 1024;
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
  /** Internal overrides for bounded regression fixtures; the UI uses automatic defaults. */
  limits?: Partial<EftLogImportLimits>;
  onProgress: (progress: EftLogReadProgress) => void;
}
/** Reads bounded slices with backpressure instead of loading a complete file into memory. */
async function readChunks(
  file: File,
  chunkSize: number,
  consume: (chunk: Uint8Array, final: boolean) => void | Promise<void>,
  onChunk: (bytes: number) => void,
  signal: AbortSignal
): Promise<void> {
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    signal.throwIfAborted();
    const end = Math.min(offset + chunkSize, file.size);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    signal.throwIfAborted();
    await consume(chunk, end === file.size);
    onChunk(chunk.byteLength);
  }
}
/** Batches small inflation outputs so the record reader cannot rescan a large pending record per KiB. */
function createLogDecoder(name: string, budget: EftLogImportBudget, signal: AbortSignal) {
  const decoder = new TextDecoder();
  const parser = createEftLogFileParser(name, budget);
  let pending: Uint8Array<ArrayBuffer> | null = null;
  let buffered = 0;
  const flush = (final: boolean): void => {
    signal.throwIfAborted();
    parser.push(decoder.decode(pending?.subarray(0, buffered), { stream: !final }));
    buffered = 0;
    if (final) pending = null;
  };
  const append = (chunk: Uint8Array): void => {
    pending ??= new Uint8Array(RAW_CHUNK_BYTES);
    for (let offset = 0; offset < chunk.byteLength;) {
      const length = Math.min(RAW_CHUNK_BYTES - buffered, chunk.byteLength - offset);
      pending.set(chunk.subarray(offset, offset + length), buffered);
      buffered += length;
      offset += length;
      if (buffered === RAW_CHUNK_BYTES) flush(false);
    }
  };
  return {
    push(chunk: Uint8Array, final: boolean): void {
      signal.throwIfAborted();
      budget.charge('expandedBytes', chunk.byteLength);
      if (chunk.byteLength) append(chunk);
      if (final) flush(true);
    },
    finish(): EftParsedLogFile {
      signal.throwIfAborted();
      return parser.finish();
    },
  };
}
/** Consumes ignored ZIP entries without inflation or fflate's deferred-entry buffering. */
function discardZipEntry(unzip: Unzip, entry: UnzipFile): void {
  class DiscardEntry extends UnzipPassThrough {
    static override readonly compression = entry.compression;
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
function startZipLog(
  entry: UnzipFile,
  finish: (file: EftParsedLogFile) => void,
  budget: EftLogImportBudget,
  signal: AbortSignal,
  onExpanded: (bytes: number) => void
): void {
  const decoder = createLogDecoder(entry.name, budget, signal);
  let bytesRead = 0;
  entry.ondata = (error, chunk, final) => {
    if (error) throw error;
    bytesRead += chunk.byteLength;
    decoder.push(chunk, final);
    onExpanded(chunk.byteLength);
    if (!final) return;
    checkZipEntrySize(entry, bytesRead);
    finish(decoder.finish());
  };
  entry.start();
}
/** Verifies the end record in the bounded ZIP comment window, including ZIP64 archives. */
async function checkZipEnd(file: File, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const tail = await file.slice(Math.max(0, file.size - 65557)).arrayBuffer();
  signal.throwIfAborted();
  const view = new DataView(tail);
  for (let offset = view.byteLength - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    if (offset + 22 + view.getUint16(offset + 20, true) === view.byteLength) return;
  }
  throw new EftLogArchiveError();
}
/** Streams archive members immediately so neither compressed nor expanded whole files accumulate. */
async function readZip(
  file: File,
  onChunk: (bytes: number) => void,
  signal: AbortSignal,
  budget: EftLogImportBudget
): Promise<{ files: EftParsedLogFile[]; scanned: number }> {
  await checkZipEnd(file, signal);
  const files: EftParsedLogFile[] = [];
  let scanned = 0;
  const active = new Set<UnzipFile>();
  let expandedSinceYield = 0;
  const unzip = new Unzip((entry) => {
    signal.throwIfAborted();
    budget.entry(entry.name);
    scanned++;
    if (!isEftImportLogFileName(entry.name)) {
      discardZipEntry(unzip, entry);
      return;
    }
    // discardZipEntry overwrites this method's entry in the shared decoder registry, and fflate
    // resolves the decoder from that registry inside entry.start(), so restore both first.
    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);
    active.add(entry);
    startZipLog(
      entry,
      (source) => {
        active.delete(entry);
        files.push(source);
      },
      budget,
      signal,
      (bytes) => {
        expandedSinceYield += bytes;
      }
    );
  });
  const inflate = async (chunk: Uint8Array, final: boolean): Promise<void> => {
    for (let offset = 0; offset < chunk.byteLength; offset += ZIP_INFLATE_BYTES) {
      signal.throwIfAborted();
      const end = Math.min(offset + ZIP_INFLATE_BYTES, chunk.byteLength);
      unzip.push(chunk.subarray(offset, end), final && end === chunk.byteLength);
      if (expandedSinceYield < RAW_CHUNK_BYTES) continue;
      expandedSinceYield = 0;
      // Let UI cancellation run after bounded expanded work, even for very compressible input.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  };
  try {
    await readChunks(file, RAW_CHUNK_BYTES, inflate, onChunk, signal);
  } finally {
    for (const entry of active) entry.terminate();
    active.clear();
  }
  return { files, scanned };
}
/** Reads a raw log through the same incremental UTF-8/record parser as archive entries. */
async function readRaw(
  file: File,
  onChunk: (bytes: number) => void,
  signal: AbortSignal,
  budget: EftLogImportBudget
): Promise<EftParsedLogFile> {
  const decoder = createLogDecoder(file.webkitRelativePath || file.name, budget, signal);
  await readChunks(file, RAW_CHUNK_BYTES, decoder.push, onChunk, signal);
  return decoder.finish();
}
/** Identifies supported sources before reading their contents. */
function isSupportedSource(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.zip') ||
    isEftImportLogFileName(file.webkitRelativePath || file.name)
  );
}
/** Processes sources sequentially, retaining parsed evidence instead of complete log text. */
export async function readEftLogSources(files: File[], options: ReadOptions) {
  options.signal.throwIfAborted();
  const budget = createEftLogImportBudget(options.limits);
  for (const file of files) budget.entry(file.webkitRelativePath || file.name);
  const selected = files.filter(isSupportedSource);
  for (const file of selected) budget.charge('inputBytes', file.size);
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
      const archive = await readZip(file, onChunk, options.signal, budget);
      scanned += archive.scanned;
      for (const source of archive.files) sources.push(source);
    } else {
      sources.push(await readRaw(file, onChunk, options.signal, budget));
      scanned++;
    }
  }
  options.signal.throwIfAborted();
  return { sources, scanned };
}
