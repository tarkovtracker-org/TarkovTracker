// Adapted from Wilsman/cultist-circle, MIT, pinned at
// d6228d1e722e120935348214ff4b04e266a43864. See /licenses/cultist-circle.txt.
import {
  assertCellFeatures,
  cellFeatures,
  dot,
  featureShape,
  quantise,
  rotateClockwise,
  shiftedTextScore,
  TEMPLATE_SLOT_PX,
  textHeight,
  textWidthFor,
  type CellFeatures,
  type QuantisedVector,
} from '@/utils/stashScan/core/features';
import {
  assertFinite,
  assertImage,
  assertSlots,
  assertVector,
} from '@/utils/stashScan/core/validation';
import type { RgbImage } from '@/utils/stashScan/core/grid';
export interface CatalogIcon {
  id: string;
  shortName: string;
  /** Inventory slots, not image pixels. */
  width: number;
  height: number;
  /** Tarkov.dev gridImageLink at 63px per slot, short name included. */
  grid: RgbImage;
}
export interface TemplateFeatures {
  artCoarse: QuantisedVector;
  artFine: QuantisedVector;
  textWidth: number;
  text: QuantisedVector;
}
export interface IconTemplate {
  itemId: string;
  shortName: string;
  rotated: boolean;
  features: TemplateFeatures;
}
export interface IconIndex {
  /** Templates keyed by `${slotsWide}x${slotsHigh}`. */
  bySize: Map<string, IconTemplate[]>;
  size: number;
}
export interface CellMatch {
  itemId: string;
  shortName: string;
  rotated: boolean;
  /** Weighted correlation similarity; not a calibrated probability. */
  score: number;
  artScore: number;
  textScore: number;
}
export interface CellResult {
  empty: boolean;
  /** Best distinct items, descending similarity. */
  matches: CellMatch[];
  /** Similarity difference to the next distinct item, or best similarity alone. */
  margin: number;
}
const COARSE_KEEP = 25;
const ART_WEIGHT = 0.35;
const TEXT_WEIGHT = 0.65;
const EMPTY_TEXT_INK = 0.01;
const EMPTY_ART_CONTRAST = 12;
const sizeKey = (w: number, h: number) => `${w}x${h}`;
function templateFeatures(image: RgbImage, w: number, h: number): CellFeatures {
  return cellFeatures(image, 0, 0, image.width, image.height, w, h);
}
function expectedSize(slots: number): number {
  return slots * TEMPLATE_SLOT_PX + 1;
}
function realignRow(
  text: Float32Array,
  fromWidth: number,
  toWidth: number,
  y: number,
  out: Float32Array
): void {
  for (let x = 0; x < toWidth; x++) {
    const sx = fromWidth - toWidth + x;
    if (sx >= 0 && sx < fromWidth) out[y * toWidth + x]! = text[y * fromWidth + sx]!;
  }
}
function normaliseText(out: Float32Array): void {
  let norm = 0;
  for (const value of out) norm += value * value;
  if (norm <= 0) return;
  norm = Math.sqrt(norm);
  for (let i = 0; i < out.length; i++) out[i]! /= norm;
}
/** Right-aligns a text map into a different width (cropping on the left). */
function realignText(text: Float32Array, fromWidth: number, toWidth: number): Float32Array {
  const out = new Float32Array(toWidth * textHeight());
  for (let y = 0; y < textHeight(); y++) realignRow(text, fromWidth, toWidth, y, out);
  normaliseText(out);
  return out;
}
export function createIconIndex(): IconIndex {
  return { bySize: new Map(), size: 0 };
}
function assertQuantised(vector: QuantisedVector, length: number): void {
  if (!(vector.values instanceof Int8Array))
    throw new TypeError('Expected quantised feature bytes');
  assertFinite(vector.scale);
  if (vector.scale < 0) throw new RangeError('Negative feature scale');
  assertVector(vector.values, length);
}
function assertTemplate(template: IconTemplate, w: number, h: number): void {
  const shape = featureShape(w, h);
  if (!template.itemId) throw new TypeError('Missing template item ID');
  if (template.features.textWidth !== shape.textWidth)
    throw new RangeError('Unexpected template text width');
  assertQuantised(template.features.artCoarse, shape.artCoarse);
  assertQuantised(template.features.artFine, shape.artFine);
  assertQuantised(template.features.text, shape.text);
}
export function addTemplate(
  index: IconIndex,
  slotsWide: number,
  slotsHigh: number,
  template: IconTemplate
): void {
  assertTemplate(template, slotsWide, slotsHigh);
  const key = sizeKey(slotsWide, slotsHigh);
  const list = index.bySize.get(key) ?? [];
  list.push(template);
  index.bySize.set(key, list);
  index.size++;
}
function uprightTemplate(item: CatalogIcon, upright: CellFeatures): IconTemplate {
  return {
    itemId: item.id,
    shortName: item.shortName,
    rotated: false,
    features: {
      artCoarse: quantise(upright.artCoarse),
      artFine: quantise(upright.artFine),
      textWidth: upright.textWidth,
      text: quantise(upright.text),
    },
  };
}
function rotatedTemplate(item: CatalogIcon, upright: CellFeatures): IconTemplate {
  const rotated = templateFeatures(rotateClockwise(item.grid), item.height, item.width);
  const textWidth = textWidthFor(item.height);
  return {
    itemId: item.id,
    shortName: item.shortName,
    rotated: true,
    features: {
      artCoarse: quantise(rotated.artCoarse),
      artFine: quantise(rotated.artFine),
      textWidth,
      text: quantise(realignText(upright.text, upright.textWidth, textWidth)),
    },
  };
}
/** Adds upright and non-square rotated templates; wrong grid dimensions return false. */
export function addCatalogIcon(index: IconIndex, item: CatalogIcon): boolean {
  assertSlots(item.width, item.height);
  assertImage(item.grid);
  if (
    item.grid.width !== expectedSize(item.width) ||
    item.grid.height !== expectedSize(item.height)
  )
    return false;
  const upright = templateFeatures(item.grid, item.width, item.height);
  addTemplate(index, item.width, item.height, uprightTemplate(item, upright));
  if (item.width !== item.height)
    addTemplate(index, item.height, item.width, rotatedTemplate(item, upright));
  return true;
}
function coarseShortlist(
  features: CellFeatures,
  templates: IconTemplate[],
  field: 'artCoarse' | 'text'
): IconTemplate[] {
  return templates
    .map((template) => ({ template, score: dot(features[field], template.features[field]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, COARSE_KEEP)
    .map(({ template }) => template);
}
function scoreTemplate(features: CellFeatures, template: IconTemplate): CellMatch {
  const artScore = dot(features.artFine, template.features.artFine);
  const textScore = shiftedTextScore(
    features.text,
    features.textWidth,
    template.features.text,
    template.features.textWidth,
    2,
    1
  );
  return {
    itemId: template.itemId,
    shortName: template.shortName,
    rotated: template.rotated,
    artScore,
    textScore,
    score: ART_WEIGHT * artScore + TEXT_WEIGHT * textScore,
  };
}
function distinctMatches(matches: CellMatch[]): CellMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (seen.has(match.itemId)) return false;
    seen.add(match.itemId);
    return true;
  });
}
function matchMargin(matches: CellMatch[]): number {
  const best = matches[0];
  if (!best) return 0;
  const runnerUp = matches[1];
  return runnerUp ? best.score - runnerUp.score : best.score;
}
function isEmpty(features: CellFeatures): boolean {
  return features.textInk < EMPTY_TEXT_INK && features.artContrast < EMPTY_ART_CONTRAST;
}
export function matchCell(features: CellFeatures, index: IconIndex): CellResult {
  assertCellFeatures(features);
  if (isEmpty(features)) return { empty: true, matches: [], margin: 0 };
  const templates = index.bySize.get(sizeKey(features.slotsWide, features.slotsHigh)) ?? [];
  const coarse = new Set([
    ...coarseShortlist(features, templates, 'artCoarse'),
    ...coarseShortlist(features, templates, 'text'),
  ]);
  const scored = [...coarse].map((template) => scoreTemplate(features, template));
  for (const match of scored) assertFinite(match.score);
  const matches = distinctMatches(scored.sort((a, b) => b.score - a.score));
  return { empty: false, matches: matches.slice(0, 5), margin: matchMargin(matches) };
}
