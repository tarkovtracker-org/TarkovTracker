import { digest } from '@/utils/stashScan/catalogClient';
import { checkDimensions, imageDimensions } from '@/utils/stashScan/imageHeader';
import { SCAN_LIMITS, scanError, type ScanRect } from '@/utils/stashScan/types';
import type { RgbImage } from '@/utils/stashScan/core/grid';
export function validateRect(rect: ScanRect, image: { width: number; height: number }): void {
  const integers = [rect.x, rect.y, rect.width, rect.height, rect.slotsWide, rect.slotsHigh];
  if (!integers.every(Number.isSafeInteger)) throw scanError('region_invalid');
  validateRectBounds(rect, image);
}
function validateRectBounds(rect: ScanRect, image: { width: number; height: number }): void {
  if (!validRectOrigin(rect) || rect.width < 8 || rect.height < 8)
    throw scanError('region_invalid');
  validateRectExtent(rect, image);
}
function validateRectExtent(rect: ScanRect, image: { width: number; height: number }): void {
  if (rect.x + rect.width > image.width || rect.y + rect.height > image.height)
    throw scanError('region_invalid');
}
const validRectOrigin = (rect: ScanRect): boolean => rect.x >= 0 && rect.y >= 0;
function rgbPixels(rgba: Uint8ClampedArray): Uint8Array<ArrayBuffer> {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3)
    rgb.set(rgba.subarray(source, source + 3), target);
  return rgb;
}
/** Worker-only decoding: the screenshot is never passed to fetch or persisted. */
export async function decodeScreenshot(
  file: File
): Promise<{ image: RgbImage; sourceHash: string; preview: Blob }> {
  if (file.size > SCAN_LIMITS.fileBytes) throw scanError('image_size');
  imageDimensions(new Uint8Array(await file.arrayBuffer()));
  const bitmap = await createImageBitmap(file);
  try {
    checkDimensions(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw scanError('unsupported');
    context.drawImage(bitmap, 0, 0);
    const full = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const pixelHash = await digest(new Uint8Array(full.data.buffer));
    const sourceHash = await digest(
      new TextEncoder().encode(`${bitmap.width}:${bitmap.height}:${pixelHash}`)
    );
    const preview = await canvas.convertToBlob({ type: 'image/png' });
    canvas.width = canvas.height = 1;
    return {
      image: { data: rgbPixels(full.data), width: bitmap.width, height: bitmap.height },
      sourceHash,
      preview,
    };
  } finally {
    bitmap.close();
  }
}
