# Light Mode Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-class light mode option for TarkovTracker that users can toggle, persist, and use across the core shell and major views without breaking the existing PvP/PvE accent system.

**Architecture:** Introduce a persisted `themeMode` preference in the existing preferences store and Supabase sync pipeline. Apply the selected theme on the document root with a small client-side theme applicator. Refactor the Tailwind/Nuxt UI token layer so theme mode controls neutral surfaces/text/borders while PvP/PvE controls accent tokens. Then replace dark-only classes in the shell and shared UI with semantic theme-aware tokens before auditing major pages.

**Related Issues:** `#102` is the main ticket. Design the token split so it stays compatible with `#104` (PvP/PvE accent theming) and aligns with `#108` (theme control in the app bar). `#101` is already closed and does not block this work.

**Tech Stack:** Vue 3 `<script setup>`, Nuxt 4 SPA, Pinia persisted state, Supabase preference sync, Tailwind v4 `@theme`, Nuxt UI v4, Vitest

---

## Current State Summary

- The app shell already separates game controls and app controls:
  - Game mode/faction live in `app/features/drawer/DrawerGameSettings.vue`
  - Locale control already lives in `app/shell/AppBar.vue`
- Preferences already persist locally and sync to Supabase:
  - `app/stores/usePreferences.ts`
  - `app/plugins/zz.preferences-sync.client.ts`
  - `supabase/migrations/*user_preferences*`
- Theme tokens exist, but they are effectively dark-first:
  - `app/assets/css/tailwind.css`
  - `app/app.config.ts`
- The UI still contains many hardcoded dark assumptions that will not survive a light theme pass:
  - about `153` `text-white` usages
  - about `234` `white/` usages
  - a few `black/` overlays
  - a few `dark:` classes

---

## Implementation Progress (2026-03-16)

### Completed in first slice

- Persisted `themeMode` was added to the preferences store in `app/stores/usePreferences.ts`
  - default is `'dark'`
  - getter/action added: `getThemeMode`, `setThemeMode`
  - local persistence now includes `themeMode`
  - invalid persisted values are sanitized back to the default
- Supabase sync now round-trips `theme_mode`
  - `app/plugins/zz.preferences-sync.client.ts` normalizes row values when hydrating
  - sync payload now writes `theme_mode`
- Theme application now happens at app startup
  - `app/composables/useThemeMode.ts` applies `data-theme` and `color-scheme` on `document.documentElement`
  - `app/composables/useAppInitialization.ts` calls `useThemeMode()`
- Database/schema work landed
  - migration: `supabase/migrations/20260316120000_add_user_preferences_theme_mode.sql`
  - generated types updated in `supabase/functions/_shared/database.types.ts`

### Completed test coverage

- `app/stores/__tests__/usePreferences.test.ts`
  - default theme
  - persisted hydration
  - invalid persisted value fallback
  - getter/action coverage
- `app/composables/__tests__/useAppInitialization.test.ts`
  - root `data-theme` and `colorScheme` updates on mount/change
- `app/plugins/__tests__/zz.preferences-sync.client.test.ts`
  - Supabase row hydration for `theme_mode`

### Verification completed

- `npm run format`
- `npx vitest run app/stores/__tests__/usePreferences.test.ts app/composables/__tests__/useAppInitialization.test.ts app/plugins/__tests__/zz.preferences-sync.client.test.ts`

### Remaining work

- Task 4: split neutral theme tokens from PvP/PvE accent tokens
- Task 5: add theme controls to app bar and settings
- Task 6: shell/shared component audit
- Task 7: page-by-page audit and contrast cleanup

## Implementation Progress (2026-03-17)

### Token/documentation follow-up completed

- Added token contract coverage in `app/assets/css/__tests__/themeTokens.test.ts`
- Added token system documentation in `docs/theme-token-system.md`
- Linked the new documentation from `docs/README.md`

### Long-tail cleanup completed in this slice

- Shell/theme cleanup
  - `app/shell/NavDrawer.vue`
  - `app/pages/privacy.vue`
  - `app/app.config.ts`
  - `app/app.vue`
  - `app/error.vue`
  - `app/components/analytics/AnalyticsConsentBanner.vue`
- Settings/account/team cleanup
  - `app/features/settings/AppearanceCard.vue`
  - `app/features/settings/DataManagementCard.vue`
  - `app/features/settings/ApiTokens.vue`
  - `app/features/settings/PrivacyCard.vue`
  - `app/features/settings/ProfileSharingCard.vue`
  - `app/features/team/TeamOptions.vue`
  - `app/features/team/MyTeam.vue`
- Needed items / modal cleanup
  - `app/features/neededitems/NeededItemGroupedModal.vue`
