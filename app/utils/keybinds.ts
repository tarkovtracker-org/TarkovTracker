const MODIFIER_TOKENS = ['ctrl', 'control', 'alt', 'shift', 'meta'] as const;
type ModifierToken = (typeof MODIFIER_TOKENS)[number];
const isModifierToken = (token: string): token is ModifierToken =>
  (MODIFIER_TOKENS as readonly string[]).includes(token);
const normalizeKeyToken = (key: string): string => (key === ' ' ? 'space' : key.toLowerCase());
export const serializeKeybindEvent = (event: KeyboardEvent): string => {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  if (event.metaKey) parts.push('meta');
  parts.push(normalizeKeyToken(event.key));
  return parts.join('+');
};
export const isValidKeybind = (shortcut: unknown): shortcut is string => {
  if (typeof shortcut !== 'string') return false;
  const parts = shortcut.toLowerCase().split('+');
  if (parts.some((part) => part.trim() === '')) return false;
  const keys = parts.filter((part) => !isModifierToken(part));
  return keys.length === 1 && keys[0]!.length > 0;
};
export const sanitizeKeybind = (shortcut: unknown, fallback: string): string =>
  isValidKeybind(shortcut) ? shortcut.toLowerCase() : fallback;
export const matchesKeybind = (event: KeyboardEvent, shortcut: string): boolean => {
  if (!isValidKeybind(shortcut)) return false;
  const parts = shortcut.toLowerCase().split('+');
  const expectCtrl = parts.includes('ctrl') || parts.includes('control');
  const expectAlt = parts.includes('alt');
  const expectShift = parts.includes('shift');
  const expectMeta = parts.includes('meta');
  const key = parts.find((part) => !isModifierToken(part));
  if (!key) return false;
  return (
    event.ctrlKey === expectCtrl &&
    event.altKey === expectAlt &&
    event.shiftKey === expectShift &&
    event.metaKey === expectMeta &&
    normalizeKeyToken(event.key) === key
  );
};
