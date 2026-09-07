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
  modes?: Record<string, OverlaySections>;
  locales?: Record<string, OverlayLocaleData>;
  $meta?: { version: string; generated: string; sha256: string };
}
