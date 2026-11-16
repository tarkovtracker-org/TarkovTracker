import { loadSizes, readScanCatalog } from '@/utils/stashScan/catalogClient';
import { cellFeatures } from '@/utils/stashScan/core/features';
import { detectFirMark } from '@/utils/stashScan/core/firMark';
import { detectGrid, type RgbImage } from '@/utils/stashScan/core/grid';
import { matchCell, type IconIndex } from '@/utils/stashScan/core/matcher';
import { decodeScreenshot, validateRect } from '@/utils/stashScan/decodeImage';
import {
  SCAN_LIMITS,
  scanError,
  type ScanCatalog,
  type ScanCell,
  type ScanCommand,
  type ScanRect,
  type ScanReply,
} from '@/utils/stashScan/types';
const endpoint = globalThis as unknown as {
  onmessage: (event: MessageEvent<ScanCommand>) => void;
  postMessage: (value: ScanReply) => void;
};
let source: { image: RgbImage; sourceHash: string; preview: Blob } | undefined;
let catalog: ScanCatalog | undefined;
const indexes = new Map<string, IconIndex>();
function matchRegion(image: RgbImage, rect: ScanRect, index: IconIndex, key: number): ScanCell {
  validateRect(rect, image);
  const features = cellFeatures(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    rect.slotsWide,
    rect.slotsHigh
  );
  const matched = matchCell(features, index);
  return {
    ...rect,
    key,
    empty: matched.empty,
    margin: matched.margin,
    candidates: matched.matches.map(({ itemId, score }) => ({ itemId, score })),
    fir: !matched.empty && detectFirMark(image, rect),
  };
}
async function run(command: ScanCommand): Promise<void> {
  endpoint.postMessage({ type: 'progress', stage: 'decode', done: 0, total: 1 });
  const { image, sourceHash, preview } = await readSource(command);
  const rects = commandRects(command, image);
  if (rects.length > SCAN_LIMITS.cells) throw scanError('too_many_cells');
  endpoint.postMessage({ type: 'progress', stage: 'catalog', done: 0, total: 1 });
  catalog ??= await readScanCatalog();
  const sizes = [...new Set(rects.map((rect) => `${rect.slotsWide}x${rect.slotsHigh}`))];
  const index = await loadSizes(catalog, sizes, indexes);
  const cells = matchRegions(image, rects, index);
  endpoint.postMessage({
    type: 'result',
    result: { width: image.width, height: image.height, sourceHash, cells, catalog, preview },
  });
}
async function readSource(command: ScanCommand) {
  if (command.op === 'scan') source = await decodeScreenshot(command.file);
  if (!source) throw scanError('image_invalid');
  return source;
}
function commandRects(command: ScanCommand, image: RgbImage): ScanRect[] {
  return command.op === 'rects' ? command.rects : (command.rects ?? detectGrid(image).cells);
}
function matchRegions(image: RgbImage, rects: ScanRect[], index: IconIndex): ScanCell[] {
  const cells: ScanCell[] = [];
  for (const [key, rect] of rects.entries()) {
    cells.push(matchRegion(image, rect, index, key));
    endpoint.postMessage({ type: 'progress', stage: 'match', done: key + 1, total: rects.length });
  }
  return cells;
}
endpoint.onmessage = ({ data }) => {
  void run(data).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    endpoint.postMessage({
      type: 'error',
      error: message.startsWith('stash_import.errors.')
        ? message
        : 'stash_import.errors.scan_failed',
    });
  });
};
