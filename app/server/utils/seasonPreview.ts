import { isPlainObject } from '@/server/utils/deepMerge';
import { UNTAR_CONTROL_POSTER_URL, UNTAR_CONTROL_PREVIEW_ID } from '@/types/seasonPreview';
import type { SeasonPreview } from '@/types/seasonPreview';
const translationPaths = ['$.data.name', '$.data.perks.*.*.name', '$.data.perks.*.*.description'];
const validPaths = (value: unknown) =>
  Array.isArray(value) &&
  value.length === translationPaths.length &&
  translationPaths.every((path, index) => value[index] === path);
const hasEnglish = (dictionary: Record<string, unknown>, key: string): boolean => {
  if (!Object.hasOwn(dictionary, key)) return false;
  const text = dictionary[key];
  return typeof text === 'string' && text.trim().length > 0;
};
function validPerk(
  perk: unknown,
  dictionary: Record<string, unknown>,
  pointsAreValid: (points: unknown) => boolean
): boolean {
  if (!isPlainObject(perk) || typeof perk.id !== 'string') return false;
  return [
    perk.id.startsWith(UNTAR_CONTROL_PREVIEW_ID + ':'),
    perk.name === perk.id + ' name',
    perk.description === perk.id + ' description',
    hasEnglish(dictionary, perk.id + ' name'),
    hasEnglish(dictionary, perk.id + ' description'),
    pointsAreValid(perk.points),
    Array.isArray(perk.exclusiveToPerks) && perk.exclusiveToPerks.length === 0,
    perk.imageLink === null,
  ].every(Boolean);
}
function validGroups(value: unknown, dictionary: Record<string, unknown>): boolean {
  if (!isPlainObject(value)) return false;
  const { common, personal } = value;
  if (!Array.isArray(common) || !Array.isArray(personal)) return false;
  const allIds = new Set([...common, ...personal].filter(isPlainObject).map((perk) => perk.id));
  return [
    common.length > 0,
    personal.some(
      (perk) => isPlainObject(perk) && typeof perk.points === 'number' && perk.points > 0
    ),
    personal.some(
      (perk) => isPlainObject(perk) && typeof perk.points === 'number' && perk.points < 0
    ),
    allIds.size === common.length + personal.length,
    common.every((perk) => validPerk(perk, dictionary, (points) => points === null)),
    personal.every((perk) =>
      validPerk(perk, dictionary, (points) => Number.isSafeInteger(points) && points !== 0)
    ),
  ].every(Boolean);
}
function validSeason(value: unknown, dictionary: Record<string, unknown>): boolean {
  if (!isPlainObject(value) || !isPlainObject(value.data)) return false;
  const { id, name, start, end, perks } = value.data;
  const nameKey = UNTAR_CONTROL_PREVIEW_ID + ' name';
  return [
    id === UNTAR_CONTROL_PREVIEW_ID,
    name === nameKey,
    hasEnglish(dictionary, nameKey),
    start === null,
    end === null,
    validPaths(value.translations),
    validGroups(perks, dictionary),
  ].every(Boolean);
}
export function parseSeasonPreview(value: unknown): SeasonPreview | null {
  if (!isPlainObject(value) || !isPlainObject(value.season_en)) return null;
  const english = value.season_en.data;
  const valid =
    value.provisional === true &&
    value.source === UNTAR_CONTROL_POSTER_URL &&
    isPlainObject(english) &&
    validSeason(value.season, english);
  return valid ? (value as unknown as SeasonPreview) : null;
}
