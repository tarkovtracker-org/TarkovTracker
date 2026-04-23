import { normalizePMCFaction, type PMCFaction } from '@/utils/constants';
import { logger } from '@/utils/logger';
const BOT_SKILLS = new Set(['BotReload', 'BotSound']);
export interface TarkovDevImportResult {
  tarkovUid: number;
  displayName: string;
  pmcFaction: PMCFaction;
  totalXP: number;
  prestigeLevel: number;
  skills: Record<string, number>;
  gameEditionGuess: number | null;
}
export type ParseResult = { ok: true; data: TarkovDevImportResult } | { ok: false; error: string };
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateTarkovDevProfile(data: unknown): data is {
  aid: number;
  info: {
    nickname: string;
    side: string;
    experience: number;
    memberCategory?: number;
    prestigeLevel?: number;
  };
  skills: {
    Common: Array<{ Id: string; Progress: number }>;
  };
} {
  if (!isRecord(data)) return false;
  if (typeof data.aid !== 'number' || !Number.isSafeInteger(data.aid) || data.aid <= 0)
    return false;
  if (!isRecord(data.info)) return false;
  const info = data.info;
  if (typeof info.nickname !== 'string' || info.nickname.trim().length === 0) return false;
  if (typeof info.side !== 'string') return false;
  if (typeof info.experience !== 'number') return false;
  if (!isRecord(data.skills)) return false;
  if (!Array.isArray(data.skills.Common)) return false;
  return true;
}
function mapMemberCategoryToEdition(memberCategory: unknown): number | null {
  if (typeof memberCategory !== 'number') return null;
  const normalizedMemberCategory = Math.trunc(memberCategory);
  const hasUnheard = (normalizedMemberCategory & 1024) === 1024;
  const hasEod = (normalizedMemberCategory & 2) === 2;
  if (hasUnheard && hasEod) return 6;
  if (hasUnheard) return 5;
  switch (normalizedMemberCategory) {
    case 0:
      return 1;
    case 4:
      return 2;
    case 8:
      return 3;
    case 2:
      return 4;
    default:
      logger.warn('[TarkovDevProfileParser] Unknown memberCategory', memberCategory);
      return null;
  }
}
export function parseTarkovDevProfile(data: unknown): ParseResult {
  if (!validateTarkovDevProfile(data)) {
    return { ok: false, error: 'Invalid tarkov.dev profile format' };
  }
  const skills: Record<string, number> = {};
  for (const entry of data.skills.Common) {
    if (!entry || typeof entry.Id !== 'string' || typeof entry.Progress !== 'number') continue;
    if (BOT_SKILLS.has(entry.Id)) continue;
    skills[entry.Id] = Math.min(51, Math.floor(entry.Progress / 100));
  }
  const prestigeRaw = typeof data.info.prestigeLevel === 'number' ? data.info.prestigeLevel : 0;
  const prestigeLevel = Math.max(0, Math.min(6, Math.floor(prestigeRaw)));
  return {
    ok: true,
    data: {
      tarkovUid: data.aid,
      displayName: typeof data.info.nickname === 'string' ? data.info.nickname : '',
      pmcFaction: normalizePMCFaction(data.info.side),
      totalXP: data.info.experience,
      prestigeLevel,
      skills,
      gameEditionGuess: mapMemberCategoryToEdition(data.info.memberCategory),
    },
  };
}
