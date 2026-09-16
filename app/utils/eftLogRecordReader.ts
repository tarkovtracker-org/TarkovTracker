// A file can contain any number of records; only an unfinished individual record is buffered.
const MAX_RECORD_CHARS = 8 * 1024 * 1024;
const RECORD_START = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}(?: [+-]\d{2}:\d{2})?\|/gm;
export class EftLogRecordSizeError extends Error {
  constructor(readonly path: string) {
    super('An individual EFT log record exceeds the parser buffer.');
    this.name = 'EftLogRecordSizeError';
  }
}
/** Bounds malformed or exceptionally large records, independently of file/selection sizes. */
function checkRecordLength(length: number, path: string): void {
  if (length > MAX_RECORD_CHARS) throw new EftLogRecordSizeError(path);
}
/** Finds the final record boundary while validating each completed record's length. */
function lastRecordStart(text: string, path: string): number {
  let start = 0;
  for (const match of text.matchAll(new RegExp(RECORD_START))) {
    checkRecordLength(match.index - start, path);
    start = match.index;
  }
  return start;
}
/** Keeps split headers/JSON intact and releases completed records after every input chunk. */
export function createEftLogRecordReader(consume: (text: string) => void, path: string) {
  let pending = '';
  return {
    push(text: string): void {
      const combined = pending + text;
      const end = lastRecordStart(combined, path);
      if (end > 0) consume(combined.slice(0, end));
      pending = combined.slice(end);
      checkRecordLength(pending.length, path);
    },
    finish(): void {
      if (pending) consume(pending);
      pending = '';
    },
  };
}
