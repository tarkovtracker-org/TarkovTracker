import { GAME_MODES, type GameMode } from '@/utils/constants';
export const buildTarkovDevProfileUrl = (
  tarkovUid: number | null,
  mode: GameMode | null | undefined
) => {
  if (tarkovUid === null || !Number.isFinite(tarkovUid) || tarkovUid <= 0) {
    return undefined;
  }
  const modeSlug = mode === GAME_MODES.PVE ? 'pve' : 'regular';
  return `https://tarkov.dev/players/${modeSlug}/${tarkovUid}`;
};
