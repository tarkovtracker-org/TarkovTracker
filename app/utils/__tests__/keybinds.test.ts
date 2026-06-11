import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYBINDS,
  hasSystemConflict,
  isValidKeybind,
  keybindsConflict,
  matchesKeybind,
  normalizeKeybind,
  sanitizeKeybind,
  serializeKeybindEvent,
} from '@/utils/keybinds';
const makeEvent = (init: Partial<KeyboardEvent>): KeyboardEvent =>
  ({
    key: 'a',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...init,
  }) as KeyboardEvent;
describe('keybinds util', () => {
  describe('isValidKeybind', () => {
    it('accepts well-formed shortcuts', () => {
      expect(isValidKeybind('ctrl+q')).toBe(true);
      expect(isValidKeybind('ctrl+shift+k')).toBe(true);
      expect(isValidKeybind('meta+k')).toBe(true);
      expect(isValidKeybind('space')).toBe(true);
    });
    it('rejects non-strings, empty, whitespace-only, and modifier-only values', () => {
      expect(isValidKeybind(undefined)).toBe(false);
      expect(isValidKeybind(123)).toBe(false);
      expect(isValidKeybind('')).toBe(false);
      expect(isValidKeybind(' ')).toBe(false);
      expect(isValidKeybind('ctrl+')).toBe(false);
      expect(isValidKeybind('ctrl+shift')).toBe(false);
    });
  });
  describe('sanitizeKeybind', () => {
    it('keeps valid values and lowercases them', () => {
      expect(sanitizeKeybind('Ctrl+Q', 'ctrl+z')).toBe('ctrl+q');
    });
    it('falls back for invalid or whitespace-only values', () => {
      expect(sanitizeKeybind(' ', 'ctrl+z')).toBe('ctrl+z');
      expect(sanitizeKeybind('ctrl+', 'ctrl+q')).toBe('ctrl+q');
      expect(sanitizeKeybind(42, 'ctrl+q')).toBe('ctrl+q');
    });
  });
  describe('serializeKeybindEvent', () => {
    it('includes the meta modifier', () => {
      expect(serializeKeybindEvent(makeEvent({ key: 'k', metaKey: true }))).toBe('meta+k');
    });
    it('serializes combined modifiers and normalizes space', () => {
      expect(serializeKeybindEvent(makeEvent({ key: 'K', ctrlKey: true, shiftKey: true }))).toBe(
        'ctrl+shift+k'
      );
      expect(serializeKeybindEvent(makeEvent({ key: ' ', altKey: true }))).toBe('alt+space');
    });
  });
  describe('matchesKeybind', () => {
    it('matches only when every modifier state agrees', () => {
      expect(matchesKeybind(makeEvent({ key: 'q', ctrlKey: true }), 'ctrl+q')).toBe(true);
      expect(matchesKeybind(makeEvent({ key: 'q', ctrlKey: true, shiftKey: true }), 'ctrl+q')).toBe(
        false
      );
      expect(matchesKeybind(makeEvent({ key: 'k', metaKey: true }), 'meta+k')).toBe(true);
      expect(matchesKeybind(makeEvent({ key: 'k', ctrlKey: true }), 'meta+k')).toBe(false);
    });
    it('returns false for invalid shortcut strings', () => {
      expect(matchesKeybind(makeEvent({ key: 'q', ctrlKey: true }), ' ')).toBe(false);
      expect(matchesKeybind(makeEvent({ key: 'q', ctrlKey: true }), 'ctrl+')).toBe(false);
    });
    it('treats control as an alias for ctrl', () => {
      expect(matchesKeybind(makeEvent({ key: 'z', ctrlKey: true }), 'control+z')).toBe(true);
    });
  });
  describe('hasSystemConflict', () => {
    it('flags reserved keys behind Ctrl or Meta equivalently', () => {
      expect(hasSystemConflict('ctrl+f')).toBe(true);
      expect(hasSystemConflict('meta+f')).toBe(true);
      expect(hasSystemConflict('ctrl+w')).toBe(true);
      expect(hasSystemConflict('meta+t')).toBe(true);
    });
    it('flags Alt+Tab and Alt+F4', () => {
      expect(hasSystemConflict('alt+tab')).toBe(true);
      expect(hasSystemConflict('alt+f4')).toBe(true);
    });
    it('does not flag the shipped defaults or unreserved combos', () => {
      expect(hasSystemConflict(DEFAULT_KEYBINDS.omnibar)).toBe(false);
      expect(hasSystemConflict(DEFAULT_KEYBINDS.undo)).toBe(false);
      expect(hasSystemConflict('ctrl+k')).toBe(false);
      expect(hasSystemConflict('ctrl+shift+x')).toBe(false);
    });
    it('returns false for invalid shortcut strings', () => {
      expect(hasSystemConflict(' ')).toBe(false);
      expect(hasSystemConflict('ctrl+')).toBe(false);
    });
  });
  describe('normalizeKeybind', () => {
    it('canonicalizes modifier order and aliases', () => {
      expect(normalizeKeybind('shift+ctrl+k')).toBe('ctrl+shift+k');
      expect(normalizeKeybind('control+z')).toBe('ctrl+z');
      expect(normalizeKeybind('META+K')).toBe('meta+k');
    });
    it('returns null for invalid shortcuts', () => {
      expect(normalizeKeybind('ctrl+')).toBeNull();
      expect(normalizeKeybind(' ')).toBeNull();
    });
  });
  describe('keybindsConflict', () => {
    it('detects identical bindings regardless of modifier order or alias', () => {
      expect(keybindsConflict('ctrl+q', 'ctrl+q')).toBe(true);
      expect(keybindsConflict('ctrl+shift+k', 'shift+ctrl+k')).toBe(true);
      expect(keybindsConflict('control+z', 'ctrl+z')).toBe(true);
    });
    it('returns false for distinct bindings', () => {
      expect(keybindsConflict('ctrl+q', 'ctrl+z')).toBe(false);
      expect(keybindsConflict('ctrl+k', 'meta+k')).toBe(false);
    });
    it('returns false when either binding is invalid', () => {
      expect(keybindsConflict('ctrl+', 'ctrl+')).toBe(false);
      expect(keybindsConflict('ctrl+q', ' ')).toBe(false);
    });
  });
});
