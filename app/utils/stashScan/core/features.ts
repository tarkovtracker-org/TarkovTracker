// Adapted from Wilsman/cultist-circle, MIT, pinned at
// d6228d1e722e120935348214ff4b04e266a43864. See /licenses/cultist-circle.txt.
// Area-averaged art correlation and short-name glyph features are unchanged.
import {
  assertFinite,
  assertImage,
  assertRegion,
  assertSlots,
  assertVector,
} from '@/utils/stashScan/core/validation';
import type { RgbImage } from '@/utils/stashScan/core/grid';
export const FEATURE_VERSION = 1;
export const TEMPLATE_SLOT_PX = 63;
export const TEXT_BAND_PX = 13;
export const BADGE_BAND_PX = 15;
const MAX_TEXT_SLOTS = 3;
export type FeatureVector = Float32Array | QuantisedVector;
export interface QuantisedVector {
  values: Int8Array;
  /** Multiply values by this to recover the normalised vector. */
  scale: number;
}
export interface CellFeatures {
  slotsWide: number;
  slotsHigh: number;
  artCoarse: Float32Array;
  artFine: Float32Array;
  textWidth: number;
  text: Float32Array;
  textInk: number;
  artContrast: number;
}
export function artCoarsePx(w: number, h: number): number {
  return Math.max(4, Math.min(8, Math.floor(24 / Math.max(w, h))));
}
export function artFinePx(w: number, h: number): number {
  return Math.max(8, Math.min(16, Math.floor(48 / Math.max(w, h))));
}
export function textHeight(): number {
  return TEXT_BAND_PX;
}
export function textWidthFor(slotsWide: number): number {
  return Math.round(Math.min(slotsWide, MAX_TEXT_SLOTS) * TEMPLATE_SLOT_PX - 2);
}
function artHeight(slotsHigh: number, perSlot: number): number {
  return Math.max(
    1,
    Math.round(
      ((slotsHigh * TEMPLATE_SLOT_PX - TEXT_BAND_PX - BADGE_BAND_PX) / TEMPLATE_SLOT_PX) * perSlot
    )
  );
}
export function featureShape(w: number, h: number) {
  assertSlots(w, h);
  const coarse = artCoarsePx(w, h);
  const fine = artFinePx(w, h);
  return {
    artCoarse: w * coarse * artHeight(h, coarse) * 3,
    artFine: w * fine * artHeight(h, fine) * 3,
    textWidth: textWidthFor(w),
    text: textWidthFor(w) * textHeight(),
  };
}
export function assertCellFeatures(features: CellFeatures): void {
  const shape = featureShape(features.slotsWide, features.slotsHigh);
  assertVector(features.artCoarse, shape.artCoarse);
  assertVector(features.artFine, shape.artFine);
  assertVector(features.text, shape.text);
  if (features.textWidth !== shape.textWidth) throw new RangeError('Unexpected text width');
  assertFinite(features.textInk);
  assertFinite(features.artContrast);
  assertSignalRange(features.textInk, features.artContrast);
}
function assertSignalRange(ink: number, contrast: number): void {
  if (ink < 0 || ink > 1) throw new RangeError('Invalid text ink share');
  if (contrast < 0) throw new RangeError('Invalid art contrast');
}
type Bounds = { from: number; to: number };
function overlap(pixel: number, bounds: Bounds): number {
  return Math.min(pixel + 1, bounds.to) - Math.max(pixel, bounds.from);
}
function weightedRow(image: RgbImage, y: number, bounds: Bounds): number[] {
  const sums = [0, 0, 0, 0];
  for (
    let x = Math.max(0, Math.floor(bounds.from));
    x < Math.min(image.width, Math.ceil(bounds.to));
    x++
  ) {
    const weight = overlap(x, bounds);
    const i = (y * image.width + x) * 3;
    sums[0]! += image.data[i]! * weight;
    sums[1]! += image.data[i + 1]! * weight;
    sums[2]! += image.data[i + 2]! * weight;
    sums[3]! += weight;
  }
  return sums;
}
function averagedPixel(image: RgbImage, x: Bounds, y: Bounds): number[] {
  const sums = [0, 0, 0, 0];
  for (
    let row = Math.max(0, Math.floor(y.from));
    row < Math.min(image.height, Math.ceil(y.to));
    row++
  ) {
    const weight = overlap(row, y);
    const pixels = weightedRow(image, row, x);
    for (let c = 0; c < 4; c++) sums[c]! += pixels[c]! * weight;
  }
  if (sums[3]! > 0) return sums.slice(0, 3).map((value) => value / sums[3]!);
  return [0, 0, 0];
}
/** Area averaging, including fractional source coordinates and mild enlarging. */
function resample(
  image: RgbImage,
  left: number,
  top: number,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number
): Float32Array {
  const out = new Float32Array(outWidth * outHeight * 3);
  const sx = width / outWidth;
  const sy = height / outHeight;
  for (let oy = 0; oy < outHeight; oy++) {
    const y0 = top + oy * sy;
    for (let ox = 0; ox < outWidth; ox++) {
      const x0 = left + ox * sx;
      out.set(
        averagedPixel(image, { from: x0, to: x0 + sx }, { from: y0, to: y0 + sy }),
        (oy * outWidth + ox) * 3
      );
    }
  }
  return out;
}
function squaredNorm(vector: Float32Array): number {
  let norm = 0;
  for (const value of vector) norm += value * value;
  return norm;
}
function unitLength(vector: Float32Array, norm: number): void {
  if (norm <= 0) return;
  for (let i = 0; i < vector.length; i++) vector[i]! /= norm;
}
function normalise(vector: Float32Array): number {
  let mean = 0;
  for (const value of vector) mean += value;
  mean /= vector.length;
  for (let i = 0; i < vector.length; i++) vector[i]! -= mean;
  const norm = squaredNorm(vector);
  unitLength(vector, Math.sqrt(norm));
  return Math.sqrt(norm / vector.length);
}
export function quantise(vector: Float32Array): QuantisedVector {
  let max = 0;
  for (const value of vector) max = Math.max(max, Math.abs(value));
  const scale = max / 127 || 1;
  return { values: Int8Array.from(vector, (value) => Math.round(value / scale)), scale };
}
function vectorParts(vector: FeatureVector): { values: Float32Array | Int8Array; scale: number } {
  if (vector instanceof Float32Array) return { values: vector, scale: 1 };
  return vector;
}
export function dot(a: Float32Array, b: FeatureVector): number {
  const { values, scale } = vectorParts(b);
  if (a.length !== values.length) throw new RangeError('Feature vector lengths differ');
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * values[i]!;
  return sum * scale;
}
function artFeature(
  image: RgbImage,
  left: number,
  top: number,
  width: number,
  height: number,
  slotsWide: number,
  slotsHigh: number,
  perSlot: number
): { vector: Float32Array; contrast: number } {
  const scale = (height - 1) / (slotsHigh * TEMPLATE_SLOT_PX);
  const bandTop = TEXT_BAND_PX * scale;
  const bandBottom = BADGE_BAND_PX * scale;
  const vector = resample(
    image,
    left + 1,
    top + 1 + bandTop,
    width - 2,
    height - 2 - bandTop - bandBottom,
    slotsWide * perSlot,
    artHeight(slotsHigh, perSlot)
  );
  return { vector, contrast: normalise(vector) };
}
function whitenessMap(band: Float32Array): Float32Array {
  const out = new Float32Array(band.length / 3);
  for (let p = 0; p < out.length; p++) {
    const r = band[p * 3]!;
    const g = band[p * 3 + 1]!;
    const b = band[p * 3 + 2]!;
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    out[p]! = Math.max(0, Math.max(0, min - 90) / 165 - Math.max(0, max - min - 40) / 215);
  }
  return out;
}
function neighborhood(
  source: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number[] {
  const values: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    const yy = Math.min(height - 1, Math.max(0, y + dy));
    for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(width - 1, Math.max(0, x + dx));
      values.push(source[yy * width + xx]!);
    }
  }
  return values;
}
function boxFilter(
  source: Float32Array,
  width: number,
  height: number,
  pick: (...values: number[]) => number
): Float32Array {
  const out = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      out[y * width + x]! = pick(...neighborhood(source, width, height, x, y));
  }
  return out;
}
function blurPixel(
  source: Float32Array,
  p: number,
  position: number,
  length: number,
  step: number
): number {
  const before = p + (Math.max(0, position - 1) - position) * step;
  const after = p + (Math.min(length - 1, position + 1) - position) * step;
  return (source[before]! + 2 * source[p]! + source[after]!) / 4;
}
function blurHorizontal(source: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      out[y * width + x]! = blurPixel(source, y * width + x, x, width, 1);
  }
  return out;
}
function blurVertical(source: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      out[y * width + x]! = blurPixel(source, y * width + x, y, height, width);
  }
  return out;
}
function blur(source: Float32Array, width: number, height: number): Float32Array {
  return blurVertical(blurHorizontal(source, width, height), width, height);
}
function textStrokes(
  whiteness: Float32Array,
  textWidth: number
): { vector: Float32Array; ink: number } {
  const rows = textHeight();
  const opened = boxFilter(
    boxFilter(whiteness, textWidth, rows, Math.min),
    textWidth,
    rows,
    Math.max
  );
  const strokes = new Float32Array(whiteness.length);
  let ink = 0;
  for (let p = 0; p < strokes.length; p++) {
    strokes[p]! = whiteness[p]! - opened[p]!;
    if (strokes[p]! > 0.3) ink++;
  }
  const vector = blur(strokes, textWidth, rows);
  normalise(vector);
  return { vector, ink: ink / vector.length };
}
function textFeature(
  image: RgbImage,
  left: number,
  top: number,
  width: number,
  height: number,
  slotsHigh: number,
  textWidth: number
) {
  const scale = (height - 1) / (slotsHigh * TEMPLATE_SLOT_PX);
  const sourceWidth = Math.min(width - 2, textWidth * scale);
  const band = resample(
    image,
    left + width - 1 - sourceWidth,
    top + 1,
    sourceWidth,
    TEXT_BAND_PX * scale,
    textWidth,
    textHeight()
  );
  return textStrokes(whitenessMap(band), textWidth);
}
/** Rectangle includes both border lines, width = slotsWide * pitch + 1. */
export function cellFeatures(
  image: RgbImage,
  left: number,
  top: number,
  width: number,
  height: number,
  slotsWide: number,
  slotsHigh: number
): CellFeatures {
  assertRegion(image, left, top, width, height);
  assertSlots(slotsWide, slotsHigh);
  const coarse = artFeature(
    image,
    left,
    top,
    width,
    height,
    slotsWide,
    slotsHigh,
    artCoarsePx(slotsWide, slotsHigh)
  );
  const fine = artFeature(
    image,
    left,
    top,
    width,
    height,
    slotsWide,
    slotsHigh,
    artFinePx(slotsWide, slotsHigh)
  );
  const textWidth = textWidthFor(slotsWide);
  const text = textFeature(image, left, top, width, height, slotsHigh, textWidth);
  return {
    slotsWide,
    slotsHigh,
    artCoarse: coarse.vector,
    artFine: fine.vector,
    textWidth,
    text: text.vector,
    textInk: text.ink,
    artContrast: fine.contrast,
  };
}
export function rotateClockwise(image: RgbImage): RgbImage {
  assertImage(image);
  const { width, height, data } = image;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out.set(
        data.subarray((y * width + x) * 3, (y * width + x) * 3 + 3),
        (x * height + height - 1 - y) * 3
      );
    }
  }
  return { data: out, width: height, height: width };
}
function shiftedRowScore(
  a: Float32Array,
  aWidth: number,
  values: Float32Array | Int8Array,
  bWidth: number,
  y: number,
  by: number,
  dx: number
): number {
  const offset = bWidth - aWidth + dx;
  let sum = 0;
  for (let x = Math.max(0, -offset); x < Math.min(aWidth, bWidth - offset); x++)
    sum += a[y * aWidth + x]! * values[by * bWidth + x + offset]!;
  return sum;
}
function textScoreAtShift(
  a: Float32Array,
  aWidth: number,
  values: Float32Array | Int8Array,
  bWidth: number,
  dx: number,
  dy: number
): number {
  let sum = 0;
  for (let y = Math.max(0, -dy); y < Math.min(textHeight(), textHeight() - dy); y++)
    sum += shiftedRowScore(a, aWidth, values, bWidth, y, y + dy, dx);
  return sum;
}
/** Correlation over small shifts; maps are right-aligned. */
export function shiftedTextScore(
  a: Float32Array,
  aWidth: number,
  b: FeatureVector,
  bWidth: number,
  maxShiftX: number,
  maxShiftY: number
): number {
  const { values, scale } = vectorParts(b);
  let best = -Infinity;
  for (let dy = -maxShiftY; dy <= maxShiftY; dy++) {
    for (let dx = -maxShiftX; dx <= maxShiftX; dx++)
      best = Math.max(best, textScoreAtShift(a, aWidth, values, bWidth, dx, dy));
  }
  return best * scale;
}