- Public page cleanup
  - `app/pages/streamer-tools.vue`
  - `app/pages/credits.vue`
  - `app/pages/changelog.vue`
  - `app/pages/auth/callback.vue`
- Locale cleanup for theme settings
  - `app/locales/de.json5`
  - `app/locales/es.json5`
  - `app/locales/fr.json5`
  - `app/locales/ru.json5`
  - `app/locales/uk.json5`
  - `app/locales/zh.json5`

### Notes

- Removed stray explicit `useI18n` imports where Nuxt auto-imports already apply
- Replaced remaining high-visibility `dark:` and dark-surface assumptions in the shell/settings/public pages above with semantic theme tokens
- Added real non-English appearance strings instead of English placeholders

### Remaining work after this slice

- Task 6 is substantially complete for shell/shared/settings/team/public pages
- Task 7 still has lower-priority pockets in profile, admin, map overlays, and a few support components that need the same semantic token pass

### Final cleanup pass completed

- Admin and support cleanup
  - `app/features/admin/AdminAuditLog.vue`
  - `app/features/admin/AdminCacheCard.vue`
  - `app/pages/admin.vue`
  - `app/pages/account.vue`
  - `app/pages/not-found.vue`
- Map/task semantic cleanup
  - `app/features/maps/composables/useLeafletMapControls.ts`
  - `app/features/maps/LeafletMap.vue`
  - `app/features/tasks/QuestObjectives.vue`
  - `app/features/tasks/TaskGraphView.vue`
  - `app/features/tasks/TaskCardBackground.vue`
  - `app/features/tasks/ObjectiveCountControls.vue`
- Settings/token cleanup
  - `app/features/settings/ResetProgressSection.vue`
  - `app/app.config.ts`
  - `app/layouts/default.vue`
  - `app/pages/login.vue`
  - `app/features/neededitems/NeededItemGroupedInputControls.vue`

### Final verification

- `npm run format`
- Residual pattern scan reduced to intentional accent/brand contrast cases only
- Remaining raw matches are mostly expected solid-accent text combinations such as:
  - success/info/PvP/PvE badges and completion toggles
  - brand login buttons
  - solid CTA buttons in `app.config.ts`

### Current status

- Task 6 is complete for the main app experience
- Task 7 is complete for the high-traffic user-facing routes and shared components
- Task 8 is covered by the existing preference/theme tests plus the token contract test and repeated visual cleanup passes
- Remaining cleanup is optional polish, not a blocker for the light-mode theme rollout

---

## Implementation Tasks

### Task 1: Add persisted theme preference (Done)

#### Files:

- Modify: `app/stores/usePreferences.ts`
- Modify: `app/stores/__tests__/usePreferences.test.ts`

Status:

- Implemented in `app/stores/usePreferences.ts`
- Verified in `app/stores/__tests__/usePreferences.test.ts`

#### Step 1: Add `themeMode` to PreferencesState

Add a new preference field using a narrow union:

```ts
themeMode: 'dark' | 'light';
```

Default to `'dark'` to preserve current behavior.

#### Step 2: Add getter and action

Follow the existing locale/task display pattern:

- `getThemeMode`
- `setThemeMode(themeMode: 'dark' | 'light')`

#### Step 3: Include it in persisted local storage

Add `themeMode` to the persisted `pick` list so anonymous users and logged-in users both retain the value locally.

#### Step 4: Add store tests

Cover:

- default value is `'dark'`
- persisted hydration restores `'light'`
- invalid values fall back safely if needed

#### Step 5: Commit

```bash
git add app/stores/usePreferences.ts app/stores/__tests__/usePreferences.test.ts
git commit -m "feat(theme): add persisted theme mode preference"
```

---

### Task 2: Sync theme preference through Supabase (Done)

#### Files:

- Modify: `app/plugins/zz.preferences-sync.client.ts`
- Create: `supabase/migrations/20260316120000_add_user_preferences_theme_mode.sql`
- Modify: `supabase/functions/_shared/database.types.ts`

Status:

- Implemented in `app/plugins/zz.preferences-sync.client.ts`
- Migration added in `supabase/migrations/20260316120000_add_user_preferences_theme_mode.sql`
- Types updated in `supabase/functions/_shared/database.types.ts`

#### Step 1: Add `theme_mode` column to `user_preferences`

Create a migration that:

- adds `theme_mode TEXT`
- backfills existing rows to `'dark'`
- sets a default of `'dark'`
- adds a check constraint limiting values to `'dark'` and `'light'`

#### Step 2: Read/write `theme_mode` in the sync plugin

Update:

- `applyPreferencesRow`
- `buildPreferencesSyncPayload`

