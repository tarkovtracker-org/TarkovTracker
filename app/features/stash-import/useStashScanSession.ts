import { imageDimensions } from '@/utils/stashScan/imageHeader';
import { overlapsRegion, splitRegion } from '@/utils/stashScan/regions';
import { needsReview, reviewCell } from '@/utils/stashScan/review';
import { createStashScanner } from '@/utils/stashScan/scanClient';
import {
  SCAN_LIMITS,
  scanError,
  type ReviewedCell,
  type ScanRect,
  type ScanResult,
  type ScanCommand,
} from '@/utils/stashScan/types';
export function useStashScanSession() {
  const source = shallowRef<File>();
  const result = shallowRef<ScanResult>();
  const rows = ref<ReviewedCell[]>([]);
  const activeKey = ref<number>();
  const image = shallowRef<Blob>();
  const width = ref(0);
  const height = ref(0);
  const busy = ref(false);
  const error = ref('');
  const stage = ref('decode');
  const completed = ref(0);
  const total = ref(1);
  let scanner: ReturnType<typeof createStashScanner> | undefined;
  let generation = 0;
  const active = computed(() => rows.value.find((row) => row.cell.key === activeKey.value));
  const remaining = computed(() => rows.value.filter(needsReview).length);
  const currentItems = computed(
    () => new Map(result.value?.catalog.items.map((item) => [item.id, item]) ?? [])
  );
  const rectKey = (rect: ScanRect) =>
    [rect.x, rect.y, rect.width, rect.height, rect.slotsWide, rect.slotsHigh].join(':');
  function setImage(blob: Blob) {
    image.value = blob;
  }
  function next() {
    const unchecked = rows.value.filter(needsReview);
    activeKey.value =
      unchecked.find((row) => row.cell.key > (activeKey.value ?? -1))?.cell.key ??
      unchecked[0]?.cell.key;
  }
  function accept(nextResult: ScanResult, preserve = false) {
    const previous = new Map(rows.value.map((row) => [rectKey(row.cell), row]));
    result.value = nextResult;
    if (nextResult.cells.length === 0) error.value = 'stash_import.errors.no_grid';
    width.value = nextResult.width;
    height.value = nextResult.height;
    setImage(nextResult.preview);
    rows.value = nextResult.cells.map((cell) => {
      const prior = preserve ? previous.get(rectKey(cell)) : undefined;
      return prior ? { ...prior, cell } : reviewCell(cell, currentItems.value);
    });
    activeKey.value = undefined;
    next();
  }
  function cancel() {
    generation++;
    scanner?.cancel();
    scanner = undefined;
    busy.value = false;
  }
  function createScanner() {
    scanner = createStashScanner((progress) => {
      stage.value = progress.stage;
      completed.value = progress.done;
      total.value = progress.total;
    });
    return scanner;
  }
  const messageOf = (failure: unknown) =>
    failure instanceof Error && failure.message.startsWith('stash_import.errors.')
      ? failure.message
      : 'stash_import.errors.scan_failed';
  function resumableCommand(command: ScanCommand): ScanCommand {
    if (command.op === 'scan' || scanner) return command;
    if (!source.value) return command;
    return { op: 'scan', file: source.value, rects: command.rects };
  }
  function acceptCurrent(revision: number, scanned: ScanResult, preserve: boolean) {
    if (generation === revision) accept(scanned, preserve);
  }
  function failCurrent(revision: number, failure: unknown) {
    if (generation !== revision) return;
    scanner?.cancel();
    scanner = undefined;
    error.value = messageOf(failure);
  }
  function settleCurrent(revision: number) {
    if (generation === revision) busy.value = false;
  }
  async function run(
    command: Parameters<ReturnType<typeof createStashScanner>['request']>[0],
    preserve = false
  ) {
    const revision = generation;
    error.value = '';
    busy.value = true;
    try {
      const resumed = resumableCommand(command);
      const scanned = await (scanner ?? createScanner()).request(resumed);
      acceptCurrent(revision, scanned, preserve);
    } catch (failure) {
      failCurrent(revision, failure);
    } finally {
      settleCurrent(revision);
    }
  }
  function selectedFile(files: File[]): File {
    if (files.length !== 1) throw scanError('one_image');
    const file = files[0]!;
    if (file.size > SCAN_LIMITS.fileBytes) throw scanError('image_size');
    return file;
  }
  async function select(files: File[]) {
    cancel();
    const revision = generation;
    source.value = undefined;
    result.value = undefined;
    rows.value = [];
    image.value = undefined;
    error.value = '';
    try {
      const file = selectedFile(files);
      const size = imageDimensions(new Uint8Array(await file.arrayBuffer()));
      if (revision !== generation) return;
      [width.value, height.value] = size;
      source.value = file;
      setImage(file);
      await run({ op: 'scan', file });
    } catch (failure) {
      if (revision === generation) error.value = messageOf(failure);
    }
  }
  async function rescan() {
    if (!source.value) return;
    cancel();
    await run({ op: 'scan', file: source.value });
  }
  async function region(rect: ScanRect) {
    if (!result.value && source.value) {
      await run({ op: 'scan', file: source.value, rects: [rect] });
      return;
    }
    const others = rows.value
      .filter((row) => !overlapsRegion(rect, row.cell))
      .map((row) => row.cell);
    await run({ op: 'rects', rects: [...others, rect] }, true);
  }
  async function split(columns: number, rowCount: number) {
    if (!active.value) return;
    const rects = rows.value.flatMap((row) =>
      row === active.value ? splitRegion(row.cell, columns, rowCount) : [row.cell]
    );
    await run({ op: 'rects', rects }, true);
  }
  function dispose() {
    cancel();
    image.value = undefined;
    source.value = result.value = undefined;
    rows.value = [];
  }
  onScopeDispose(dispose);
  return {
    source,
    result,
    rows,
    activeKey,
    active,
    image,
    width,
    height,
    busy,
    error,
    stage,
    completed,
    total,
    remaining,
    select,
    cancel,
    rescan,
    region,
    split,
    next,
  };
}
