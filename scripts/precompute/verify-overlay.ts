import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
// 12h schedule plus a 2h operational allowance; browser retention is separate.
export const OVERLAY_PROPAGATION_WINDOW_MS = 14 * 60 * 60 * 1000;
type Identity = { version?: string; sha256?: string };
export type OverlayManifest = {
  completedAt: number;
  entries: Array<{ lang: string; gameMode: string; overlay: Identity }>;
};
export type ServedOverlay = {
  lang: string;
  gameMode: string;
  overlay: Identity;
  source?: string | null;
};
export type DriftRow = {
  lang: string;
  gameMode: string;
  published?: string;
  precomputed?: string;
  served?: string;
  source?: string | null;
  status: 'current' | 'propagating' | 'drift' | 'unverified';
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const nonempty = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;
const identity = (value: unknown): Identity => {
  const meta = record(value);
  return { version: nonempty(meta.version), sha256: nonempty(meta.sha256) };
};
const manifestEntries = (manifest: unknown): Array<Record<string, unknown>> => {
  const entries = record(manifest).entries;
  return Array.isArray(entries) ? entries.map(record) : [];
};
const verifiableSource = (source: string | null | undefined, age: number): boolean =>
  Number.isFinite(age) && age >= 0 && source === 'PRECOMPUTE';
const manifestIdentity = (
  entries: Array<Record<string, unknown>>,
  lang: string,
  gameMode: string
): Identity => {
  const matches = entries.filter((entry) => entry.lang === lang && entry.gameMode === gameMode);
  return identity(matches.length === 1 ? matches[0]!.overlay : undefined);
};
const completeProvenance = (identities: Identity[], source: string | null | undefined, age: number): boolean =>
  verifiableSource(source, age) && identities.every(meta => meta.version && meta.sha256);
const rowStatus = (
  published: Identity,
  precomputed: Identity,
  served: Identity,
  source: string | null | undefined,
  age: number
): DriftRow['status'] => {
  if (!completeProvenance([published, precomputed, served], source, age)) return 'unverified';
  if (
    [precomputed, served].every(
      (meta) => meta.sha256 === published.sha256 && meta.version === published.version
    )
  )
    return 'current';
  return age <= OVERLAY_PROPAGATION_WINDOW_MS ? 'propagating' : 'drift';
};
export function compareOverlayFleet(
  published: unknown,
  manifest: unknown,
  served: ServedOverlay[],
  now = Date.now()
): DriftRow[] {
  const publishedIdentity = identity(published);
  const generated = nonempty(record(published).generated);
  const age = now - Date.parse(generated ?? '');
  const entries = manifestEntries(manifest);
  return API_SUPPORTED_LANGUAGES.flatMap((lang) =>
    VALID_GAME_MODES.map((gameMode) => {
      const precomputed = manifestIdentity(entries, lang, gameMode);
      const response: ServedOverlay = served.find(
        (entry) => entry.lang === lang && entry.gameMode === gameMode
      ) ?? { lang, gameMode, overlay: {} };
      const current = identity(response.overlay);
      return {
        lang,
        gameMode,
        published: publishedIdentity.sha256,
        precomputed: precomputed.sha256,
        served: current.sha256,
        source: response.source,
        status: rowStatus(publishedIdentity, precomputed, current, response.source, age),
      };
    })
  );
}