Map `theme_mode` <-> `themeMode` exactly like `locale_override` <-> `localeOverride`.

#### Step 3: Refresh generated Supabase types

Regenerate `supabase/functions/_shared/database.types.ts` so the schema stays in sync.

#### Step 4: Commit

```bash
git add app/plugins/zz.preferences-sync.client.ts supabase/migrations/20260316120000_add_user_preferences_theme_mode.sql supabase/functions/_shared/database.types.ts
git commit -m "feat(theme): sync theme mode in user preferences"
```

---

### Task 3: Apply theme on app startup (Done)

#### Files:

- Create: `app/composables/useThemeMode.ts`
- Modify: `app/composables/useAppInitialization.ts`
- Add tests if needed near existing app init or composable tests

Status:

- Implemented in `app/composables/useThemeMode.ts`
- Wired in `app/composables/useAppInitialization.ts`
- Verified in `app/composables/__tests__/useAppInitialization.test.ts`

#### Step 1: Create a tiny theme applicator composable

Implement a composable that:

- reads `preferencesStore.getThemeMode`
- writes the current mode to `document.documentElement`
- uses a stable root selector such as `data-theme="light"` / `data-theme="dark"` or a root class like `theme-light` / `theme-dark`

Prefer `data-theme` because it keeps CSS selectors explicit.

#### Step 2: Hook it into app initialization

Reuse the existing app-level setup in `useAppInitialization.ts`, similar to how locale override is applied.

Behavior:

- apply immediately on startup
- react to store changes
- no-op on server, though SSR is disabled

#### Step 3: Add a small test

Verify the composable updates the root attribute/class when the preference changes.

#### Step 4: Commit

```bash
git add app/composables/useThemeMode.ts app/composables/useAppInitialization.ts
git commit -m "feat(theme): apply theme mode at app startup"
```

---

### Task 4: Split theme-mode tokens from game-mode accents

#### Files:

- Modify: `app/assets/css/tailwind.css`
- Modify: `app/app.config.ts`
- Modify: `app/types/theme.ts` if semantic types need expansion

#### Step 1: Reorganize the CSS token model

Refactor the root token setup into two layers:

- Theme mode tokens:
  - surfaces
  - text hierarchy
  - borders
  - overlays
  - shadows
- Accent tokens:
  - brand / primary
  - PvP
  - PvE
  - success / warning / error / info

The key rule: light vs dark should change neutrals, not the selected game accent.

#### Step 2: Add explicit light and dark root selectors

Example shape:

```css
:root[data-theme='dark'] { ... }
:root[data-theme='light'] { ... }
```

Move Nuxt UI variables like `--ui-bg`, `--ui-text`, `--ui-border`, and related surface aliases to derive from these semantic tokens.

#### Step 3: Update utility classes

Audit custom utility classes such as:

- `.bg-military-background`
- `.bg-sidebar`
- `.panel`
- `.card`
- Vue Flow theme overrides

Make them depend on semantic tokens instead of implicit dark values.

#### Step 4: Update Nuxt UI theme config

Audit `app/app.config.ts` for dark-only assumptions like:

- `text-white`
- hover states that assume dark backgrounds
- solid/soft/ghost variants with dark-only neutral surfaces

Keep semantic mapping intact, but make component styles derive from neutral tokens that work in both modes.

#### Step 5: Commit

```bash
git add app/assets/css/tailwind.css app/app.config.ts app/types/theme.ts
git commit -m "refactor(theme): separate mode tokens from accent tokens"
```

---

### Task 5: Add theme controls to app bar and settings

#### Files:

- Modify: `app/shell/AppBar.vue`
- Modify: `app/shell/__tests__/AppBar.test.ts`
- Modify: `app/pages/settings.vue`
- Create or modify a settings card under `app/features/settings/`
- Modify: `app/pages/__tests__/settings.page.test.ts`
- Modify: `app/locales/*.json5`

#### Step 1: Add quick theme control to the app bar

Place it near the existing locale selector in `AppBar.vue` to align with issue `#108`.

Use a compact control consistent with current app bar UI:

- segmented toggle
- icon button cycle
- or select

Recommended first pass: a compact select or two-state toggle for minimal UI risk.

#### Step 2: Add a persistent settings control

Add a new interface/theme section on the settings page. Keep it near `TaskDisplayCard` or create a focused card like `AppearanceCard.vue`.

Include:

- label
- dark/light options
- short accessibility-focused helper text

#### Step 3: Add localization keys

Add keys under the existing `settings.interface` namespace for:

- theme title
- dark
- light
- helper/description

#### Step 4: Add tests

Cover:

- app bar updates the store
- settings page renders the control
- locale/app bar tests still pass after the new control is introduced

