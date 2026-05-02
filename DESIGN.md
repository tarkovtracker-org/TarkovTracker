---
version: alpha
name: TarkovTracker
description: Agent-facing design contract for the TarkovTracker Nuxt 4 SPA.
colors:
  canvas: '#0a0a0a'
  shell: '#171717'
  panel: '#1f1f1f'
  raised: '#262626'
  text: '#e5e5e5'
  text-secondary: '#d4d4d4'
  text-muted: '#a3a3a3'
  primary: '#ad7a3d'
  primary-strong: '#c08b48'
  secondary: '#339299'
  accent: '#3f6870'
  success: '#22b981'
  warning: '#cea617'
  error: '#b83333'
  info: '#3f98d0'
  pvp: '#b8aa96'
  pve: '#5c9ab7'
typography:
  body:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  heading:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace'
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0
rounded:
  sm: 4px
  md: 8px
  lg: 12px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  page:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
  shell:
    backgroundColor: '{colors.shell}'
    textColor: '{colors.text}'
  panel:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text-secondary}'
    rounded: '{rounded.md}'
    padding: '{spacing.md}'
  card:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.text-secondary}'
    rounded: '{rounded.md}'
    padding: '{spacing.md}'
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.md}'
    padding: '{spacing.sm}'
  button-primary-hover:
    backgroundColor: '{colors.primary-strong}'
    textColor: '{colors.canvas}'
  button-neutral:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.text-secondary}'
    rounded: '{rounded.md}'
    padding: '{spacing.sm}'
  caption:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text-muted}'
    typography: '{typography.body}'
  badge-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.sm}'
    padding: '{spacing.xs}'
  badge-accent:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.text}'
    rounded: '{rounded.sm}'
    padding: '{spacing.xs}'
  status-success:
    backgroundColor: '{colors.success}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.sm}'
  status-warning:
    backgroundColor: '{colors.warning}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.sm}'
  status-error:
    backgroundColor: '{colors.error}'
    textColor: '{colors.text}'
    rounded: '{rounded.sm}'
  status-info:
    backgroundColor: '{colors.info}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.sm}'
  mode-pvp:
    backgroundColor: '{colors.pvp}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.sm}'
  mode-pve:
    backgroundColor: '{colors.pve}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.sm}'
---

# TarkovTracker Design

## Overview

TarkovTracker is a dense, client-only tracking application for Escape from Tarkov players. The
interface should feel tactical, quiet, and fast to scan: dark application chrome, compact panels,
strong task/item hierarchy, and sparing tan or teal emphasis for actions and state.

This file is agent-facing documentation. The runtime source of truth for CSS tokens is
`app/assets/css/tailwind.css`, with Nuxt UI color registration in `nuxt.config.ts` and component
slot defaults in `app/app.config.ts`.

## Colors

Use the Tailwind v4 theme tokens already defined in `app/assets/css/tailwind.css`. Do not put hex
colors in Vue templates.

The front matter uses sRGB hex values because the `DESIGN.md` token schema validates colors as hex.
Treat those values as agent-readable representatives of the runtime Tailwind tokens, not a separate
CSS source of truth.

Primary actions use the tan `primary` palette. Secondary accents use `secondary` or `accent`.
Surfaces follow the `surface` ladder: page canvas at `surface-950`, shell chrome at `surface-900`,
content panels at `surface-850` or `surface-900`, raised controls at `surface-800`, hover states at
`surface-700`, and dividers at `surface-600`.

Surface token mapping:

- `canvas` -> `surface-950`
- `shell` -> `surface-900`
- `panel` -> `surface-850` for content panels, or `surface-900` where matching existing shell
  panels
- `raised` -> `surface-800`
- hover states -> `surface-700`
- dividers -> `surface-600`

State colors are semantic: `success`, `warning`, `error`, and `info`. Game-mode color should use
`pvp` and `pve`, not ad hoc tan or blue classes.

## Typography

The app uses a monospace stack for both interface and display text. Keep text compact and readable.
Reserve large headings for page-level hierarchy; controls, cards, drawers, and dense task surfaces
should use tighter text sizes.

User-facing copy belongs in `app/locales/en.json` unless it is an existing technical identifier,
data value, or intentionally non-localized game content.

## Layout

Prefer functional density over marketing-style spacing. Use predictable Tailwind spacing such as
`gap-4`, `p-4`, and `space-y-4`, then tighten locally only when an existing component pattern does.

Pages should use full-width shell bands or constrained content layouts. Avoid nested cards and avoid
turning whole page sections into decorative floating cards.

## Elevation & Depth

Depth is subtle. Prefer borders, surface contrast, and Nuxt UI shadows already configured in
`app/app.config.ts`. Avoid decorative gradients, glows, or blurred background shapes unless an
existing shell pattern already uses them.

## Shapes

Use the established radius scale: `rounded-sm` for tight controls, `rounded-md` for cards and
panels, and `rounded-lg` only where Nuxt UI or an existing pattern already does.

## Components

Use Nuxt UI components first for standard controls: `UButton`, `UInput`, `UAlert`, `USelectMenu`,
`UDropdownMenu`, and related primitives. Prefer shared local components like `GenericCard`,
`AppTooltip`, and existing feature cards before creating new visual primitives.

For icon-only actions, use an icon and an accessible label. Do not use text-only rounded rectangles
when a standard icon button is clearer.

## Do's and Don'ts

Do keep UI changes consistent with the current dark surface ladder, tan primary action color, teal
accent language, and compact app ergonomics.

Do run `npm run design:lint` after editing this file and `npm run format` before leaving code.

Don't generate Tailwind config from this file unless the repository intentionally switches
`DESIGN.md` from documentation to build input.

Don't edit Crowdin-managed locale files for ordinary UI copy. Update `app/locales/en.json` only.
