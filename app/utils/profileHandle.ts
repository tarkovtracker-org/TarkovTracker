import type { GameMode } from '@/utils/constants';
const HANDLE_FORMAT = /^(?=[a-z0-9_]*[a-z])[a-z0-9_]{3,24}$(?![\s\S])/;
export const isProfileHandle = (value: unknown): value is string =>
  typeof value === 'string' && HANDLE_FORMAT.test(value);
export const profileHandlePath = (handle: string, mode?: GameMode): string =>
  mode ? `/@${handle}/${mode}` : `/@${handle}`;
