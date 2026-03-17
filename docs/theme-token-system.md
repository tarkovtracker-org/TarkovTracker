# Theme Token System

## Purpose

TarkovTracker now separates theme mode from gameplay accent mode.

- Theme mode controls neutral surfaces, text, borders, overlays, and shadows.
- Gameplay mode controls PvP and PvE accent colors.
- Components should consume semantic tokens, not raw dark `surface-*` colors, when they are styling neutral UI.

## Source of Truth

- Theme tokens live in [tailwind.css](../app/assets/css/tailwind.css).
- Nuxt UI slot mappings live in [app.config.ts](../app/app.config.ts).
- Runtime theme selection lives in [useThemeMode.ts](../app/composables/useThemeMode.ts).

## How It Works

The root document gets `data-theme="dark"` or `data-theme="light"`.

```css
:root[data-theme='dark'] { ... }
:root[data-theme='light'] { ... }
```

Those selectors resolve semantic theme variables such as:

- `--theme-canvas`
- `--theme-shell`
- `--theme-panel`
- `--theme-raised`
- `--theme-field`
- `--theme-foreground`
- `--theme-foreground-muted`
- `--theme-border`
- `--theme-overlay`

Tailwind-facing aliases then map those root values into reusable utility tokens:

- `bg-canvas`
- `bg-shell`
- `bg-panel`
- `bg-raised`
- `bg-field`
- `text-foreground`
- `text-foreground-muted`
- `text-foreground-subtle`
- `border-border`
- `border-border-muted`
- `border-border-strong`

## Accent Rules

Accent palettes stay separate from theme neutrals.

- Use `primary`, `accent`, `success`, `warning`, `error`, `info` for semantic accents.
- Use `pvp-*` and `pve-*` only for game-mode specific treatment.
- Do not use PvP or PvE tokens to solve light vs dark contrast problems.

## Extended Theme Tokens

Some areas need specialized semantic tokens beyond the shared shell layer.

- Task state tokens:
  - completed surface, border, icon, overlay
  - failed surface, border, text, link, icon
- Map tokens:
  - popup surface
  - map canvas
  - map controls
  - badges
  - cluster text
- Graph tokens:
  - graph shell and surface
  - graph border and grid
  - graph text and node text
  - graph minimap mask and handles

These should also stay theme-aware and be defined in the root theme selectors instead of inside individual components.

## Component Rules

When adding or updating UI:

1. Use semantic classes first: `bg-panel`, `text-foreground`, `border-border`.
2. Use accent palettes only for meaning, not for base surfaces.
3. Avoid hardcoded `surface-*`, `text-white`, `white/`, `black/`, and `dark:` patterns in neutral UI.
4. If a feature needs a new neutral state, add a semantic token in `tailwind.css` and map it through `app.config.ts` if Nuxt UI uses it.

## Regression Coverage

Theme system coverage currently lives in:

- [usePreferences.test.ts](../app/stores/__tests__/usePreferences.test.ts)
  - persisted `themeMode`
- [useAppInitialization.test.ts](../app/composables/__tests__/useAppInitialization.test.ts)
  - root `data-theme` and `color-scheme`
- [themeTokens.test.ts](../app/assets/css/__tests__/themeTokens.test.ts)
  - semantic token contract in `tailwind.css`
  - semantic Nuxt UI usage in `app.config.ts`
