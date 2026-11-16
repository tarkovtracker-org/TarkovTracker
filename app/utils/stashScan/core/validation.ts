// Adapted from Wilsman/cultist-circle, MIT, pinned at
// d6228d1e722e120935348214ff4b04e266a43864. See /licenses/cultist-circle.txt.
import type { RgbImage } from '@/utils/stashScan/core/grid';
const MAX_AXIS = 16_384;
const MAX_PIXELS = 16_777_216;
function assertIntegerRange(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value)) throw new RangeError('Expected an integer');
  if (value < min || value > max) throw new RangeError('Value exceeds scan bounds');
}
export function assertImage(image: RgbImage): void {
  assertIntegerRange(image.width, 1, MAX_AXIS);
  assertIntegerRange(image.height, 1, MAX_AXIS);
  assertIntegerRange(image.width * image.height, 1, MAX_PIXELS);
  if (!(image.data instanceof Uint8Array)) throw new TypeError('Expected packed RGB bytes');
  if (image.data.length !== image.width * image.height * 3) {
    throw new RangeError('RGB data length does not match dimensions');
  }
}
export function assertSlots(width: number, height: number): void {
  assertIntegerRange(width, 1, 10);
  assertIntegerRange(height, 1, 10);
}
export function assertRegion(
  image: RgbImage,
  left: number,
  top: number,
  width: number,
  height: number
): void {
  assertImage(image);
  assertIntegerRange(left, 0, image.width - 1);
  assertIntegerRange(top, 0, image.height - 1);
  assertIntegerRange(width, 3, image.width - left);
  assertIntegerRange(height, 3, image.height - top);
}
export function assertFinite(value: number): void {
  if (!Number.isFinite(value)) throw new RangeError('Expected a finite feature value');
}
function isFeatureStorage(values: Float32Array | Int8Array): boolean {
  return values instanceof Float32Array || values instanceof Int8Array;
}
export function assertVector(values: Float32Array | Int8Array, length: number): void {
  if (!isFeatureStorage(values)) throw new TypeError('Expected typed feature storage');
  if (values.length !== length) throw new RangeError('Unexpected feature vector length');
  for (const value of values) assertFinite(value);
}
