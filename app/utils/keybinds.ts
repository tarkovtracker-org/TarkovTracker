const MODIFIER_TOKENS = ['ctrl', 'control', 'alt', 'shift', 'meta'] as const;
type ModifierToken = (typeof MODIFIER_TOKENS)[number];
const isModifierToken = (token: string): token is ModifierToken =>
  (MODIFIER_TOKENS as readonly string[]).includes(token);
const normalizeKeyToken = (key: string): string => (key === ' ' ? 'space' : key.toLowerCase());
export const DEFAULT_KEYBINDS = {
  omnibar: 'ctrl+q',
  undo: 'ctrl+z',
} as const;
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
// Canonicalizes a shortcut so semantically identical bindings compare equal
// regardless of modifier order or alias (e.g. 'shift+ctrl+k' === 'ctrl+shift+k',
// 'control+z' === 'ctrl+z'). Returns null for invalid shortcuts.
const MODIFIER_ORDER: Record<string, number> = { ctrl: 0, alt: 1, shift: 2, meta: 3 };
export const normalizeKeybind = (shortcut: string): string | null => {
  if (!isValidKeybind(shortcut)) return null;
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.find((part) => !isModifierToken(part))!;
  const modifiers = parts
    .filter((part) => isModifierToken(part))
    .map((part) => (part === 'control' ? 'ctrl' : part));
  const uniqueModifiers = Array.from(new Set(modifiers)).sort(
    (a, b) => (MODIFIER_ORDER[a] ?? 99) - (MODIFIER_ORDER[b] ?? 99)
  );
  return [...uniqueModifiers, key].join('+');
};
// Reports whether two shortcuts resolve to the same key combination. Used to
// detect double-binds, where one keypress would trigger multiple actions.
export const keybindsConflict = (a: string, b: string): boolean => {
  const normalizedA = normalizeKeybind(a);
  const normalizedB = normalizeKeybind(b);
  return normalizedA !== null && normalizedA === normalizedB;
};
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
// Keys that browsers/operating systems commonly reserve when combined with a
// primary modifier (Ctrl on Windows/Linux, Cmd/Meta on macOS). The app ships
// Ctrl+Q as a default, so 'q' is intentionally excluded.
const SYSTEM_RESERVED_PRIMARY_KEYS = ['t', 'w', 'n', 'f', 'r', 'l', 's', 'p', 'd', 'tab'];
const SYSTEM_RESERVED_ALT_KEYS = ['tab', 'f4'];
// Reports whether a shortcut is likely to collide with a browser/OS shortcut.
// Treats Ctrl and Meta (Cmd) equivalently so the check is consistent across platforms.
export const hasSystemConflict = (shortcut: string): boolean => {
  if (!isValidKeybind(shortcut)) return false;
  const parts = shortcut.toLowerCase().split('+');
  const hasPrimaryModifier =
    parts.includes('ctrl') || parts.includes('control') || parts.includes('meta');
  const hasAlt = parts.includes('alt');
  const key = parts.find((part) => !isModifierToken(part));
  if (!key) return false;
  if (hasPrimaryModifier && SYSTEM_RESERVED_PRIMARY_KEYS.includes(key)) return true;
  if (hasAlt && SYSTEM_RESERVED_ALT_KEYS.includes(key)) return true;
  return false;
};
