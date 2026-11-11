import type { MapMarkerGlyphKind } from '@/features/maps/utils/markerGlyphs';
import type { MapMarkerColors } from '@/utils/theme-colors';
type TranslateFn = (key: string) => string;
type Toggle = { value: boolean };
/** How a layer row draws its swatch: an extract/transit glyph chip or a marker dot. */
export type MapLayerSwatch = MapMarkerGlyphKind | 'objective' | 'spawn';
export interface MapLayerItem {
  key: string;
  label: string;
  hint?: string;
  color: string;
  swatch: MapLayerSwatch;
  secondaryGlyph?: { kind: MapMarkerGlyphKind; color: string };
  visible: Toggle;
}
export interface MapLayerGroup {
  key: string;
  label: string;
  items: MapLayerItem[];
}
export interface MapLayerGroupsInput {
  t: TranslateFn;
  colors: MapMarkerColors;
  objectives: { self: Toggle; pinned: Toggle; team: Toggle };
  extracts: { pmc: Toggle; scav: Toggle; shared: Toggle; coop: Toggle };
  transit: Toggle;
  spawns: Toggle;
  /** Whether the selected map has each marker type (task rows are always listed). */
  available: {
    pmc: boolean;
    scav: boolean;
    shared: boolean;
    coop: boolean;
    transit: boolean;
    spawns: boolean;
  };
}
type Candidate = MapLayerItem & { available: boolean };
const keepAvailable = (items: Candidate[]): MapLayerItem[] =>
  items.filter((item) => item.available).map(({ available: _available, ...item }) => item);
function objectiveItems({ t, colors, objectives }: MapLayerGroupsInput): Candidate[] {
  return [
    {
      key: 'self',
      label: t('maps.legend.regular'),
      color: colors.SELF_OBJECTIVE,
      swatch: 'objective',
      visible: objectives.self,
      available: true,
    },
    {
      key: 'pinned',
      label: t('maps.legend.pinned'),
      color: colors.PINNED_OBJECTIVE,
      swatch: 'objective',
      visible: objectives.pinned,
      available: true,
    },
    {
      key: 'team',
      label: t('common.team'),
      color: colors.TEAM_OBJECTIVE,
      swatch: 'objective',
      visible: objectives.team,
      available: true,
    },
  ];
}
function extractItems({ t, colors, extracts, available }: MapLayerGroupsInput): Candidate[] {
  return [
    {
      key: 'pmc',
      label: t('maps.factions.pmc'),
      color: colors.PMC_EXTRACT,
      swatch: 'pmc',
      visible: extracts.pmc,
      available: available.pmc,
    },
    {
      key: 'scav',
      label: t('common.scav'),
      color: colors.SCAV_EXTRACT,
      swatch: 'scav',
      visible: extracts.scav,
      available: available.scav,
    },
    {
      key: 'shared',
      label: t('maps.layers.shared_or_unknown'),
      hint: t('maps.layers.shared_or_unknown_hint'),
      color: colors.SHARED_EXTRACT,
      swatch: 'shared',
      secondaryGlyph: { kind: 'extract', color: colors.DEFAULT_EXTRACT },
      visible: extracts.shared,
      available: available.shared,
    },
    {
      key: 'coop',
      label: t('maps.layers.coop'),
      hint: t('maps.layers.coop_hint'),
      color: colors.COOP_EXTRACT,
      swatch: 'coop',
      visible: extracts.coop,
      available: available.coop,
    },
  ];
}
function locationItems({
  t,
  colors,
  transit,
  spawns,
  available,
}: MapLayerGroupsInput): Candidate[] {
  return [
    {
      key: 'transit',
      label: t('maps.layers.transit'),
      color: colors.TRANSIT,
      swatch: 'transit',
      visible: transit,
      available: available.transit,
    },
    {
      key: 'spawns',
      label: t('maps.layers.pmc_spawns'),
      color: colors.PMC_SPAWN,
      swatch: 'spawn',
      visible: spawns,
      available: available.spawns,
    },
  ];
}
/**
 * One list for both the legend and the layer toggles: every row shows the marker exactly as the
 * map draws it and toggles exactly that marker type. Layers the current map lacks are omitted.
 */
export function buildMapLayerGroups(input: MapLayerGroupsInput): MapLayerGroup[] {
  const groups: MapLayerGroup[] = [
    { key: 'tasks', label: input.t('common.tasks'), items: keepAvailable(objectiveItems(input)) },
    {
      key: 'extracts',
      label: input.t('maps.layers.groups.extracts'),
      items: keepAvailable(extractItems(input)),
    },
    {
      key: 'locations',
      label: input.t('maps.layers.groups.locations'),
      items: keepAvailable(locationItems(input)),
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}
/** Number of rows currently hidden, shown on the collapsed Layers button. */
export function countHiddenLayers(groups: MapLayerGroup[]): number {
  return groups.reduce(
    (total, group) => total + group.items.filter((item) => !item.visible.value).length,
    0
  );
}
