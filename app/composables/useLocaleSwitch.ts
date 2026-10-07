import { useIntervalFn } from '@vueuse/core';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { logger } from '@/utils/logger';
type LocaleState = {
  pending: boolean;
  error: boolean;
  deadline: number;
  now: number;
  cached: Record<string, boolean>;
};
type LocaleRuntime = {
  state: LocaleState;
  controller?: AbortController;
  baseline?: { locale: string; override: string | null };
  localeQueue: Promise<void>;
  cacheRevision: number;
};
// Store identity isolates SSR requests while sharing every mounted locale selector.
const runtimes = new WeakMap<object, LocaleRuntime>();
const getRuntime = (store: object): LocaleRuntime => {
  const existing = runtimes.get(store);
  if (existing) return existing;
  const runtime: LocaleRuntime = {
    state: reactive({ pending: false, error: false, deadline: 0, now: Date.now(), cached: {} }),
    localeQueue: Promise.resolve(),
    cacheRevision: 0,
  };
  runtimes.set(store, runtime);
  return runtime;
};
export const useLocaleSwitch = () => {
  const { locale, availableLocales, setLocale, t } = useI18n({ useScope: 'global' });
  const metadata = useMetadataStore();
  const preferences = usePreferencesStore();
  const skills = useSkillCalculation();
  const runtime = getRuntime(metadata);
  const state = runtime.state;
  const locales = availableLocales as readonly string[];
  const remaining = computed(() => Math.max(0, Math.ceil((state.deadline - state.now) / 1000)));
  useIntervalFn(() => {
    state.now = Date.now();
  }, 250);
  watch(
    () => [state.pending, locale.value, metadata.currentGameMode],
    async () => {
      const revision = ++runtime.cacheRevision;
      const entries = await Promise.all(
        locales.map(
          async (code) =>
            [code, await metadata.hasCriticalLocaleCache(code).catch(() => false)] as const
        )
      );
      if (revision === runtime.cacheRevision) state.cached = Object.fromEntries(entries);
    },
    { immediate: true }
  );
  const isDisabled = (code: string) =>
    state.pending || (code !== locale.value && remaining.value > 0 && !state.cached[code]);
  const status = computed(() => {
    if (state.pending) return t('settings.locale_loading');
    const failure = state.error ? t('settings.locale_failed') : '';
    const cooldown =
      remaining.value > 0 ? t('settings.locale_cooldown', { seconds: remaining.value }) : '';
    return [failure, cooldown].filter(Boolean).join(' ');
  });
  // Serialize i18n's non-abortable mutation so a late setLocale cannot overwrite its successor.
  const applyLocale = (code: string, controller: AbortController) => {
    const operation = runtime.localeQueue.then(async () => {
      if (!controller.signal.aborted) await setLocale(code as typeof locale.value);
    });
    runtime.localeQueue = operation.catch(() => {});
    return operation;
  };
  const isBaselineRestored = (baseline: { locale: string; override: string | null }) =>
    locale.value === baseline.locale && preferences.getLocaleOverride === baseline.override;
  const rollback = async (controller: AbortController) => {
    const baseline = runtime.baseline;
    if (!baseline) return;
    if (isBaselineRestored(baseline)) return;
    await applyLocale(baseline.locale, controller).catch((error) => {
      logger.error('[LocaleSwitch] Error restoring locale:', error);
    });
    if (controller.signal.aborted) return;
    preferences.setLocaleOverride(baseline.override);
    metadata.updateLanguageAndGameMode(baseline.override ?? baseline.locale);
    await metadata.fetchAllData(false, { signal: controller.signal }).catch((error) => {
      logger.error('[LocaleSwitch] Error restoring metadata:', error);
    });
  };
  const refreshLocale = async (code: string, controller: AbortController, cached: boolean) => {
    await applyLocale(code, controller);
    if (controller.signal.aborted) return;
    preferences.setLocaleOverride(code);
    metadata.updateLanguageAndGameMode(code);
    if (!cached) state.deadline = Date.now() + 10_000;
    await metadata.fetchAllData(false, { signal: controller.signal });
    if (controller.signal.aborted) return;
    skills.migrateLegacySkillOffsets();
    state.error = false;
  };
  const isSelectionAllowed = (code: string) => {
    if (!locales.includes(code)) return false;
    return state.pending || code !== locale.value;
  };
  const isCoolingDown = (cached: boolean, wasPending: boolean) =>
    !wasPending && !cached && Date.now() < state.deadline;
  const failSelection = async (controller: AbortController, error: unknown) => {
    if (controller.signal.aborted) return;
    logger.error('[LocaleSwitch] Error switching locale:', error);
    await rollback(controller);
    if (!controller.signal.aborted) state.error = true;
  };
  const finishSelection = (controller: AbortController) => {
    if (runtime.controller !== controller) return;
    state.pending = false;
    runtime.baseline = undefined;
  };
  const runSelection = async (code: string, controller: AbortController, wasPending: boolean) => {
    const cached = await metadata.hasCriticalLocaleCache(code);
    if (controller.signal.aborted) return;
    if (isCoolingDown(cached, wasPending)) return;
    await refreshLocale(code, controller, cached);
  };
  const selectLocale = async (code: string) => {
    if (!isSelectionAllowed(code)) return;
    const wasPending = state.pending;
    runtime.controller?.abort();
    const controller = new AbortController();
    runtime.controller = controller;
    runtime.baseline ??= { locale: locale.value, override: preferences.getLocaleOverride };
    state.pending = true;
    state.error = false;
    try {
      await runSelection(code, controller, wasPending);
    } catch (error) {
      await failSelection(controller, error);
    } finally {
      finishSelection(controller);
    }
  };
  return {
    locale,
    availableLocales: locales,
    selectLocale,
    isDisabled,
    status,
    remaining,
    pending: computed(() => state.pending),
    error: computed(() => state.error),
  };
};
