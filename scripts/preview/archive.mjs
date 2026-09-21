import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
// Minimal ZIP reader for GitHub Actions artifact archives. The credential-bearing deployment job
// must not hand an untrusted archive to a general-purpose extractor that may restore symbolic links
// or follow traversal paths, so entries are validated from the central directory first and only
// regular files and directories are ever written.
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const MAX_UINT32 = 0xffffffff;
const ARCHIVE_LIMITS = { entries: 50_000, totalBytes: 1024 * 1024 * 1024 };
function fail(message) {
  throw new Error(`Invalid preview artifact archive: ${message}`);
}
/** Assert an archive invariant; the message explains the rejection. */
function require(condition, message) {
  if (!condition) fail(message);
}
function readU64(buffer, offset) {
  const value = buffer.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail('64-bit field exceeds supported size');
  return Number(value);
}
function findEndOfCentralDirectory(buffer) {
  const floor = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= floor; offset -= 1) {
    if (buffer.readUInt32LE(offset) === SIG_EOCD) return offset;
  }
  return fail('missing end of central directory');
}
function readZip64Directory(buffer, eocdOffset) {
  const locator = eocdOffset - 20;
  require(locator >= 0 &&
    buffer.readUInt32LE(locator) === SIG_EOCD64_LOCATOR, 'missing ZIP64 locator');
  const eocd64 = readU64(buffer, locator + 8);
  require(eocd64 + 56 <= buffer.length &&
    buffer.readUInt32LE(eocd64) === SIG_EOCD64, 'missing ZIP64 end of central directory');
  return { count: readU64(buffer, eocd64 + 32), offset: readU64(buffer, eocd64 + 48) };
}
function isZip64Marker(count, offset) {
  return count === 0xffff || offset === MAX_UINT32;
}
function readDirectoryLocation(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  require(buffer.readUInt16LE(eocd + 4) === 0 &&
    buffer.readUInt16LE(eocd + 6) === 0, 'multi-disk archives are not supported');
  const count = buffer.readUInt16LE(eocd + 10);
  const offset = buffer.readUInt32LE(eocd + 16);
  return isZip64Marker(count, offset) ? readZip64Directory(buffer, eocd) : { count, offset };
}
function readZip64Extra(extra, sizes) {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const length = extra.readUInt16LE(cursor + 2);
    const body = extra.subarray(cursor + 4, cursor + 4 + length);
    if (id === 0x0001) return applyZip64Sizes(body, sizes);
    cursor += 4 + length;
  }
  return sizes;
}
function applyZip64Sizes(body, sizes) {
  let cursor = 0;
  const next = () => {
    if (cursor + 8 > body.length) fail('truncated ZIP64 extra field');
    const value = readU64(body, cursor);
    cursor += 8;
    return value;
  };
  const resolved = { ...sizes };
  if (sizes.uncompressedSize === MAX_UINT32) resolved.uncompressedSize = next();
  if (sizes.compressedSize === MAX_UINT32) resolved.compressedSize = next();
  if (sizes.localHeaderOffset === MAX_UINT32) resolved.localHeaderOffset = next();
  return resolved;
}
function readCentralEntry(buffer, offset) {
  require(offset + 46 <= buffer.length &&
    buffer.readUInt32LE(offset) === SIG_CENTRAL, 'corrupt central directory');
  const nameLength = buffer.readUInt16LE(offset + 28);
  const extraLength = buffer.readUInt16LE(offset + 30);
  const commentLength = buffer.readUInt16LE(offset + 32);
  const nameStart = offset + 46;
  const extra = buffer.subarray(nameStart + nameLength, nameStart + nameLength + extraLength);
  const sizes = readZip64Extra(extra, {
    compressedSize: buffer.readUInt32LE(offset + 20),
    uncompressedSize: buffer.readUInt32LE(offset + 24),
    localHeaderOffset: buffer.readUInt32LE(offset + 42),
  });
  return {
    entry: {
      name: buffer.toString('utf8', nameStart, nameStart + nameLength),
      hostSystem: buffer.readUInt16LE(offset + 4) >>> 8,
      flags: buffer.readUInt16LE(offset + 8),
      method: buffer.readUInt16LE(offset + 10),
      crc: buffer.readUInt32LE(offset + 16),
      externalAttributes: buffer.readUInt32LE(offset + 38),
      ...sizes,
    },
    next: nameStart + nameLength + extraLength + commentLength,
  };
}
/** Read the central directory without touching entry data. */
export function listZipEntries(buffer) {
  const { count, offset } = readDirectoryLocation(buffer);
  if (count > ARCHIVE_LIMITS.entries) fail(`more than ${ARCHIVE_LIMITS.entries} entries`);
  const entries = [];
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    const { entry, next } = readCentralEntry(buffer, cursor);
    entries.push(entry);
    cursor = next;
  }
  return entries;
}
const UNIX_HOST = 3;
const MODE_TYPE_MASK = 0o170000;
const MODE_DIRECTORY = 0o040000;
const MODE_REGULAR = 0o100000;
const MODE_SYMLINK = 0o120000;
const ALLOWED_UNIX_TYPES = new Set([0, MODE_REGULAR, MODE_DIRECTORY]);
function isDirectoryEntry(entry) {
  if (entry.name.endsWith('/')) return true;
  if (entry.hostSystem !== UNIX_HOST) return false;
  return ((entry.externalAttributes >>> 16) & MODE_TYPE_MASK) === MODE_DIRECTORY;
}
function unixTypeError(entry) {
  if (entry.hostSystem !== UNIX_HOST) return null;
  const type = (entry.externalAttributes >>> 16) & MODE_TYPE_MASK;
  if (ALLOWED_UNIX_TYPES.has(type)) return null;
  return type === MODE_SYMLINK ? 'symbolic link entry' : 'special file entry';
}
const INVALID_NAME_SEGMENTS = new Set(['', '.', '..']);
function isMalformedName(name) {
  return !name || name.includes('\0') || name.includes('\\');
}
function nameError(name) {
  if (isMalformedName(name)) return 'malformed entry name';
  if (name.startsWith('/')) return 'absolute entry path';
  const segments = name.replace(/\/$/, '').split('/');
  return segments.some((segment) => INVALID_NAME_SEGMENTS.has(segment))
    ? 'path traversal entry'
    : null;
}
const SUPPORTED_METHODS = new Set([0, 8]);
function entryError(entry) {
  if (entry.flags & 0x0001) return 'encrypted entry';
  if (!SUPPORTED_METHODS.has(entry.method)) return 'unsupported compression method';
  return unixTypeError(entry) ?? nameError(entry.name);
}
function entryViolations(entry, seen) {
  const error = entryError(entry);
  const errors = error ? [`${error}: ${JSON.stringify(entry.name)}`] : [];
  if (seen.has(entry.name)) errors.push(`duplicate entry: ${JSON.stringify(entry.name)}`);
  return errors;
}
/** Every rejection reason for an archive; the caller refuses extraction when any exist. */
export function zipEntryErrors(entries) {
  const errors = [];
  const seen = new Set();
  let total = 0;
  for (const entry of entries) {
    errors.push(...entryViolations(entry, seen));
    seen.add(entry.name);
    total += entry.uncompressedSize;
  }
  if (total > ARCHIVE_LIMITS.totalBytes) errors.push('archive exceeds the size limit');
  return errors;
}
function readEntryData(buffer, entry) {
  const header = entry.localHeaderOffset;
  require(header + 30 <= buffer.length &&
    buffer.readUInt32LE(header) === SIG_LOCAL, `corrupt local header for ${entry.name}`);
  const start = header + 30 + buffer.readUInt16LE(header + 26) + buffer.readUInt16LE(header + 28);
  require(start + entry.compressedSize <= buffer.length, `truncated data for ${entry.name}`);
  const raw = buffer.subarray(start, start + entry.compressedSize);
  const data = entry.method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
  require(data.length === entry.uncompressedSize &&
    crc32(data) === entry.crc, `checksum mismatch for ${entry.name}`);
  return data;
}
/** Validate, then write regular files and directories only, into an empty destination. */
export function extractZip(buffer, destination) {
  const entries = listZipEntries(buffer);
  const errors = zipEntryErrors(entries);
  if (errors.length) fail(errors.join('; '));
  for (const entry of entries) {
    const target = join(destination, entry.name);
    if (isDirectoryEntry(entry)) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readEntryData(buffer, entry), { flag: 'wx' });
  }
  return entries.length;
}
