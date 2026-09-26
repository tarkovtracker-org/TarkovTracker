import { crc32, deflateRawSync } from 'node:zlib';
// Minimal ZIP writer for archive fixtures. Entries may carry Unix mode bits so tests can build
// archives with symbolic links or other special files that a real extractor would restore.
const UNIX_HOST = 3 << 8;
function headerField(size, value) {
  const buffer = Buffer.alloc(size);
  if (size === 2) buffer.writeUInt16LE(value, 0);
  else buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}
function header(signature, fields) {
  const buffers = [Buffer.alloc(4)];
  buffers[0].writeUInt32LE(signature, 0);
  for (const [size, value] of fields) buffers.push(headerField(size, value));
  return Buffer.concat(buffers);
}
function entryData(entry) {
  if (Buffer.isBuffer(entry.data)) return entry.data;
  return Buffer.from(entry.data ?? '', 'utf8');
}
function entryMethod(entry) {
  return entry.method ?? 0;
}
function encodeStored(method, data) {
  return method === 8 ? deflateRawSync(data) : data;
}
function entryMode(entry) {
  if (entry.mode !== undefined) return entry.mode;
  return entry.name.endsWith('/') ? 0o040755 : 0o100644;
}
function encodeEntry(entry) {
  const name = Buffer.from(entry.name, 'utf8');
  const data = entryData(entry);
  const method = entryMethod(entry);
  return {
    name,
    data,
    stored: encodeStored(method, data),
    method,
    crc: entry.crc ?? crc32(data),
    mode: entryMode(entry),
    flags: entry.flags ?? 0,
  };
}
/** Build a complete archive from `{ name, data, method, mode, flags, crc }` descriptors. */
export function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const raw of entries) {
    const entry = encodeEntry(raw);
    const local = Buffer.concat([
      header(0x04034b50, [
        [2, 20],
        [2, entry.flags],
        [2, entry.method],
        [2, 0],
        [2, 0],
        [4, entry.crc],
        [4, entry.stored.length],
        [4, entry.data.length],
        [2, entry.name.length],
        [2, 0],
      ]),
      entry.name,
      entry.stored,
    ]);
    centrals.push(
      Buffer.concat([
        header(0x02014b50, [
          [2, UNIX_HOST | 20],
          [2, 20],
          [2, entry.flags],
          [2, entry.method],
          [2, 0],
          [2, 0],
          [4, entry.crc],
          [4, entry.stored.length],
          [4, entry.data.length],
          [2, entry.name.length],
          [2, 0],
          [2, 0],
          [2, 0],
          [2, 0],
          [4, entry.mode << 16],
          [4, offset],
        ]),
        entry.name,
      ])
    );
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = header(0x06054b50, [
    [2, 0],
    [2, 0],
    [2, entries.length],
    [2, entries.length],
    [4, directory.length],
    [4, offset],
    [2, 0],
  ]);
  return Buffer.concat([...locals, directory, end]);
}
