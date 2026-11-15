// Adapted from Wilsman/cultist-circle, MIT, pinned at
// d6228d1e722e120935348214ff4b04e266a43864. See /licenses/cultist-circle.txt.
// Grid-ridge/lattice detection inspired upstream by tarkovtracker-org/RatEye.
import { assertImage } from '@/utils/stashScan/core/validation';
export interface RgbImage {
  /** Packed RGB bytes, row-major. */
  data: Uint8Array;
  width: number;
  height: number;
}
export interface GridCell {
  x: number;
  y: number;
  /** Both border lines included. */
  width: number;
  height: number;
  slotsWide: number;
  slotsHigh: number;
}
export interface GridDetection {
  /** Pixel distance between neighbouring grid lines (63 at 1080p). */
  pitch: number;
  cells: GridCell[];
}
const MIN_PITCH = 24;
const MIN_SHORT_RUN = 6;
const MAX_PITCH = 260;
const RIDGE_CONTRAST = 14;
const MAX_LINE_SATURATION = 110;
const SEPARATOR_COVERAGE = 0.35;
const BORDER_COVERAGE = 0.6;
interface PixelStats {
  brightness: Uint8Array;
  neutral: Uint8Array;
}
function pixelStats(image: RgbImage): PixelStats {
  const brightness = new Uint8Array(image.width * image.height);
  const neutral = new Uint8Array(brightness.length);
  for (let p = 0; p < brightness.length; p++) {
    const r = image.data[p * 3]!;
    const g = image.data[p * 3 + 1]!;
    const b = image.data[p * 3 + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    brightness[p]! = max;
    neutral[p]! = Number(max > 0 && (max - min) * 255 <= MAX_LINE_SATURATION * max);
  }
  return { brightness, neutral };
}
function isDoubleRidge(stats: PixelStats, p: number, step: number): boolean {
  const here = stats.brightness[p]!;
  const after = stats.brightness[p + step]!;
  return (
    Math.abs(here - after) < RIDGE_CONTRAST &&
    stats.neutral[p + step]! === 1 &&
    after - stats.brightness[p + 2 * step]! >= RIDGE_CONTRAST
  );
}
function markRidge(stats: PixelStats, p: number, step: number, mask: Uint8Array): void {
  if (!stats.neutral[p]!) return;
  if (stats.brightness[p]! - stats.brightness[p - step]! < RIDGE_CONTRAST) return;
  if (stats.brightness[p]! - stats.brightness[p + step]! >= RIDGE_CONTRAST) {
    mask[p]! = 1;
    return;
  }
  markDoubleRidge(stats, p, step, mask);
}
function markDoubleRidge(stats: PixelStats, p: number, step: number, mask: Uint8Array): void {
  if (!isDoubleRidge(stats, p, step)) return;
  mask[p]! = 1;
  mask[p + step]! = 1;
}
function ridgeBounds(width: number, height: number, vertical: boolean) {
  if (vertical) return { step: 1, xStart: 1, xEnd: width - 2, yStart: 0, yEnd: height };
  return { step: width, xStart: 0, xEnd: width, yStart: 1, yEnd: height - 2 };
}
/** A crop can retain a visible border while removing the outside comparison pixel. */
function markBoundaryRidge(stats: PixelStats, p: number, step: number, mask: Uint8Array): void {
  if (!stats.neutral[p]) return;
  if (stats.brightness[p]! - stats.brightness[p + step]! >= RIDGE_CONTRAST) {
    mask[p] = 1;
    return;
  }
  markDoubleRidge(stats, p, step, mask);
}
function imageBoundaryRidges(
  stats: PixelStats,
  mask: Uint8Array,
  width: number,
  height: number,
  vertical: boolean
): void {
  const axis = scanAxis(width, height, !vertical);
  if (axis.length < 3) return;
  for (let lane = 0; lane < axis.lanes; lane++) {
    const first = lane * axis.laneStep;
    const last = first + (axis.length - 1) * axis.alongStep;
    markBoundaryRidge(stats, first, axis.alongStep, mask);
    markBoundaryRidge(stats, last, -axis.alongStep, mask);
  }
}
function ridgeMask(
  stats: PixelStats,
  width: number,
  height: number,
  vertical: boolean
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const bounds = ridgeBounds(width, height, vertical);
  for (let y = bounds.yStart; y < bounds.yEnd; y++) {
    for (let x = bounds.xStart; x < bounds.xEnd; x++)
      markRidge(stats, y * width + x, bounds.step, mask);
  }
  imageBoundaryRidges(stats, mask, width, height, vertical);
  return mask;
}
interface Segment {
  position: number;
  from: number;
  to: number;
}
function scanAxis(width: number, height: number, vertical: boolean) {
  if (vertical) return { lanes: width, length: height, laneStep: 1, alongStep: width };
  return { lanes: height, length: width, laneStep: width, alongStep: 1 };
}
function bridgeable(
  mask: Uint8Array,
  base: number,
  step: number,
  t: number,
  length: number,
  start: number
): boolean {
  return start >= 0 && t + 1 < length && mask[base + (t + 1) * step]! === 1;
}
function finishRun(
  segments: Segment[],
  lane: number,
  start: number,
  end: number,
  minLength: number
): void {
  if (start < 0) return;
  if (end - start < minLength) return;
  segments.push({ position: lane, from: start, to: end });
}
function nextRunPosition(
  mask: Uint8Array,
  base: number,
  step: number,
  t: number,
  length: number,
  start: number
): number {
  if (bridgeable(mask, base, step, t, length, start)) return t + 2;
  return t;
}
function collectLane(
  mask: Uint8Array,
  lane: number,
  length: number,
  laneStep: number,
  alongStep: number,
  minLength: number
): Segment[] {
  const segments: Segment[] = [];
  const base = lane * laneStep;
  let start = -1;
  let t = 0;
  while (t <= length) {
    if (lineOn(mask, base, alongStep, t, length)) {
      start = freshRunStart(start, t);
      t++;
      continue;
    }
    const bridged = nextRunPosition(mask, base, alongStep, t, length, start);
    if (bridged !== t) {
      t = bridged;
      continue;
    }
    finishRun(segments, lane, start, t, minLength);
    start = -1;
    t++;
  }
  return segments;
}
function lineOn(mask: Uint8Array, base: number, step: number, t: number, length: number): boolean {
  return t < length && mask[base + t * step]! === 1;
}
function freshRunStart(start: number, t: number): number {
  return start < 0 ? t : start;
}
function collectRuns(
  mask: Uint8Array,
  width: number,
  height: number,
  vertical: boolean,
  minLength: number
): Segment[] {
  const axis = scanAxis(width, height, vertical);
  const segments: Segment[] = [];
  for (let lane = 0; lane < axis.lanes; lane++)
    segments.push(
      ...collectLane(mask, lane, axis.length, axis.laneStep, axis.alongStep, minLength)
    );
  return segments;
}
function paintSegment(segment: Segment, width: number, vertical: boolean, out: Uint8Array): void {
  if (!vertical) {
    out.fill(1, segment.position * width + segment.from, segment.position * width + segment.to);
    return;
  }
  for (let k = segment.from; k < segment.to; k++) out[k * width + segment.position]! = 1;
}
function paintSegments(
  segments: Segment[],
  width: number,
  vertical: boolean,
  out: Uint8Array
): void {
  for (const segment of segments) paintSegment(segment, width, vertical, out);
}
function centredProjection(projection: Float64Array): { values: Float64Array; energy: number } {
  let mean = 0;
  for (const value of projection) mean += value;
  mean /= Math.max(1, projection.length);
  const values = new Float64Array(projection.length);
  let energy = 0;
  for (let i = 0; i < values.length; i++) {
    values[i]! = projection[i]! - mean;
    energy += values[i]! * values[i]!;
  }
  return { values, energy };
}
function correlation(values: Float64Array, lag: number): number {
  let sum = 0;
  for (let i = 0; i + lag < values.length; i++) sum += values[i]! * values[i + lag]!;
  return sum;
}
function correlationScores(
  values: Float64Array,
  energy: number,
  maxLag: number,
  refineLag: number
): Float64Array {
  const scores = new Float64Array(Math.max(maxLag, refineLag) + 2);
  for (let lag = MIN_PITCH - 1; lag < Math.min(scores.length, values.length); lag++)
    scores[lag]! = correlation(values, lag) / energy;
  return scores;
}
function isStrongPeak(scores: Float64Array, lag: number, best: number): boolean {
  return (
    scores[lag]! >= best * 0.6 &&
    scores[lag]! >= scores[lag - 1]! &&
    scores[lag]! >= scores[lag + 1]!
  );
}
function firstPeak(scores: Float64Array, maxLag: number, best: number): number {
  for (let lag = MIN_PITCH; lag <= maxLag; lag++) {
    if (isStrongPeak(scores, lag, best)) return lag;
  }
  return 0;
}
function bestMultipleLag(scores: Float64Array, base: number, multiple: number, refineLag: number) {
  let lag = 0;
  let score = 0;
  for (
    let candidate = base * multiple - multiple;
    candidate <= Math.min(refineLag, base * multiple + multiple);
    candidate++
  ) {
    if (scores[candidate]! > score) {
      score = scores[candidate]!;
      lag = candidate;
    }
  }
  return { lag, score };
}
function refineMultiple(
  scores: Float64Array,
  base: number,
  multiple: number,
  refineLag: number,
  best: number
): number {
  const { lag, score } = bestMultipleLag(scores, base, multiple, refineLag);
  if (!lag || score < best * 0.6) return 0;
  const refined = lag / multiple;
  if (Math.abs(refined - base) > 1) return 0;
  return refined;
}
function refinePitch(scores: Float64Array, base: number, refineLag: number, best: number): number {
  for (let multiple = Math.min(8, Math.floor(refineLag / base)); multiple >= 2; multiple--) {
    const refined = refineMultiple(scores, base, multiple, refineLag, best);
    if (refined) return snapPitch(refined);
  }
  return base;
}
function snapPitch(pitch: number): number {
  return Math.abs(pitch - Math.round(pitch)) < 0.2 ? Math.round(pitch) : pitch;
}
function estimatePitch(projection: Float64Array): number {
  const { values, energy } = centredProjection(projection);
  if (energy === 0) return 0;
  const maxLag = Math.min(MAX_PITCH, Math.floor(values.length / 2));
  const refineLag = Math.min(MAX_PITCH * 8, Math.floor(values.length * 0.6));
  const scores = correlationScores(values, energy, maxLag, refineLag);
  const best = Math.max(0, ...scores.subarray(MIN_PITCH, maxLag + 1));
  if (best < 0.15) return 0;
  const base = firstPeak(scores, maxLag, best);
  if (!base) return 0;
  return refinePitch(scores, base, refineLag, best);
}
function sharedPitch(fromColumns: number, fromRows: number): number {
  const small = Math.min(fromColumns, fromRows);
  const ratio = Math.max(fromColumns, fromRows) / small;
  if (Math.abs(ratio - Math.round(ratio)) < 0.08) return small;
  return (fromColumns + fromRows) / 2;
}
function measurePitch(
  vertical: Segment[],
  horizontal: Segment[],
  width: number,
  height: number
): number {
  const columns = new Float64Array(width);
  const rows = new Float64Array(height);
  for (const s of vertical) columns[s.position]! += s.to - s.from;
  for (const s of horizontal) rows[s.position]! += s.to - s.from;
  return combinePitches(estimatePitch(columns), estimatePitch(rows));
}
function combinePitches(columns: number, rows: number): number {
  if (columns && rows) return sharedPitch(columns, rows);
  return columns || rows;
}
interface Phase {
  offset: number;
  weight: number;
  from: number;
  to: number;
}
function phaseAt(position: number, pitch: number): number {
  return ((position % pitch) + pitch) % pitch;
}
function phaseWeights(segments: Segment[], pitch: number): Float64Array {
  const weights = new Float64Array(Math.max(1, Math.round(pitch)));
  for (const s of segments)
    weights[Math.round(phaseAt(s.position, pitch)) % weights.length]! += s.to - s.from;
  return weights;
}
function supportedPhase(weight: Float64Array, i: number, pitch: number, max: number): boolean {
  if (weight[i]! < max * 0.08 || weight[i]! < pitch * 2) return false;
  const prev = weight[(i - 1 + weight.length) % weight.length]!;
  const next = weight[(i + 1) % weight.length]!;
  return phasePeak(weight[i]!, prev, next, i);
}
function phasePeak(weight: number, prev: number, next: number, i: number): boolean {
  if (weight < prev || weight < next) return false;
  return !(weight === prev && i > 0);
}
function phaseExtent(segments: Segment[], pitch: number, offset: number) {
  let from = Infinity;
  let to = -Infinity;
  for (const s of segments) {
    const distance = Math.abs(phaseAt(s.position, pitch) - ((offset + pitch) % pitch));
    if (Math.min(distance, pitch - distance) > 1.5) continue;
    from = Math.min(from, s.position);
    to = Math.max(to, s.position);
  }
  return { from, to };
}
function weightedPhase(
  segments: Segment[],
  pitch: number,
  weights: Float64Array,
  i: number
): Phase | undefined {
  const w = weights[i]!;
  const prev = weights[(i - 1 + weights.length) % weights.length]!;
  const next = weights[(i + 1) % weights.length]!;
  const offset = (i * w + (i - 1) * prev + (i + 1) * next) / (w + prev + next);
  const extent = phaseExtent(segments, pitch, offset);
  if (extent.from > extent.to) return undefined;
  return { offset: (offset + pitch) % pitch, weight: w + prev + next, ...extent };
}
function findPhases(segments: Segment[], pitch: number): Phase[] {
  const weights = phaseWeights(segments, pitch);
  const max = Math.max(0, ...weights);
  if (!max) return [];
  const phases: Phase[] = [];
  for (let i = 0; i < weights.length; i++)
    appendSupportedPhase(phases, segments, pitch, weights, i, max);
  return phases;
}
function appendSupportedPhase(
  out: Phase[],
  segments: Segment[],
  pitch: number,
  weights: Float64Array,
  i: number,
  max: number
): void {
  if (!supportedPhase(weights, i, pitch, max)) return;
  const phase = weightedPhase(segments, pitch, weights, i);
  if (phase) out.push(phase);
}
function withinBounds(x: number, y: number, width: number, height: number): boolean {
  return Math.min(x, y) >= 0 && x < width && y < height;
}
function hitAt(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  return withinBounds(x, y, width, height) && mask[y * width + x]! === 1;
}
function coveredAt(
  mask: Uint8Array,
  width: number,
  height: number,
  vertical: boolean,
  position: number,
  t: number
): boolean {
  const x = vertical ? position : t;
  const y = vertical ? t : position;
  const stepX = Number(vertical);
  const stepY = Number(!vertical);
  return [-1, 0, 1].some((d) => hitAt(mask, width, height, x + d * stepX, y + d * stepY));
}
function coverage(
  mask: Uint8Array,
  width: number,
  height: number,
  vertical: boolean,
  position: number,
  from: number,
  to: number
): number {
  const end = Math.min(to, vertical ? height : width);
  let hits = 0;
  let total = 0;
  for (let t = Math.max(0, from); t < end; t++) {
    total++;
    hits += Number(coveredAt(mask, width, height, vertical, position, t));
  }
  return total ? hits / total : 0;
}
interface Lattice {
  columns: number;
  rows: number;
  lineX: (i: number) => number;
  lineY: (j: number) => number;
  left: (i: number, j: number) => number;
  top: (i: number, j: number) => number;
}
function latticeAxis(phase: Phase, pitch: number) {
  const first = Math.ceil((phase.from - phase.offset - 1) / pitch);
  const last = Math.floor((phase.to - phase.offset + 1) / pitch);
  return {
    count: last - first,
    line: (i: number) => Math.round(phase.offset + (first + i) * pitch),
  };
}
function leftEdges(
  mask: Uint8Array,
  width: number,
  height: number,
  lattice: Lattice,
  margin: number
): Float32Array {
  const edges = new Float32Array((lattice.columns + 1) * lattice.rows);
  for (let j = 0; j < lattice.rows; j++) {
    for (let i = 0; i <= lattice.columns; i++)
      edges[j * (lattice.columns + 1) + i] = coverage(
        mask,
        width,
        height,
        true,
        lattice.lineX(i),
        lattice.lineY(j) + margin,
        lattice.lineY(j + 1) - margin
      );
  }
  return edges;
}
function topEdges(
  mask: Uint8Array,
  width: number,
  height: number,
  lattice: Lattice,
  margin: number
): Float32Array {
  const edges = new Float32Array(lattice.columns * (lattice.rows + 1));
  for (let j = 0; j <= lattice.rows; j++) {
    for (let i = 0; i < lattice.columns; i++)
      edges[j * lattice.columns + i] = coverage(
        mask,
        width,
        height,
        false,
        lattice.lineY(j),
        lattice.lineX(i) + margin,
        lattice.lineX(i + 1) - margin
      );
  }
  return edges;
}
function createLattice(
  vertical: Uint8Array,
  horizontal: Uint8Array,
  width: number,
  height: number,
  pitch: number,
  columnPhase: Phase,
  rowPhase: Phase
): Lattice | undefined {
  const x = latticeAxis(columnPhase, pitch);
  const y = latticeAxis(rowPhase, pitch);
  if (x.count < 1 || y.count < 1) return undefined;
  const lattice: Lattice = {
    columns: x.count,
    rows: y.count,
    lineX: x.line,
    lineY: y.line,
    left: () => 0,
    top: () => 0,
  };
  const margin = Math.max(2, Math.round(pitch * 0.12));
  const left = leftEdges(vertical, width, height, lattice, margin);
  const top = topEdges(horizontal, width, height, lattice, margin);
  lattice.left = (i, j) => left[j * (lattice.columns + 1) + i]!;
  lattice.top = (i, j) => top[j * lattice.columns + i]!;
  return lattice;
}
function rootOf(parent: number[], a: number): number {
  while (parent[a]! !== a) {
    parent[a]! = parent[parent[a]!]!;
    a = parent[a]!;
  }
  return a;
}
function joinNeighbors(parent: number[], lattice: Lattice, i: number, j: number): void {
  const k = j * lattice.columns + i;
  joinRight(parent, lattice, i, j, k);
  joinBelow(parent, lattice, i, j, k);
}
function joinRight(parent: number[], lattice: Lattice, i: number, j: number, k: number): void {
  if (i + 1 >= lattice.columns) return;
  if (lattice.left(i + 1, j) < SEPARATOR_COVERAGE)
    parent[rootOf(parent, k + 1)]! = rootOf(parent, k);
}
function joinBelow(parent: number[], lattice: Lattice, i: number, j: number, k: number): void {
  if (j + 1 >= lattice.rows) return;
  if (lattice.top(i, j + 1) < SEPARATOR_COVERAGE)
    parent[rootOf(parent, k + lattice.columns)]! = rootOf(parent, k);
}
interface Group {
  i0: number;
  j0: number;
  i1: number;
  j1: number;
  count: number;
}
function expandGroup(groups: Map<number, Group>, root: number, i: number, j: number): void {
  const group = groups.get(root);
  if (!group) {
    groups.set(root, { i0: i, j0: j, i1: i, j1: j, count: 1 });
    return;
  }
  group.i0 = Math.min(group.i0, i);
  group.j0 = Math.min(group.j0, j);
  group.i1 = Math.max(group.i1, i);
  group.j1 = Math.max(group.j1, j);
  group.count++;
}
function connectedGroups(lattice: Lattice): Group[] {
  const parent = Array.from({ length: lattice.columns * lattice.rows }, (_, k) => k);
  for (let j = 0; j < lattice.rows; j++) {
    for (let i = 0; i < lattice.columns; i++) joinNeighbors(parent, lattice, i, j);
  }
  return collectGroups(parent, lattice);
}
function collectGroups(parent: number[], lattice: Lattice): Group[] {
  const groups = new Map<number, Group>();
  for (let j = 0; j < lattice.rows; j++) {
    for (let i = 0; i < lattice.columns; i++)
      expandGroup(groups, rootOf(parent, j * lattice.columns + i), i, j);
  }
  return [...groups.values()];
}
function visibleSide(from: number, to: number, edge: (i: number) => number): boolean {
  let sum = 0;
  for (let i = from; i <= to; i++) {
    if (edge(i) < SEPARATOR_COVERAGE) return false;
    sum += edge(i) / (to - from + 1);
  }
  return sum >= BORDER_COVERAGE;
}
function closedGroup(group: Group, lattice: Lattice): boolean {
  const { i0, i1, j0, j1 } = group;
  return [
    visibleSide(i0, i1, (i) => lattice.top(i, j0)),
    visibleSide(i0, i1, (i) => lattice.top(i, j1 + 1)),
    visibleSide(j0, j1, (j) => lattice.left(i0, j)),
    visibleSide(j0, j1, (j) => lattice.left(i1 + 1, j)),
  ].every(Boolean);
}
function rectangularGroup(group: Group): boolean {
  const w = group.i1 - group.i0 + 1;
  const h = group.j1 - group.j0 + 1;
  return group.count === w * h && w <= 10 && h <= 10;
}
function groupCell(group: Group, lattice: Lattice): GridCell | undefined {
  if (!rectangularGroup(group)) return undefined;
  if (!closedGroup(group, lattice)) return undefined;
  const x = lattice.lineX(group.i0);
  const y = lattice.lineY(group.j0);
  return {
    x,
    y,
    width: lattice.lineX(group.i1 + 1) - x + 1,
    height: lattice.lineY(group.j1 + 1) - y + 1,
    slotsWide: group.i1 - group.i0 + 1,
    slotsHigh: group.j1 - group.j0 + 1,
  };
}
function insideImage(cell: GridCell, width: number, height: number): boolean {
  if (cell.x < 0 || cell.y < 0) return false;
  return cell.x + cell.width <= width && cell.y + cell.height <= height;
}
function latticeCells(lattice: Lattice, width: number, height: number): GridCell[] {
  const cells: GridCell[] = [];
  for (const group of connectedGroups(lattice)) {
    const cell = groupCell(group, lattice);
    if (cell && insideImage(cell, width, height)) cells.push(cell);
  }
  return cells;
}
function cellsOnLattice(
  vertical: Uint8Array,
  horizontal: Uint8Array,
  width: number,
  height: number,
  pitch: number,
  columnPhase: Phase,
  rowPhase: Phase
): GridCell[] {
  const lattice = createLattice(vertical, horizontal, width, height, pitch, columnPhase, rowPhase);
  return lattice ? latticeCells(lattice, width, height) : [];
}
interface Candidate {
  cell: GridCell;
  support: number;
}
function overlaps(a: GridCell, b: GridCell, pitch: number): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > pitch / 2 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > pitch / 2
  );
}
function keepCandidates(candidates: Candidate[], pitch: number): GridCell[] {
  candidates.sort(
    (a, b) =>
      b.support - a.support ||
      a.cell.slotsWide * a.cell.slotsHigh - b.cell.slotsWide * b.cell.slotsHigh
  );
  const kept: GridCell[] = [];
  for (const { cell } of candidates) {
    if (!kept.some((other) => overlaps(cell, other, pitch))) kept.push(cell);
  }
  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}
