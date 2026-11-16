import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { addCatalogIcon, type IconIndex } from '@/utils/stashScan/core/matcher';
import type { ScanItem } from '@/utils/stashScan/types';
/** Curated supplements retain the upstream template as well. Provenance: references/README.md. */
const references = new Map([
  [
    '5d1b3a5d86f774252167ba22',
    {
      file: new URL('./references/pile-of-meds-grid.png', import.meta.url),
      sha256: 'f53021fca3c3ebe709340f76307c6c9299b07903a2be6b4783960d61f0a504c5',
    },
  ],
]);
export async function readReferenceGrid(itemId: string): Promise<Uint8Array | undefined> {
  const reference = references.get(itemId);
  if (!reference) return;
  const bytes = await readFile(reference.file);
  if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256)
    throw new Error(`Reference image hash mismatch: ${itemId}`);
  return bytes;
}
export async function addGridImage(
  index: IconIndex,
  item: ScanItem,
  bytes: Uint8Array
): Promise<boolean> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 1_000_000 })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return addCatalogIcon(index, { ...item, grid: { data, width: info.width, height: info.height } });
}
