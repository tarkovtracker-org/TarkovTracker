import { logger } from '@/utils/logger';
const STORAGE_KEY = 'tarkovtracker:tarkov-dev-import-cooldowns';
const MAX_ENTRY_AGE_MS = 24 * 60 * 60 * 1000;
type CooldownMap = Record<string, number>;
function buildEntryKey(tarkovUid: number, mode: string): string {
  return `${mode}:${tarkovUid}`;
}
function readCooldownMap(): CooldownMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const entries: CooldownMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        entries[key] = value;
      }
    }
    return entries;
  } catch (error) {
    logger.debug('[TarkovDevImportCooldown] Failed to read cooldown storage:', error);
    return {};
  }
}
function writeCooldownMap(entries: CooldownMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    logger.debug('[TarkovDevImportCooldown] Failed to write cooldown storage:', error);
  }
}
export function getImportCooldownRemainingMs(
  tarkovUid: number,
  mode: string,
  cooldownMs: number,
  now = Date.now()
): number {
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) return 0;
  const importedAt = readCooldownMap()[buildEntryKey(tarkovUid, mode)];
  if (typeof importedAt !== 'number' || importedAt > now) return 0;
  return Math.max(0, importedAt + cooldownMs - now);
}
export function recordImportCompletion(tarkovUid: number, mode: string, now = Date.now()): void {
  const retained: CooldownMap = {};
  for (const [key, importedAt] of Object.entries(readCooldownMap())) {
    if (now - importedAt <= MAX_ENTRY_AGE_MS) {
      retained[key] = importedAt;
    }
  }
  retained[buildEntryKey(tarkovUid, mode)] = now;
  writeCooldownMap(retained);
}
