import {
  artCoarsePx,
  artFinePx,
  BADGE_BAND_PX,
  FEATURE_VERSION,
  TEMPLATE_SLOT_PX,
  TEXT_BAND_PX,
  textHeight,
  textWidthFor,
} from '@/utils/stashScan/core/features';
import {
  addTemplate,
  createIconIndex,
  type IconIndex,
  type IconTemplate,
  type TemplateFeatures,
} from '@/utils/stashScan/core/matcher';
import { SCAN_LIMITS, scanError } from '@/utils/stashScan/types';
type Vector = TemplateFeatures['text'];
type VectorHeader = [number, number];
type TemplateHeader = [string, string, boolean, number, VectorHeader, VectorHeader, VectorHeader];
interface ShardHeader {
  version: number;
  width: number;
  height: number;
  templates: TemplateHeader[];
}
const encoder = new TextEncoder();
const vectorHeader = (vector: Vector): VectorHeader => [vector.scale, vector.values.length];
const vectors = (template: IconTemplate): Vector[] => [
  template.features.artCoarse,
  template.features.artFine,
  template.features.text,
];
const templateHeader = (template: IconTemplate): TemplateHeader => [
  template.itemId,
  template.shortName,
  template.rotated,
  template.features.textWidth,
  vectorHeader(template.features.artCoarse),
  vectorHeader(template.features.artFine),
  vectorHeader(template.features.text),
];
/** Offline builder output. Each dimension shard is independently hashed and compressed. */
export function encodeScanShard(
  width: number,
  height: number,
  templates: IconTemplate[]
): Uint8Array {
  const header = encoder.encode(
    JSON.stringify({
      version: FEATURE_VERSION,
      width,
      height,
      templates: templates.map(templateHeader),
    })
  );
  const data = templates.flatMap(vectors);
  const output = new Uint8Array(
    4 + header.length + data.reduce((sum, vector) => sum + vector.values.length, 0)
  );
  new DataView(output.buffer).setUint32(0, header.length, true);
  output.set(header, 4);
  let offset = 4 + header.length;
  for (const vector of data) {
    output.set(
      new Uint8Array(vector.values.buffer, vector.values.byteOffset, vector.values.length),
      offset
    );
    offset += vector.values.length;
  }
  return output;
}
const validSlot = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10;
function validateHeader(header: ShardHeader): void {
  if (header.version !== FEATURE_VERSION || !validSlot(header.width) || !validSlot(header.height))
    throw scanError('catalog_invalid');
  validateTemplates(header.templates);
}
function validateTemplates(templates: TemplateHeader[]): void {
  if (!Array.isArray(templates) || templates.length > 20_000) throw scanError('catalog_invalid');
}
function validateTemplate(header: TemplateHeader, width: number): void {
  if (!Array.isArray(header) || header.length !== 7) throw scanError('catalog_invalid');
  validateTemplateFields(header, width);
}
function validateTemplateFields(header: TemplateHeader, width: number): void {
  const strings = [header[0], header[1]];
  if (!strings.every((value) => typeof value === 'string' && value.length <= 256))
    throw scanError('catalog_invalid');
  if (typeof header[2] !== 'boolean' || header[3] !== textWidthFor(width))
    throw scanError('catalog_invalid');
}
const validScale = (scale: number): boolean => Number.isFinite(scale) && scale >= 0 && scale <= 1;
function takeVector(
  bytes: Uint8Array,
  cursor: { offset: number },
  header: VectorHeader,
  expected: number
): Vector {
  if (!Array.isArray(header) || header.length !== 2) throw scanError('catalog_invalid');
  return readVector(bytes, cursor, header, expected);
}
function readVector(
  bytes: Uint8Array,
  cursor: { offset: number },
  header: VectorHeader,
  expected: number
): Vector {
  const [scale, length] = header;
  if (!validScale(scale)) throw scanError('catalog_invalid');
  if (length !== expected || cursor.offset + length > bytes.length)
    throw scanError('catalog_invalid');
  const values = new Int8Array(bytes.buffer, bytes.byteOffset + cursor.offset, length);
  cursor.offset += length;
  return { scale, values };
}
const artLength = (width: number, height: number, perSlot: number): number =>
  width *
  perSlot *
  Math.max(
    1,
    Math.round(
      ((height * TEMPLATE_SLOT_PX - TEXT_BAND_PX - BADGE_BAND_PX) / TEMPLATE_SLOT_PX) * perSlot
    )
  ) *
  3;
function decodeTemplate(
  bytes: Uint8Array,
  cursor: { offset: number },
  header: TemplateHeader,
  shape: ShardHeader
): IconTemplate {
  const { width, height } = shape;
  validateTemplate(header, width);
  return {
    itemId: header[0],
    shortName: header[1],
    rotated: header[2],
    features: {
      textWidth: header[3],
      artCoarse: takeVector(
        bytes,
        cursor,
        header[4],
        artLength(width, height, artCoarsePx(width, height))
      ),
      artFine: takeVector(
        bytes,
        cursor,
        header[5],
        artLength(width, height, artFinePx(width, height))
      ),
      text: takeVector(bytes, cursor, header[6], textWidthFor(width) * textHeight()),
    },
  };
}
export function decodeScanShard(bytes: Uint8Array): {
  index: IconIndex;
  width: number;
  height: number;
} {
  if (bytes.length < 4 || bytes.length > SCAN_LIMITS.decodedShardBytes)
    throw scanError('catalog_invalid');
  const headerSize = shardHeaderSize(bytes);
  const header = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + headerSize))
  ) as ShardHeader;
  validateHeader(header);
  return decodeTemplates(bytes, header, headerSize);
}
function shardHeaderSize(bytes: Uint8Array): number {
  const headerSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    0,
    true
  );
  if (headerSize > 4 * 1024 * 1024 || headerSize + 4 > bytes.length)
    throw scanError('catalog_invalid');
  return headerSize;
}
function decodeTemplates(
  bytes: Uint8Array,
  header: ShardHeader,
  headerSize: number
): { index: IconIndex; width: number; height: number } {
  const index = createIconIndex();
  const cursor = { offset: 4 + headerSize };
  for (const template of header.templates) {
    addTemplate(
      index,
      header.width,
      header.height,
      decodeTemplate(bytes, cursor, template, header)
    );
  }
  if (cursor.offset !== bytes.length) throw scanError('catalog_invalid');
  return { index, width: header.width, height: header.height };
}
