import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STREAMER_TOOLS_SETTINGS,
  sanitizeHexColor,
  sanitizeStreamerToolsSettings,
} from '@/features/streamer-tools/composables/useStreamerToolsSettings';
describe('useStreamerToolsSettings', () => {
  it('sanitizes invalid settings values to defaults', () => {
    const sanitized = sanitizeStreamerToolsSettings({
      accent: 'invalid',
      borderColor: '#zzzzzz',
      cardOpacity: 500,
      customScalePercent: -10,
      mode: 'invalid',
    });
    expect(sanitized.accent).toBe(DEFAULT_STREAMER_TOOLS_SETTINGS.accent);
    expect(sanitized.mode).toBe(DEFAULT_STREAMER_TOOLS_SETTINGS.mode);
    expect(sanitized.borderColor).toBe(DEFAULT_STREAMER_TOOLS_SETTINGS.borderColor);
    expect(sanitized.cardOpacity).toBe(100);
    expect(sanitized.customScalePercent).toBe(50);
  });
  it('normalizes valid hex colors and rejects invalid values', () => {
    expect(sanitizeHexColor(' #AABBCC ', '#000000')).toBe('#aabbcc');
    expect(sanitizeHexColor('red', '#000000')).toBe('#000000');
  });
});
