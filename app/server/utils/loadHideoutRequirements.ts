import type {
  HideoutLevel,
  HideoutStation,
  ItemRequirement,
  TarkovHideoutQueryResult,
  TarkovItemsQueryResult,
} from '@/types/tarkov';
import { fetchPublicPvpCatalogs } from '~/server/utils/publicPvpCatalog';
function material(req: ItemRequirement, names: Map<string, string | undefined>) {
  const name = names.get(req.item.id) ?? req.item.name;
  if (!name) throw new Error(`Missing hideout material name for ${req.item.id}`);
  const attribute = req.attributes?.find(
    (attr) => attr.type === 'foundInRaid' || attr.name === 'foundInRaid'
  );
  return {
    id: req.id,
    name,
    count: req.count ?? req.quantity,
    fir: attribute ? attribute.value === 'true' : req.foundInRaid,
  };
}
const stationAnchor = (station: HideoutStation) =>
  `requirements-${station.normalizedName || station.id}`;
function projectLevel(
  stationId: string,
  level: HideoutLevel,
  names: Map<string, string | undefined>,
  anchors: Map<string, string>
) {
  return {
    level: level.level,
    anchor: anchors.get(`${stationId}:${level.level}`)!,
    items: (level.itemRequirements ?? []).map((req) => material(req, names)),
    stations: (level.stationLevelRequirements ?? []).map((req) => ({
      id: req.id,
      name: req.station.name,
      level: req.level,
      anchor: anchors.get(`${req.station.id}:${req.level}`),
    })),
    skills: (level.skillRequirements ?? []).map((req) => ({
      id: req.id,
      name: req.name || req.skill?.name,
      level: req.level,
    })),
    traders: (level.traderRequirements ?? []).map((req) => ({
      id: req.id,
      name: req.trader.name,
      type: req.requirementType,
      comparison: req.compareMethod ?? '>=',
      value: req.value,
    })),
  };
}
export async function loadHideoutRequirements() {
  const [hideout, items] = await fetchPublicPvpCatalogs<
    [TarkovHideoutQueryResult, TarkovItemsQueryResult]
  >(['hideout', 'items-lite']);
  const names = new Map(items.items.map((item) => [item.id, item.name]));
  const stations = hideout.hideoutStations.filter((station) => station.levels?.length);
  if (!stations.length) throw new Error('Empty public hideout requirements');
  const anchors = new Map(
    stations.flatMap((station) =>
      station.levels.map(
        (level) =>
          [
            `${station.id}:${level.level}`,
            `${stationAnchor(station)}-level-${level.level}`,
          ] as const
      )
    )
  );
  return stations
    .map((station) => ({
      name: station.name,
      anchor: stationAnchor(station),
      levels: station.levels
        .map((level) => projectLevel(station.id, level, names, anchors))
        .sort((a, b) => a.level - b.level),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
