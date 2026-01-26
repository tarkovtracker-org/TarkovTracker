import { useMetadataStore } from '@/stores/useMetadata';
import type { TaskObjective } from '@/types/tarkov';
const NON_LOCATION_OBJECTIVE_TYPES = new Set([
  'giveItem',
  'giveQuestItem',
  'traderLevel',
  'traderStanding',
  'playerLevel',
  'taskStatus',
  'skill',
  'experience',
  'buildWeapon',
]);
interface ObjectiveWithLocation extends TaskObjective {
  zones?: Array<{ map: { id: string }; outline: { x: number; z: number }[] }>;
  possibleLocations?: Array<{
    map: { id: string };
    positions?: { x: number; y?: number; z: number }[];
  }>;
}
/**
 * Checks if an objective has actionable map location data.
 * Used to determine if the "Jump To Map" button should be shown.
 *
 * Returns true when we have actual coordinate data to jump to:
 * - Zones with non-empty outline arrays
 * - PossibleLocations with non-empty positions arrays
 * - GPS fallback coordinates from metadata store
 *
 * @param objective - The basic objective from props
 * @param fullObjective - Optional full objective from metadata store with additional fields
 * @returns true if the objective has actionable coordinate data
 */
export function objectiveHasMapLocation(
  objective: TaskObjective,
  fullObjective?: TaskObjective
): boolean {
  const target = (fullObjective ?? objective) as ObjectiveWithLocation;
  if (target.type && NON_LOCATION_OBJECTIVE_TYPES.has(target.type)) {
    return false;
  }
  // Check for zones with actual outline coordinates
  const hasZonesWithOutlines =
    Array.isArray(target.zones) &&
    target.zones.some((zone) => Array.isArray(zone.outline) && zone.outline.length > 0);
  // Check for possibleLocations with actual position coordinates
  const hasLocationsWithPositions =
    Array.isArray(target.possibleLocations) &&
    target.possibleLocations.some(
      (loc) => Array.isArray(loc.positions) && loc.positions.length > 0
    );
  if (hasZonesWithOutlines || hasLocationsWithPositions) {
    return true;
  }
  // Check GPS fallback from metadata store
  const taskId = target.taskId ?? objective.taskId;
  if (!taskId) return false;
  const metadataStore = useMetadataStore();
  const objectiveMaps = metadataStore.objectiveMaps?.[taskId] ?? [];
  const objectiveGps = metadataStore.objectiveGPS?.[taskId] ?? [];
  const isOnAnyMap = objectiveMaps.some((mapInfo) => mapInfo.objectiveID === objective.id);
  const gpsInfo = objectiveGps.find((gps) => gps.objectiveID === objective.id);
  const hasGpsCoordinates = !!gpsInfo && (gpsInfo.x !== undefined || gpsInfo.y !== undefined);
  return isOnAnyMap && hasGpsCoordinates;
}
