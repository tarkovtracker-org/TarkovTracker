import { API_GAME_MODES, GAME_MODES, type GameMode } from '@/utils/constants';
const PROFILE_JSON_ORIGIN = 'https://players.tarkov.dev';
const PROFILE_URL_ERROR =
  'Paste a Tarkov.dev player profile URL like https://tarkov.dev/players/regular/8560316.';
const PROFILE_ID_ERROR = 'Tarkov.dev profile URL must include a valid numeric profile id.';
export interface TarkovDevProfileSource {
  mode: GameMode | null;
  profileJsonUrl: string;
  tarkovUid: number;
}
export type TarkovDevProfileSourceResult =
  | { ok: true; data: TarkovDevProfileSource }
  | { ok: false; error: string };
function parseProfileId(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/\.json$/i, '');
  if (!/^\d+$/.test(normalized)) return null;
  const tarkovUid = Number(normalized);
  if (!Number.isSafeInteger(tarkovUid) || tarkovUid <= 0) return null;
  return tarkovUid;
}
function modeFromProfileSlug(value: string | undefined): GameMode | null {
  if (value === API_GAME_MODES[GAME_MODES.PVP]) return GAME_MODES.PVP;
  if (value === API_GAME_MODES[GAME_MODES.PVE]) return GAME_MODES.PVE;
  return null;
}
function buildProfileSource(tarkovUid: number, mode: GameMode | null): TarkovDevProfileSource {
  const profilePath = mode === GAME_MODES.PVE ? 'pve' : 'profile';
  return {
    mode,
    profileJsonUrl: `${PROFILE_JSON_ORIGIN}/${profilePath}/${tarkovUid}.json`,
    tarkovUid,
  };
}
export function resolveTarkovDevProfileSource(input: string): TarkovDevProfileSourceResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: PROFILE_URL_ERROR };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: PROFILE_URL_ERROR };
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if ((host === 'tarkov.dev' || host === 'www.tarkov.dev') && parts[0] === 'players') {
    const mode = modeFromProfileSlug(parts[1]);
    const tarkovUid = parseProfileId(parts[2]);
    if (!mode || tarkovUid === null) return { ok: false, error: PROFILE_ID_ERROR };
    return { ok: true, data: buildProfileSource(tarkovUid, mode) };
  }
  if (host === 'players.tarkov.dev' && parts[0] === 'profile') {
    const tarkovUid = parseProfileId(parts[1]);
    if (tarkovUid === null) return { ok: false, error: PROFILE_ID_ERROR };
    return { ok: true, data: buildProfileSource(tarkovUid, GAME_MODES.PVP) };
  }
  if (host === 'players.tarkov.dev' && parts[0] === 'pve') {
    const tarkovUid = parseProfileId(parts[1]);
    if (tarkovUid === null) return { ok: false, error: PROFILE_ID_ERROR };
    return { ok: true, data: buildProfileSource(tarkovUid, GAME_MODES.PVE) };
  }
  return { ok: false, error: PROFILE_URL_ERROR };
}