function atLeast(segments: Segment[], length: number): Segment[] {
  return segments.filter((s) => s.to - s.from >= length);
}
function gridCandidates(
  verticalRuns: Segment[],
  horizontalRuns: Segment[],
  width: number,
  height: number,
  pitch: number
): Candidate[] {
  const longRun = Math.floor(pitch * 0.7);
  const columns = findPhases(atLeast(verticalRuns, longRun), pitch);
  const rows = findPhases(atLeast(horizontalRuns, longRun), pitch);
  const shortRun = Math.max(MIN_SHORT_RUN, Math.floor(pitch * 0.2));
  const vertical = new Uint8Array(width * height);
  const horizontal = new Uint8Array(width * height);
  paintSegments(atLeast(verticalRuns, shortRun), width, true, vertical);
  paintSegments(atLeast(horizontalRuns, shortRun), width, false, horizontal);
  const candidates: Candidate[] = [];
  for (const column of columns) {
    for (const row of rows)
      candidates.push(
        ...cellsOnLattice(vertical, horizontal, width, height, pitch, column, row).map((cell) => ({
          cell,
          support: Math.min(column.weight, row.weight),
        }))
      );
  }
  return candidates;
}
/** Finds items and empty slots; no visible grid produces an empty cell list. */
export function detectGrid(image: RgbImage): GridDetection {
  assertImage(image);
  const { width, height } = image;
  const stats = pixelStats(image);
  const verticalRuns = collectRuns(
    ridgeMask(stats, width, height, true),
    width,
    height,
    true,
    MIN_SHORT_RUN
  );
  const horizontalRuns = collectRuns(
    ridgeMask(stats, width, height, false),
    width,
    height,
    false,
    MIN_SHORT_RUN
  );
  const pitch = measurePitch(
    atLeast(verticalRuns, MIN_PITCH),
    atLeast(horizontalRuns, MIN_PITCH),
    width,
    height
  );
  if (!pitch) return { pitch: 0, cells: [] };
  return {
    pitch,
    cells: keepCandidates(
      gridCandidates(verticalRuns, horizontalRuns, width, height, pitch),
      pitch
    ),
  };
}
