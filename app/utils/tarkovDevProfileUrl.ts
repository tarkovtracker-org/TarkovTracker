import { API_GAME_MODES, type GameMode } from '@/utils/constants';
export const buildTarkovDevProfileUrl = (
  tarkovUid: number | null,
  mode: GameMode | null | undefined
): string | undefined => {
  if (tarkovUid === null || !Number.isFinite(tarkovUid) || tarkovUid <= 0 || !mode) {
    return undefined;
  }
  return `https://tarkov.dev/players/${API_GAME_MODES[mode]}/${tarkovUid}`;
};
export const buildTarkovDevPlayersUrl = (mode?: GameMode | null): string => {
  if (!mode) return 'https://tarkov.dev/players';
  return `https://tarkov.dev/players?gameMode=${API_GAME_MODES[mode]}`;
};
