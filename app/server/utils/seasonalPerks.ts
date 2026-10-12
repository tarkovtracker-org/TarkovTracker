import { createError } from 'h3';
import { isPlainObject } from '@/server/utils/deepMerge';
import { scopedOverlay } from '@/server/utils/overlayProjectors';
import { validSeasonalPerkPatch } from '@/server/utils/overlayValidation';
import type { OverlayData } from '@/server/utils/overlayTypes';
import type { SeasonalPerk } from '@/types/tarkov';
const invalidCatalog = () => new Error('Invalid upstream seasonal perk catalog');
const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const validPoints = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value));
const validExclusions = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(nonEmptyString) && new Set(value).size === value.length;
const localizedText = (perk: Record<string, unknown>, field: 'name' | 'description'): boolean =>
  nonEmptyString(perk[field]) && perk[field] !== `${perk.id} ${field}`;
function adaptPerk(raw: unknown, type: string): SeasonalPerk {
  if (!isPlainObject(raw)) throw invalidCatalog();
  const valid = [
    nonEmptyString(raw.id),
    localizedText(raw, 'name'),
    localizedText(raw, 'description'),
    validPoints(raw.points),
    validExclusions(raw.exclusiveToPerks),
  ].every(Boolean);
  if (!valid) throw invalidCatalog();
  return {
    id: raw.id as string,
    type,
    name: raw.name as string,
    description: raw.description as string,
    points: raw.points as number | null,
    mutuallyExclusiveSeasonalPerkIds: [...(raw.exclusiveToPerks as string[])],
    effects: [],
  };
}
function adaptGroup(type: string, group: unknown): SeasonalPerk[] {
  if (!nonEmptyString(type) || !Array.isArray(group)) throw invalidCatalog();
  return group.map((perk) => adaptPerk(perk, type));
}
function validateIdentities(perks: SeasonalPerk[]): void {
  const ids = new Set(perks.map((perk) => perk.id));
  if (!perks.length || ids.size !== perks.length) throw invalidCatalog();
  const exclusionsResolve = perks.every((perk) =>
    perk.mutuallyExclusiveSeasonalPerkIds?.every((id) => ids.has(id))
  );
  if (!exclusionsResolve) throw invalidCatalog();
}
/** Adapt the localized season envelope without filtering or deduplicating source rows. */
export function adaptSeasonalPerks(payload: unknown): SeasonalPerk[] {
  if (!isPlainObject(payload) || !isPlainObject(payload.perks)) throw invalidCatalog();
  const perks = Object.entries(payload.perks).flatMap(([type, group]) => adaptGroup(type, group));
  validateIdentities(perks);
  return perks;
}
function validatePatches(
  patches: Record<string, Record<string, unknown>>,
  perks: SeasonalPerk[]
): void {
  const ids = new Set(perks.map((perk) => perk.id));
  const valid = Object.entries(patches).every(([id, patch]) =>
    [ids.has(id), patch.id === undefined || patch.id === id, validSeasonalPerkPatch(patch)].every(
      Boolean
    )
  );
  if (!valid)
    throw createError({ statusCode: 503, statusMessage: 'Seasonal perk corrections incompatible' });
}
/** Upstream owns metadata and membership; the validated overlay only augments effects. */
export function projectSeasonalPerks(
  overlay: OverlayData,
  mode: string,
  perks: SeasonalPerk[]
): SeasonalPerk[] {
  if (mode !== 'pvp-season') return [];
  const patches = scopedOverlay(overlay, 'seasonalPerks', mode);
  validatePatches(patches, perks);
  return perks.map((perk) => ({
    ...perk,
    effects: Object.hasOwn(patches, perk.id)
      ? (patches[perk.id]!.effects as SeasonalPerk['effects'])
      : [],
  }));
}
