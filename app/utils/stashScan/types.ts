export const SCAN_LIMITS = {
  fileBytes: 32 * 1024 * 1024,
  pixels: 16_777_216,
  axis: 16_384,
  cells: 512,
  shardBytes: 24 * 1024 * 1024,
  decodedShardBytes: 48 * 1024 * 1024,
  quantity: 1_000_000,
} as const;
export interface ScanRect {
  x: number;
  y: number;
  width: number;
  height: number;
  slotsWide: number;
  slotsHigh: number;
}
export interface ScanItem {
  id: string;
  name: string;
  shortName: string;
  width: number;
  height: number;
  maxStack: number;
}
export interface ScanShard {
  file: string;
  sha256: string;
  bytes: number;
  decodedBytes: number;
}
export interface ScanCatalog {
  version: 1;
  featureVersion: number;
  builtAt: string;
  items: ScanItem[];
  missing: string[];
  shards: Record<string, ScanShard>;
}
export interface ScanCandidate {
  itemId: string;
  score: number;
}
export interface ScanCell extends ScanRect {
  key: number;
  empty: boolean;
  candidates: ScanCandidate[];
  margin: number;
}
export interface ScanResult {
  width: number;
  height: number;
  sourceHash: string;
  cells: ScanCell[];
  catalog: ScanCatalog;
  preview: Blob;
}
export type RaidStatus = 'unknown' | 'fir' | 'non_fir';
export interface ReviewedCell {
  cell: ScanCell;
  itemId: string;
  quantity: number | null;
  raidStatus: RaidStatus;
  reviewed: boolean;
  excluded: boolean;
}
export type ScanCommand =
  { op: 'scan'; file: File; rects?: ScanRect[] } | { op: 'rects'; rects: ScanRect[] };
export type ScanReply =
  | { type: 'progress'; stage: 'decode' | 'catalog' | 'match'; done: number; total: number }
  | { type: 'result'; result: ScanResult }
  | { type: 'error'; error: string };
export const scanError = (code: string): Error => new Error(`stash_import.errors.${code}`);
