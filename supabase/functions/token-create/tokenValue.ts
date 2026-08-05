export const TOKEN_GAME_MODES = ['pvp', 'pve', 'seasonal'] as const;
export type TokenGameMode = (typeof TOKEN_GAME_MODES)[number];
const TOKEN_VALUE_PATTERN = /^(PVP|PVE|SZN)_[0-9a-f]{18}$/;
export const isTokenGameMode = (value: unknown): value is TokenGameMode =>
  typeof value === 'string' && (TOKEN_GAME_MODES as readonly string[]).includes(value);
const TOKEN_PREFIXES: Record<TokenGameMode, string> = {
  pvp: 'PVP_',
  pve: 'PVE_',
  seasonal: 'SZN_',
};
export const tokenPrefix = (gameMode: TokenGameMode): string => TOKEN_PREFIXES[gameMode];
export const generateToken = (gameMode: TokenGameMode): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${tokenPrefix(gameMode)}${hex}`;
};
export const isTokenValueForGameMode = (tokenValue: string, gameMode: TokenGameMode): boolean =>
  TOKEN_VALUE_PATTERN.test(tokenValue) && tokenValue.startsWith(tokenPrefix(gameMode));
