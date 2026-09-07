import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
// 12h schedule plus a 2h operational allowance. This measures served API/KV
// convergence; browser IndexedDB retention has a separate 24h maximum TTL.
const OVERLAY_PROPAGATION_WINDOW_MS = 14 * 60 * 60 * 1000;
type Identity = { version?: string; sha256?: string };
export type OverlayManifest = { completedAt: number; entries: Array<{ lang: string; gameMode: string; overlay: Identity }> };
export type DriftRow = { lang: string; gameMode: string; published?: string; precomputed?: string; served?: string; status: 'current' | 'propagating' | 'drift' | 'unverified' };
const driftStatus = (published: string | undefined, precomputed: string | undefined, served: string | undefined, withinWindow: boolean): DriftRow['status'] => {
  if (![published, precomputed, served].every(Boolean)) return 'unverified';
  if ([precomputed, served].every(sha => sha === published)) return 'current';
  return withinWindow ? 'propagating' : 'drift';
};
export function compareOverlayFleet(published: Identity & { generated?: string }, manifest: OverlayManifest | null, served: Array<{ lang: string; gameMode: string; overlay: Identity }>, now = Date.now()): DriftRow[] {
  const age = now - Date.parse(published.generated ?? '');
  const withinWindow = Number.isFinite(age) && age >= 0 && age <= OVERLAY_PROPAGATION_WINDOW_MS;
  return API_SUPPORTED_LANGUAGES.flatMap(lang => VALID_GAME_MODES.map(gameMode => {
    const precomputed = manifest?.entries?.find(entry => entry.lang === lang && entry.gameMode === gameMode)?.overlay?.sha256;
    const current = served.find(entry => entry.lang === lang && entry.gameMode === gameMode)?.overlay.sha256;
    return { lang, gameMode, published: published.sha256, precomputed, served: current, status: driftStatus(published.sha256, precomputed, current, withinWindow) };
  }));
}
