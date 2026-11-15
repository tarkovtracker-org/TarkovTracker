import { SCAN_LIMITS, scanError } from '@/utils/stashScan/types';
const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));
export function checkDimensions(width: number, height: number): void {
  const validAxis = (value: number) =>
    Number.isSafeInteger(value) && value > 0 && value <= SCAN_LIMITS.axis;
  if (!validAxis(width) || !validAxis(height) || width * height > SCAN_LIMITS.pixels) {
    throw scanError('image_size');
  }
}
function pngSize(bytes: Uint8Array, view: DataView): [number, number] | null {
  if (ascii(bytes, 0, 8) !== '\x89PNG\r\n\x1a\n') return null;
  if (ascii(bytes, 12, 4) !== 'IHDR') throw scanError('image_invalid');
  return [view.getUint32(16), view.getUint32(20)];
}
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
function jpegSegment(view: DataView, offset: number): { next: number; size?: [number, number] } {
  if (view.getUint8(offset) !== 0xff) throw scanError('image_invalid');
  const marker = view.getUint8(offset + 1);
  if (marker === 0xff) return { next: offset + 1 };
  return jpegSizedSegment(view, offset, marker);
}
function jpegSizedSegment(
  view: DataView,
  offset: number,
  marker: number
): { next: number; size?: [number, number] } {
  const length = view.getUint16(offset + 2);
  if (length < 2 || offset + length + 2 > view.byteLength) throw scanError('image_invalid');
  return {
    next: offset + length + 2,
    size: SOF_MARKERS.has(marker) ? jpegFrame(view, offset, length) : undefined,
  };
}
function jpegFrame(view: DataView, offset: number, length: number): [number, number] {
  if (length < 8) throw scanError('image_invalid');
  return [view.getUint16(offset + 7), view.getUint16(offset + 5)];
}
const isJpeg = (bytes: Uint8Array): boolean => bytes[0] === 0xff && bytes[1] === 0xd8;
function jpegSize(bytes: Uint8Array, view: DataView): [number, number] | null {
  if (!isJpeg(bytes)) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    const segment = jpegSegment(view, offset);
    if (segment.size) return segment.size;
    offset = segment.next;
  }
  throw scanError('image_invalid');
}
const uint24 = (bytes: Uint8Array, offset: number): number =>
  bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65536;
function extendedWebpSize(bytes: Uint8Array): [number, number] {
  if (bytes[20]! & 2) throw scanError('image_invalid'); // Animated images are not screenshots.
  return [uint24(bytes, 24) + 1, uint24(bytes, 27) + 1];
}
function webpFrame(bytes: Uint8Array, view: DataView): [number, number] {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X') {
    return extendedWebpSize(bytes);
  }
  if (chunk === 'VP8L') {
    const bits = view.getUint32(21, true);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8 ')
    return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
  throw scanError('image_invalid');
}
function webpSize(bytes: Uint8Array, view: DataView): [number, number] | null {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  return webpFrame(bytes, view);
}
function rasterSize(bytes: Uint8Array, view: DataView): [number, number] | null {
  return pngSize(bytes, view) ?? jpegSize(bytes, view) ?? webpSize(bytes, view);
}
/** Check actual raster headers before allowing the browser to allocate decoded pixels. */
export function imageDimensions(bytes: Uint8Array): [number, number] {
  if (bytes.length < 30 || bytes.length > SCAN_LIMITS.fileBytes) throw scanError('image_size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = rasterSize(bytes, view);
  if (!size) throw scanError('image_type');
  checkDimensions(...size);
  return size;
}