#### Step 5: Commit

```bash
git add app/shell/AppBar.vue app/shell/__tests__/AppBar.test.ts app/pages/settings.vue app/features/settings app/pages/__tests__/settings.page.test.ts app/locales/*.json5
git commit -m "feat(theme): add light mode controls to app bar and settings"
```

---

### Task 6: Convert shell and shared UI away from dark-only classes

#### Files:

- Modify: `app/shell/NavDrawer.vue`
- Modify: `app/shell/AppBar.vue`
- Modify: `app/layouts/default.vue`
- Modify: `app/components/ui/GenericCard.vue`
- Modify: `app/components/SelectMenuFixed.vue`
- Modify: `app/features/drawer/*`
- Modify: other shared shell/UI components as needed

#### Step 1: Audit shell-level hardcoded classes

Replace dark-only styles like:

- `text-white`
- `bg-black/60`
- `border-white/10`
- `bg-white/5`

with semantic theme-aware tokens such as surface/text/border aliases.

#### Step 2: Verify logo behavior

The current drawer logo asset is `public/img/logos/tarkovtrackerlogo-light.webp`, which may be tuned for dark backgrounds. Decide one of:

- swap assets per theme
- use a single logo that works on both backgrounds
- add a themed background container that preserves contrast

This is a small but important visual dependency.

#### Step 3: Keep PvP/PvE buttons readable in both modes

Specifically audit:

- `app/features/drawer/DrawerGameSettings.vue`
- any game mode toggle variants elsewhere

These should retain strong contrast independent of the neutral theme mode.

#### Step 4: Commit

```bash
git add app/shell app/layouts/default.vue app/components/ui/GenericCard.vue app/components/SelectMenuFixed.vue app/features/drawer
git commit -m "refactor(theme): make shell and shared ui theme-aware"
```

---

### Task 7: Audit high-traffic pages for light-mode readiness

#### Files:

- Modify: `app/pages/login.vue`
- Modify: `app/pages/tasks.vue`
- Modify: `app/pages/needed-items.vue`
- Modify: `app/pages/index.vue`
- Modify: `app/pages/privacy.vue`
- Modify: high-traffic feature components under:
  - `app/features/tasks/`
  - `app/features/neededitems/`
  - `app/features/profile/`
  - `app/features/maps/`

#### Step 1: Start with the highest-visibility views

Priority order:

1. login
2. shell-visible dashboard/home
3. tasks
4. needed items
5. profile
6. map/tooltips

#### Step 2: Replace remaining hardcoded color assumptions

Focus on:

- text contrast
- borders disappearing on light surfaces
- overlays/modals/tooltips
- selected/active tab states
- badges and count pills

#### Step 3: Remove stray `dark:` patterns

The repo currently has very few `dark:` usages. Normalize them into the shared token model rather than introducing more conditional class forks.

#### Step 4: Commit

```bash
git add app/pages app/features/tasks app/features/neededitems app/features/profile app/features/maps
git commit -m "fix(theme): audit major views for light mode compatibility"
```

---

### Task 8: Validate accessibility and regressions

#### Files:

- Modify tests as needed

#### Step 1: Run targeted tests while iterating

Recommended:

```bash
npx vitest app/stores/__tests__/usePreferences.test.ts
npx vitest app/shell/__tests__/AppBar.test.ts
npx vitest app/pages/__tests__/settings.page.test.ts
```

#### Step 2: Run full project format/lint pass

```bash
npm run format
```

#### Step 3: Manual browser checks

Verify at minimum:

- app loads in dark mode by default
- switch to light mode persists after refresh
- app bar and drawer remain readable
- login page buttons remain legible
- tasks and needed-items views keep acceptable contrast
- PvP/PvE accents are still distinguishable in both modes

#### Step 4: Final commit

```bash
git add .
git commit -m "feat(theme): add first-class light mode support"
```

---

## Suggested PR Split

1. Preferences + migration + DOM theme applicator
2. Theme token refactor
3. App bar/settings controls
4. Shell/shared UI audit
5. High-traffic page audit and follow-up fixes

---

## Risks and Notes

- The main implementation cost is not the toggle itself. It is replacing dark-only class assumptions across the UI.
- Do not couple light mode logic to PvP/PvE accent logic. Theme mode and game mode must stay orthogonal.
- The current logo asset may need a light-theme counterpart or a safer container treatment.
- Avoid introducing lots of `dark:` and `light:` forks in templates. Prefer semantic variables first.
- `privacy.vue` still contains `dark:` classes and should be normalized during the audit.
- Because the app is SPA-only, client-side theme initialization is acceptable, but apply it as early as possible to reduce visible theme flash.
