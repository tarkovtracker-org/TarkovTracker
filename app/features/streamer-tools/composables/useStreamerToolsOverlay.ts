import {
  DEFAULT_STREAMER_TOOLS_SETTINGS,
  sanitizeHexColor,
  sanitizeStreamerToolsSettings,
  usePersistedStreamerToolsSettings,
  type OverlayAccent,
  type OverlayAlign,
  type OverlayBackground,
  type OverlayContainer,
  type OverlayFont,
  type OverlayLayout,
  type OverlayMetric,
  type OverlayResolution,
  type OverlaySize,
} from '@/features/streamer-tools/composables/useStreamerToolsSettings';
import { usePreferencesStore } from '@/stores/usePreferences';
import { GAME_MODES, type GameMode } from '@/utils/constants';
interface IntervalOption {
  label: string;
  value: number;
}
interface MetricOption {
  description: string;
  label: string;
  value: OverlayMetric;
}
interface SelectOption<T extends string> {
  label: string;
  value: T;
}
export function useStreamerToolsOverlay() {
  const persistedSettings = usePersistedStreamerToolsSettings();
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const { $supabase } = useNuxtApp();
  const runtimeConfig = useRuntimeConfig();
  const selectedMode = ref<GameMode>(persistedSettings.value.mode);
  const selectedMetric = ref<OverlayMetric>(persistedSettings.value.metric);
  const selectedLayout = ref<OverlayLayout>(persistedSettings.value.layout);
  const selectedAccent = ref<OverlayAccent>(persistedSettings.value.accent);
  const selectedSize = ref<OverlaySize>(persistedSettings.value.size);
  const selectedAlign = ref<OverlayAlign>(persistedSettings.value.align);
  const selectedBackground = ref<OverlayBackground>(persistedSettings.value.background);
  const selectedContainer = ref<OverlayContainer>(persistedSettings.value.container);
  const selectedResolution = ref<OverlayResolution>(persistedSettings.value.resolution);
  const intervalMs = ref<number>(persistedSettings.value.intervalMs);
  const customAccentColor = ref(persistedSettings.value.customAccentColor);
  const customBackgroundColor = ref(persistedSettings.value.customBackgroundColor);
  const customBackgroundOpacity = ref(persistedSettings.value.customBackgroundOpacity);
  const customScalePercent = ref(persistedSettings.value.customScalePercent);
  const showPercent = ref(persistedSettings.value.showPercent);
  const showRemaining = ref(persistedSettings.value.showRemaining);
  const customLabel = ref(persistedSettings.value.customLabel);
  const selectedFont = ref<OverlayFont>(persistedSettings.value.font);
  const showTitle = ref(persistedSettings.value.showTitle);
  const textColor = ref(persistedSettings.value.textColor);
  const cardColor = ref(persistedSettings.value.cardColor);
  const cardOpacity = ref(persistedSettings.value.cardOpacity);
  const borderColor = ref(persistedSettings.value.borderColor);
  const borderOpacity = ref(persistedSettings.value.borderOpacity);
  const trackColor = ref(persistedSettings.value.trackColor);
  const trackOpacity = ref(persistedSettings.value.trackOpacity);
  const intervalOptions = computed<IntervalOption[]>(() => [
    { label: t('streamer_tools.interval_60s', 'Every 60 seconds'), value: 60000 },
    { label: t('streamer_tools.interval_120s', 'Every 2 minutes'), value: 120000 },
    { label: t('streamer_tools.interval_300s', 'Every 5 minutes'), value: 300000 },
    { label: t('streamer_tools.interval_600s', 'Every 10 minutes'), value: 600000 },
  ]);
  const metricOptions = computed<MetricOption[]>(() => [
    {
      description: t(
        'streamer_tools.metric_tasks_desc',
        'Completed and remaining Kappa-required tasks.'
      ),
      label: t('streamer_tools.metric_tasks', 'Kappa Tasks'),
      value: 'tasks',
    },
    {
      description: t(
        'streamer_tools.metric_items_desc',
        'Collected and remaining Kappa task items.'
      ),
      label: t('streamer_tools.metric_items', 'Kappa Items'),
      value: 'items',
    },
    {
      description: t(
        'streamer_tools.metric_summary_desc',
        'Tasks and items in one overlay widget.'
      ),
      label: t('streamer_tools.metric_summary', 'Combined Summary'),
      value: 'summary',
    },
  ]);
  const layoutOptions = computed<SelectOption<OverlayLayout>[]>(() => [
    { label: t('streamer_tools.layout_card', 'Full Card'), value: 'card' },
    { label: t('streamer_tools.layout_minimal', 'Minimal Pill'), value: 'minimal' },
    { label: t('streamer_tools.layout_text', 'Text Only'), value: 'text' },
  ]);
  const accentOptions = computed<SelectOption<OverlayAccent>[]>(() => [
    { label: t('streamer_tools.accent_kappa', 'Red'), value: 'kappa' },
    { label: t('streamer_tools.accent_info', 'Cyan'), value: 'info' },
    { label: t('streamer_tools.accent_success', 'Green'), value: 'success' },
    { label: t('streamer_tools.accent_warning', 'Orange'), value: 'warning' },
    { label: t('streamer_tools.accent_custom', 'Custom'), value: 'custom' },
  ]);
  const sizeOptions = computed<SelectOption<OverlaySize>[]>(() => [
    { label: t('streamer_tools.size_sm', 'Small'), value: 'sm' },
    { label: t('streamer_tools.size_md', 'Medium'), value: 'md' },
    { label: t('streamer_tools.size_lg', 'Large'), value: 'lg' },
  ]);
  const resolutionOptions = computed<SelectOption<OverlayResolution>[]>(() => [
    { label: t('streamer_tools.resolution_1080', '1080p'), value: '1080p' },
    { label: t('streamer_tools.resolution_1440', '1440p'), value: '1440p' },
    { label: t('streamer_tools.resolution_custom', 'Custom Scale'), value: 'custom' },
  ]);
  const alignOptions = computed<SelectOption<OverlayAlign>[]>(() => [
    { label: t('streamer_tools.align_top_left', 'Top Left'), value: 'top-left' },
    { label: t('streamer_tools.align_top_center', 'Top Center'), value: 'top-center' },
    { label: t('streamer_tools.align_top_right', 'Top Right'), value: 'top-right' },
    { label: t('streamer_tools.align_center_left', 'Center Left'), value: 'center-left' },
    { label: t('streamer_tools.align_center', 'Center'), value: 'center' },
    { label: t('streamer_tools.align_center_right', 'Center Right'), value: 'center-right' },
    { label: t('streamer_tools.align_bottom_left', 'Bottom Left'), value: 'bottom-left' },
    { label: t('streamer_tools.align_bottom_center', 'Bottom Center'), value: 'bottom-center' },
    { label: t('streamer_tools.align_bottom_right', 'Bottom Right'), value: 'bottom-right' },
  ]);
  const backgroundOptions = computed<SelectOption<OverlayBackground>[]>(() => [
    { label: t('streamer_tools.background_transparent', 'Transparent'), value: 'transparent' },
    { label: t('streamer_tools.background_custom', 'Custom Color'), value: 'custom' },
  ]);
  const containerOptions = computed<SelectOption<OverlayContainer>[]>(() => [
    { label: t('streamer_tools.container_canvas', 'Scene Canvas'), value: 'canvas' },
    {
      label: t('streamer_tools.container_self_contained', 'Self Contained'),
      value: 'self-contained',
    },
  ]);
  const fontOptions = computed<SelectOption<OverlayFont>[]>(() => [
    { label: 'Rajdhani', value: 'rajdhani' },
    { label: 'Inter', value: 'inter' },
    { label: 'Poppins', value: 'poppins' },
    { label: 'Oswald', value: 'oswald' },
    { label: 'Outfit', value: 'outfit' },
    { label: 'Roboto Mono', value: 'roboto-mono' },
  ]);
  const isCustomAccent = computed(() => selectedAccent.value === 'custom');
  const isCustomResolution = computed(() => selectedResolution.value === 'custom');
  const isCustomBackground = computed(() => selectedBackground.value === 'custom');
  const isSelfContained = computed(() => selectedContainer.value === 'self-contained');
  const normalizedCustomAccentColor = computed(() => {
    const normalized = customAccentColor.value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
    return DEFAULT_STREAMER_TOOLS_SETTINGS.customAccentColor;
  });
  const normalizedCustomBackgroundColor = computed(() => {
    const normalized = customBackgroundColor.value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
    return DEFAULT_STREAMER_TOOLS_SETTINGS.customBackgroundColor;
  });
  const normalizedCustomBackgroundOpacity = computed(() => {
    if (!Number.isFinite(customBackgroundOpacity.value)) {
      return DEFAULT_STREAMER_TOOLS_SETTINGS.customBackgroundOpacity;
    }
    return Math.min(100, Math.max(0, Math.round(customBackgroundOpacity.value)));
  });
  const normalizedCustomScalePercent = computed(() => {
    if (!Number.isFinite(customScalePercent.value)) {
      return DEFAULT_STREAMER_TOOLS_SETTINGS.customScalePercent;
    }
    return Math.min(250, Math.max(50, Math.round(customScalePercent.value)));
  });
  const normalizedTextColor = computed(() =>
    sanitizeHexColor(textColor.value, DEFAULT_STREAMER_TOOLS_SETTINGS.textColor)
  );
  const normalizedCardColor = computed(() =>
    sanitizeHexColor(cardColor.value, DEFAULT_STREAMER_TOOLS_SETTINGS.cardColor)
  );
  const normalizedCardOpacity = computed(() => {
    if (!Number.isFinite(cardOpacity.value)) return DEFAULT_STREAMER_TOOLS_SETTINGS.cardOpacity;
    return Math.min(100, Math.max(0, Math.round(cardOpacity.value)));
  });
  const normalizedBorderColor = computed(() =>
    sanitizeHexColor(borderColor.value, DEFAULT_STREAMER_TOOLS_SETTINGS.borderColor)
  );
  const normalizedBorderOpacity = computed(() => {
    if (!Number.isFinite(borderOpacity.value)) return DEFAULT_STREAMER_TOOLS_SETTINGS.borderOpacity;
    return Math.min(100, Math.max(0, Math.round(borderOpacity.value)));
  });
  const normalizedTrackColor = computed(() =>
    sanitizeHexColor(trackColor.value, DEFAULT_STREAMER_TOOLS_SETTINGS.trackColor)
  );
  const normalizedTrackOpacity = computed(() => {
    if (!Number.isFinite(trackOpacity.value)) return DEFAULT_STREAMER_TOOLS_SETTINGS.trackOpacity;
    return Math.min(100, Math.max(0, Math.round(trackOpacity.value)));
  });
  const isNonDefaultTextColor = computed(
    () => normalizedTextColor.value !== DEFAULT_STREAMER_TOOLS_SETTINGS.textColor
  );
  const isNonDefaultCardColor = computed(
    () =>
      normalizedCardColor.value !== DEFAULT_STREAMER_TOOLS_SETTINGS.cardColor ||
      normalizedCardOpacity.value !== DEFAULT_STREAMER_TOOLS_SETTINGS.cardOpacity
  );
  const isNonDefaultBorderColor = computed(
    () =>
      normalizedBorderColor.value !== DEFAULT_STREAMER_TOOLS_SETTINGS.borderColor ||
      normalizedBorderOpacity.value !== DEFAULT_STREAMER_TOOLS_SETTINGS.borderOpacity
  );
  const isNonDefaultTrackColor = computed(
    () =>
      normalizedTrackColor.value !== DEFAULT_STREAMER_TOOLS_SETTINGS.trackColor ||
      normalizedTrackOpacity.value !== DEFAULT_STREAMER_TOOLS_SETTINGS.trackOpacity
  );
  const isNonDefaultFont = computed(
    () => selectedFont.value !== DEFAULT_STREAMER_TOOLS_SETTINGS.font
  );
  const isLoggedIn = computed(() => Boolean($supabase.user.loggedIn && $supabase.user.id));
  const currentUserId = computed(() =>
    typeof $supabase.user.id === 'string' && $supabase.user.id.trim().length > 0
      ? $supabase.user.id
      : null
  );
  const isModePublic = computed(() => {
    return selectedMode.value === GAME_MODES.PVE
      ? preferencesStore.getProfileSharePvePublic
      : preferencesStore.getProfileSharePvpPublic;
  });
  const appOrigin = computed(() => {
    if (import.meta.client && typeof window !== 'undefined') return window.location.origin;
    const configured = runtimeConfig.public.appUrl;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return configured.replace(/\/$/, '');
    }
    return '';
  });
  const overlayPath = computed(() => {
    if (!currentUserId.value) return '';
    return `/overlay/kappa/${currentUserId.value}/${selectedMode.value}`;
  });
  const apiPath = computed(() => {
    if (!currentUserId.value) return '';
    return `/api/streamer/${currentUserId.value}/${selectedMode.value}/kappa`;
  });
  const sanitizedCustomLabel = computed(() => customLabel.value.trim().slice(0, 60));
  const overlayUrl = computed(() => {
    if (!overlayPath.value) return '';
    const query = new URLSearchParams({
      accent: selectedAccent.value,
      align: selectedAlign.value,
      bg: selectedBackground.value,
      container: selectedContainer.value,
      interval: String(intervalMs.value),
      layout: selectedLayout.value,
      metric: selectedMetric.value,
      resolution: selectedResolution.value,
      showPercent: showPercent.value ? '1' : '0',
      showRemaining: showRemaining.value ? '1' : '0',
      size: selectedSize.value,
    });
    if (selectedAccent.value === 'custom') {
      query.set('accentColor', normalizedCustomAccentColor.value);
    }
    if (selectedBackground.value === 'transparent') {
      query.set('transparent', '1');
    }
    if (selectedBackground.value === 'custom') {
      query.set('bgColor', normalizedCustomBackgroundColor.value);
      query.set('bgOpacity', String(normalizedCustomBackgroundOpacity.value));
    }
    if (selectedResolution.value === 'custom') {
      query.set('scale', String(normalizedCustomScalePercent.value));
    }
    if (sanitizedCustomLabel.value) {
      query.set('label', sanitizedCustomLabel.value);
    }
    if (isNonDefaultFont.value) {
      query.set('font', selectedFont.value);
    }
    if (!showTitle.value) {
      query.set('showTitle', '0');
    }
    if (isNonDefaultTextColor.value) {
      query.set('textColor', normalizedTextColor.value);
    }
    if (isNonDefaultCardColor.value) {
      query.set('cardColor', normalizedCardColor.value);
      query.set('cardOpacity', String(normalizedCardOpacity.value));
    }
    if (isNonDefaultBorderColor.value) {
      query.set('borderColor', normalizedBorderColor.value);
      query.set('borderOpacity', String(normalizedBorderOpacity.value));
    }
    if (isNonDefaultTrackColor.value) {
      query.set('trackColor', normalizedTrackColor.value);
      query.set('trackOpacity', String(normalizedTrackOpacity.value));
    }
    return `${appOrigin.value}${overlayPath.value}?${query.toString()}`;
  });
  const apiUrl = computed(() => {
    if (!apiPath.value) return '';
    return `${appOrigin.value}${apiPath.value}`;
  });
  const recommendedWidth = computed(() => {
    if (isSelfContained.value) return 600;
    if (selectedResolution.value === '1440p') return 2560;
    return 1920;
  });
  const recommendedHeight = computed(() => {
    if (isSelfContained.value) return 300;
    if (selectedResolution.value === '1440p') return 1440;
    return 1080;
  });
  const previewDimensionLabel = computed(() => {
    if (isSelfContained.value) return t('streamer_tools.preview_dim_self', 'Widget only');
    return `${recommendedWidth.value} × ${recommendedHeight.value}`;
  });
  const selfContainedPreviewHeight = computed(() => {
    const scale =
      selectedResolution.value === '1440p'
        ? 4 / 3
        : selectedResolution.value === 'custom'
          ? normalizedCustomScalePercent.value / 100
          : 1;
    const sizeMultiplier =
      selectedSize.value === 'sm' ? 0.8 : selectedSize.value === 'lg' ? 1.2 : 1;
    let base: number;
    if (selectedLayout.value === 'text') {
      base = selectedMetric.value === 'summary' ? 100 : 60;
    } else if (selectedLayout.value === 'minimal') {
      base = selectedMetric.value === 'summary' ? 120 : 80;
    } else {
      base = selectedMetric.value === 'summary' ? 280 : 200;
    }
    return Math.round(base * scale * sizeMultiplier + 24);
  });
  const previewHelpText = computed(() => {
    if (isSelfContained.value) {
      return t(
        'streamer_tools.preview_help_self',
        'Shows the widget at its natural size. Position this source anywhere in your OBS/Streamlabs scene by dragging it.'
      );
    }
    return t(
      'streamer_tools.preview_help_canvas',
      'Shows how the overlay appears within a full-screen browser source. The checkered pattern represents transparency — it will not appear on stream.'
    );
  });
  const persistSettings = () => {
    persistedSettings.value = sanitizeStreamerToolsSettings({
      accent: selectedAccent.value,
      align: selectedAlign.value,
      background: selectedBackground.value,
      container: selectedContainer.value,
      borderColor: normalizedBorderColor.value,
      borderOpacity: normalizedBorderOpacity.value,
      cardColor: normalizedCardColor.value,
      cardOpacity: normalizedCardOpacity.value,
      customAccentColor: normalizedCustomAccentColor.value,
      customBackgroundColor: normalizedCustomBackgroundColor.value,
      customBackgroundOpacity: normalizedCustomBackgroundOpacity.value,
      customLabel: customLabel.value,
      customScalePercent: normalizedCustomScalePercent.value,
      font: selectedFont.value,
      intervalMs: intervalMs.value,
      layout: selectedLayout.value,
      metric: selectedMetric.value,
      mode: selectedMode.value,
      resolution: selectedResolution.value,
      showPercent: showPercent.value,
      showRemaining: showRemaining.value,
      showTitle: showTitle.value,
      size: selectedSize.value,
      textColor: normalizedTextColor.value,
      trackColor: normalizedTrackColor.value,
      trackOpacity: normalizedTrackOpacity.value,
    });
  };
  let persistTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedPersist = () => {
    if (persistTimeout) clearTimeout(persistTimeout);
    persistTimeout = setTimeout(() => {
      persistTimeout = null;
      persistSettings();
    }, 400);
  };
  const flushPersist = () => {
    if (!persistTimeout) return;
    clearTimeout(persistTimeout);
    persistTimeout = null;
    persistSettings();
  };
  const resetSettings = () => {
    const defaults = { ...DEFAULT_STREAMER_TOOLS_SETTINGS };
    selectedMode.value = defaults.mode;
    selectedMetric.value = defaults.metric;
    selectedLayout.value = defaults.layout;
    selectedAccent.value = defaults.accent;
    selectedSize.value = defaults.size;
    selectedAlign.value = defaults.align;
    selectedBackground.value = defaults.background;
    selectedContainer.value = defaults.container;
    customAccentColor.value = defaults.customAccentColor;
    selectedResolution.value = defaults.resolution;
    intervalMs.value = defaults.intervalMs;
    customBackgroundColor.value = defaults.customBackgroundColor;
    customBackgroundOpacity.value = defaults.customBackgroundOpacity;
    customScalePercent.value = defaults.customScalePercent;
    showPercent.value = defaults.showPercent;
    showRemaining.value = defaults.showRemaining;
    customLabel.value = defaults.customLabel;
    selectedFont.value = defaults.font;
    showTitle.value = defaults.showTitle;
    textColor.value = defaults.textColor;
    cardColor.value = defaults.cardColor;
    cardOpacity.value = defaults.cardOpacity;
    borderColor.value = defaults.borderColor;
    borderOpacity.value = defaults.borderOpacity;
    trackColor.value = defaults.trackColor;
    trackOpacity.value = defaults.trackOpacity;
    debouncedPersist();
  };
  watch(
    [
      selectedMode,
      selectedMetric,
      selectedLayout,
      selectedAccent,
      customAccentColor,
      selectedSize,
      selectedAlign,
      selectedBackground,
      selectedContainer,
      selectedResolution,
      intervalMs,
      customBackgroundColor,
      customBackgroundOpacity,
      customScalePercent,
      showPercent,
      showRemaining,
      customLabel,
      selectedFont,
      showTitle,
      textColor,
      cardColor,
      cardOpacity,
      borderColor,
      borderOpacity,
      trackColor,
      trackOpacity,
    ],
    debouncedPersist
  );
  onBeforeUnmount(flushPersist);
  return {
    selectedMode,
    selectedMetric,
    selectedLayout,
    selectedAccent,
    selectedSize,
    selectedAlign,
    selectedBackground,
    selectedContainer,
    selectedResolution,
    intervalMs,
    customAccentColor,
    customBackgroundColor,
    customBackgroundOpacity,
    customScalePercent,
    showPercent,
    showRemaining,
    customLabel,
    selectedFont,
    showTitle,
    textColor,
    cardColor,
    cardOpacity,
    borderColor,
    borderOpacity,
    trackColor,
    trackOpacity,
    intervalOptions,
    metricOptions,
    layoutOptions,
    accentOptions,
    sizeOptions,
    resolutionOptions,
    alignOptions,
    backgroundOptions,
    containerOptions,
    fontOptions,
    isCustomAccent,
    isCustomResolution,
    isCustomBackground,
    isSelfContained,
    normalizedCustomBackgroundOpacity,
    normalizedCustomScalePercent,
    normalizedCardOpacity,
    normalizedBorderOpacity,
    normalizedTrackOpacity,
    isNonDefaultTextColor,
    isNonDefaultCardColor,
    isNonDefaultBorderColor,
    isNonDefaultTrackColor,
    isNonDefaultFont,
    isLoggedIn,
    isModePublic,
    overlayUrl,
    apiUrl,
    recommendedWidth,
    recommendedHeight,
    previewDimensionLabel,
    selfContainedPreviewHeight,
    previewHelpText,
    resetSettings,
  };
}
