import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const tailwindCss = readFileSync(resolve(process.cwd(), 'app/assets/css/tailwind.css'), 'utf8');
const appConfig = readFileSync(resolve(process.cwd(), 'app/app.config.ts'), 'utf8');
describe('theme token contract', () => {
  it('defines semantic theme aliases for both dark and light root selectors', () => {
    expect(tailwindCss).toContain(":root[data-theme='dark']");
    expect(tailwindCss).toContain(":root[data-theme='light']");
    expect(tailwindCss).toContain('color-scheme: dark;');
    expect(tailwindCss).toContain('color-scheme: light;');
    const semanticAliases = [
      '--color-canvas: var(--theme-canvas);',
      '--color-shell: var(--theme-shell);',
      '--color-panel: var(--theme-panel);',
      '--color-raised: var(--theme-raised);',
      '--color-field: var(--theme-field);',
      '--color-foreground: var(--theme-foreground);',
      '--color-foreground-muted: var(--theme-foreground-muted);',
      '--color-border: var(--theme-border);',
      '--color-border-muted: var(--theme-border-muted);',
      '--color-border-strong: var(--theme-border-strong);',
    ];
    semanticAliases.forEach((token) => {
      expect(tailwindCss).toContain(token);
    });
  });
  it('keeps extended theme tokens for task states, maps, and graph views', () => {
    const extendedThemeTokens = [
      '--color-completed-surface: var(--theme-completed-surface);',
      '--color-failed-surface: var(--theme-failed-surface);',
      '--color-failed-text: var(--theme-failed-text);',
      '--color-map-popup-surface: var(--theme-map-popup-surface);',
      '--color-map-control-surface: var(--theme-map-control-surface);',
      '--color-graph-surface: var(--theme-graph-surface);',
      '--color-graph-border: var(--theme-graph-border);',
      '--color-graph-text: var(--theme-graph-text);',
    ];
    extendedThemeTokens.forEach((token) => {
      expect(tailwindCss).toContain(token);
    });
  });
  it('documents root theme application and semantic Nuxt UI surfaces in app config', () => {
    const configExpectations = [
      'bg-[var(--theme-overlay)]',
      'border-border bg-panel',
      'bg-field text-foreground',
      'text-foreground-muted',
      'bg-interactive hover:bg-interactive-hover text-foreground',
    ];
    configExpectations.forEach((token) => {
      expect(appConfig).toContain(token);
    });
  });
});
