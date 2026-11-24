export type OverlayRecords = Record<string, Record<string, unknown>>;
export interface OverlaySections {
  tasks?: OverlayRecords;
  tasksAdd?: OverlayRecords;
  items?: OverlayRecords;
  itemsAdd?: OverlayRecords;
  traders?: OverlayRecords;
  hideout?: OverlayRecords;
  craftsAdd?: OverlayRecords;
  prestige?: OverlayRecords;
  storyChapters?: OverlayRecords;
  editions?: OverlayRecords;
  seasonalPerks?: OverlayRecords;
  maps?: OverlayRecords;
}
export interface OverlayLocaleData {
  tasks?: OverlayRecords;
  items?: OverlayRecords;
  traders?: OverlayRecords;
  maps?: OverlayRecords;
  prestige?: OverlayRecords;
  storyChapters?: OverlayRecords;
}
export interface OverlayData extends OverlaySections {
  /** Mode-scoped counter registry; validated and applied by `overlayCounters.ts`. */
  progressionCounters?: unknown;
  /** Mode-scoped task-list groups; validated and applied by `overlayTaskGroups.ts`. */
  traderTaskGroups?: unknown;
  /** Only the inactive v1 ledger is supported until all identity consumers are ready. */
  taskIdAliases?: unknown;
  /** Generated extract rules; validated and served by `extract-requirements.get.ts`. */
  extractRequirements?: unknown;
  /** Curated extract cues; validated and served with `extractRequirements`. */
  extractCues?: unknown;
  modes?: Record<string, OverlaySections>;
  locales?: Record<string, OverlayLocaleData>;
  $meta?: { version: string; generated: string; sha256: string };
}
