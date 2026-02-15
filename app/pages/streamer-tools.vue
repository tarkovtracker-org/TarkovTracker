<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-5xl space-y-4">
      <section class="bg-surface-900 rounded-xl border border-white/10 p-4 sm:p-6">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="space-y-2">
            <h1 class="text-2xl font-bold text-white">
              {{ t('streamer_tools.title', 'Streamer Tools') }}
            </h1>
            <p class="text-surface-300 max-w-2xl text-sm sm:text-base">
              {{
                t(
                  'streamer_tools.subtitle',
                  'Generate browser-source links for OBS, Streamlabs Desktop, XSplit, and vMix to show live Kappa progress.'
                )
              }}
            </p>
          </div>
          <UButton
            icon="i-mdi-account-box-outline"
            color="neutral"
            variant="soft"
            size="sm"
            to="/account"
          >
            {{ t('streamer_tools.manage_sharing', 'Manage Sharing') }}
          </UButton>
        </div>
      </section>
      <UAlert
        v-if="!isLoggedIn"
        icon="i-mdi-lock-outline"
        color="warning"
        variant="soft"
        :title="
          t(
            'streamer_tools.login_required',
            'Log in to generate personalized streamer overlay links.'
          )
        "
      >
        <template #description>
          <div class="mt-2">
            <UButton icon="i-mdi-login" color="warning" variant="solid" to="/login">
              {{ t('navigation_drawer.login', 'Log In') }}
            </UButton>
          </div>
        </template>
      </UAlert>
      <template v-else>
        <UAlert
          v-if="!isModePublic"
          icon="i-mdi-alert-outline"
          color="warning"
          variant="soft"
          :title="
            t(
              'streamer_tools.mode_private',
              'This game mode is private. Public sharing must be enabled for browser-source links to work.'
            )
          "
        >
          <template #description>
            <div class="mt-2">
              <UButton icon="i-mdi-account-cog" color="warning" variant="solid" to="/account">
                {{ t('streamer_tools.open_account_settings', 'Open Account Settings') }}
              </UButton>
            </div>
          </template>
        </UAlert>
        <GenericCard
          icon="i-mdi-tune-variant"
          highlight-color="primary"
          :fill-height="false"
          :title="t('streamer_tools.content_title', 'Content')"
          title-classes="text-lg font-semibold"
        >
          <template #content>
            <div class="space-y-4 p-4">
              <article class="space-y-2">
                <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                  {{ t('streamer_tools.mode_label', 'Game Mode') }}
                </p>
                <div class="flex rounded-md border border-white/10 p-1">
                  <button
                    type="button"
                    class="flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors"
                    :class="
                      selectedMode === GAME_MODES.PVP
                        ? 'bg-pvp-800 text-pvp-100'
                        : 'text-pvp-300 hover:bg-pvp-950/60'
                    "
                    @click="selectedMode = GAME_MODES.PVP"
                  >
                    PvP
                  </button>
                  <button
                    type="button"
                    class="flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors"
                    :class="
                      selectedMode === GAME_MODES.PVE
                        ? 'bg-pve-700 text-pve-100'
                        : 'text-pve-300 hover:bg-pve-950/60'
                    "
                    @click="selectedMode = GAME_MODES.PVE"
                  >
                    PvE
                  </button>
                </div>
              </article>
              <article class="space-y-2">
                <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                  {{ t('streamer_tools.metric_label', 'Widget') }}
                </p>
                <div class="grid gap-3 sm:grid-cols-3">
                  <button
                    v-for="option in metricOptions"
                    :key="option.value"
                    type="button"
                    class="rounded-md border px-3 py-2 text-left transition-colors"
                    :class="
                      selectedMetric === option.value
                        ? 'border-primary-400 bg-primary-800/30 text-primary-100'
                        : 'text-surface-200 hover:bg-surface-800/80 border-white/10'
                    "
                    @click="selectedMetric = option.value"
                  >
                    <div class="text-sm font-semibold">{{ option.label }}</div>
                    <div class="text-surface-400 text-xs">{{ option.description }}</div>
                  </button>
                </div>
              </article>
            </div>
          </template>
        </GenericCard>
        <GenericCard
          icon="i-mdi-palette-outline"
          highlight-color="accent"
          :fill-height="false"
          :title="t('streamer_tools.appearance_title', 'Appearance')"
          title-classes="text-lg font-semibold"
        >
          <template #content>
            <details open class="p-4">
              <summary class="text-surface-300 cursor-pointer text-sm font-semibold select-none">
                {{ t('streamer_tools.customize_options', 'Customize overlay options') }}
              </summary>
              <div class="mt-4 space-y-4">
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <article class="space-y-2">
                    <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.layout_label', 'Layout') }}
                    </p>
                    <SelectMenuFixed
                      v-model="selectedLayout"
                      :items="layoutOptions"
                      value-key="value"
                    />
                  </article>
                  <article class="space-y-2">
                    <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.accent_label', 'Accent') }}
                    </p>
                    <SelectMenuFixed
                      v-model="selectedAccent"
                      :items="accentOptions"
                      value-key="value"
                    />
                  </article>
                  <article class="space-y-2">
                    <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.text_size', 'Text Size') }}
                    </p>
                    <SelectMenuFixed
                      v-model="selectedSize"
                      :items="sizeOptions"
                      value-key="value"
                    />
                  </article>
                  <article class="space-y-2">
                    <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.align_label', 'Alignment') }}
                    </p>
                    <SelectMenuFixed
                      v-model="selectedAlign"
                      :items="alignOptions"
                      value-key="value"
                    />
                  </article>
                  <article class="space-y-2">
                    <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.refresh_label', 'Refresh Interval') }}
                    </p>
                    <SelectMenuFixed
                      v-model="intervalMs"
                      :items="intervalOptions"
                      value-key="value"
                    />
                  </article>
                </div>
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <article class="space-y-2">
                    <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.background_label', 'Background') }}
                    </p>
                    <label
                      class="bg-surface-900 flex cursor-pointer items-center justify-between rounded-md border border-white/10 px-3 py-2"
                    >
                      <span class="text-surface-200 text-sm">
                        {{ t('streamer_tools.transparent_background', 'Transparent') }}
                      </span>
                      <USwitch v-model="transparentBackground" />
                    </label>
                  </article>
                  <article class="space-y-2">
                    <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.show_percent', 'Show percent') }}
                    </p>
                    <label
                      class="bg-surface-900 flex cursor-pointer items-center justify-between rounded-md border border-white/10 px-3 py-2"
                    >
                      <span class="text-surface-200 text-sm">
                        {{ t('streamer_tools.show_percent', 'Show percent') }}
                      </span>
                      <USwitch v-model="showPercent" />
                    </label>
                  </article>
                  <article class="space-y-2">
                    <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.show_remaining', 'Show remaining') }}
                    </p>
                    <label
                      class="bg-surface-900 flex cursor-pointer items-center justify-between rounded-md border border-white/10 px-3 py-2"
                    >
                      <span class="text-surface-200 text-sm">
                        {{ t('streamer_tools.show_remaining', 'Show remaining') }}
                      </span>
                      <USwitch v-model="showRemaining" />
                    </label>
                  </article>
                  <article class="space-y-2">
                    <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.custom_label', 'Custom Label') }}
                    </p>
                    <UInput
                      v-model="customLabel"
                      :placeholder="
                        t(
                          'streamer_tools.custom_label_placeholder',
                          'Optional title for your overlay'
                        )
                      "
                      :maxlength="60"
                    />
                  </article>
                </div>
              </div>
            </details>
          </template>
        </GenericCard>
        <GenericCard
          icon="i-mdi-monitor-eye"
          highlight-color="kappa"
          :fill-height="false"
          :title="t('streamer_tools.your_overlay_title', 'Your Overlay')"
          title-classes="text-lg font-semibold"
        >
          <template #content>
            <div class="space-y-4 p-4">
              <article class="space-y-2">
                <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                  {{ t('streamer_tools.preview', 'Preview') }}
                </p>
                <div
                  class="bg-surface-950/70 rounded-lg border border-white/10 p-2"
                  :class="previewAspectClass"
                >
                  <iframe
                    :src="overlayUrl"
                    class="h-full w-full rounded-md border-0"
                    loading="lazy"
                    :title="t('streamer_tools.preview_title', 'Streamer overlay preview')"
                  ></iframe>
                </div>
              </article>
              <article class="space-y-2">
                <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                  {{ t('streamer_tools.browser_source_url', 'Browser Source URL') }}
                </p>
                <div class="flex flex-col gap-2 sm:flex-row">
                  <UInput :model-value="overlayUrl" readonly class="flex-1" />
                  <UButton
                    icon="i-mdi-content-copy"
                    color="primary"
                    variant="solid"
                    class="sm:w-36 sm:justify-center"
                    @click="copyOverlayUrl"
                  >
                    {{ t('streamer_tools.copy_link', 'Copy Link') }}
                  </UButton>
                </div>
              </article>
              <div class="flex flex-wrap gap-2">
                <UButton
                  :to="overlayUrl"
                  target="_blank"
                  rel="noopener"
                  icon="i-mdi-open-in-new"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  :disabled="!overlayUrl"
                >
                  {{ t('streamer_tools.open_overlay', 'Open Overlay') }}
                </UButton>
                <UButton
                  :to="apiUrl"
                  target="_blank"
                  rel="noopener"
                  icon="i-mdi-api"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  :disabled="!apiUrl"
                >
                  {{ t('streamer_tools.open_json', 'Open JSON') }}
                </UButton>
              </div>
            </div>
          </template>
        </GenericCard>
        <GenericCard
          icon="i-mdi-broadcast"
          highlight-color="info"
          :fill-height="false"
          :title="t('streamer_tools.setup_title', 'Platform Setup')"
          :subtitle="
            t(
              'streamer_tools.setup_subtitle',
              'Browser-source settings that align with OBS and major streaming tools.'
            )
          "
        >
          <template #content>
            <details class="space-y-3 p-4 text-sm">
              <summary class="text-surface-300 cursor-pointer text-sm font-semibold select-none">
                {{
                  t('streamer_tools.platform_instructions', 'View platform-specific instructions')
                }}
              </summary>
              <div class="mt-3 space-y-3">
                <div class="bg-surface-900 rounded-md border border-white/10 p-3">
                  <p class="text-surface-200 font-semibold">OBS Studio</p>
                  <p class="text-surface-400 mt-1">
                    {{
                      t(
                        'streamer_tools.obs_steps',
                        'Add Browser Source, paste URL, set your scene width/height, enable "Shutdown source when not visible", and use "Refresh browser when scene becomes active" when needed.'
                      )
                    }}
                  </p>
                </div>
                <div class="bg-surface-900 rounded-md border border-white/10 p-3">
                  <p class="text-surface-200 font-semibold">Streamlabs Desktop</p>
                  <p class="text-surface-400 mt-1">
                    {{
                      t(
                        'streamer_tools.streamlabs_steps',
                        'Use Browser Source with the same URL and dimensions. Match FPS to your stream profile and keep source shutdown enabled when hidden.'
                      )
                    }}
                  </p>
                </div>
                <div class="bg-surface-900 rounded-md border border-white/10 p-3">
                  <p class="text-surface-200 font-semibold">XSplit / vMix</p>
                  <p class="text-surface-400 mt-1">
                    {{
                      t(
                        'streamer_tools.other_steps',
                        'Add a webpage/browser input, paste URL, keep transparency enabled, and set dimensions to match your scene layout.'
                      )
                    }}
                  </p>
                </div>
              </div>
            </details>
          </template>
        </GenericCard>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  type OverlayMetric = 'items' | 'summary' | 'tasks';
  type OverlayAccent = 'info' | 'kappa' | 'success' | 'warning';
  type OverlayAlign = 'center' | 'left' | 'right';
  type OverlayLayout = 'card' | 'minimal' | 'text';
  type OverlaySize = 'lg' | 'md' | 'sm';
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
  const { t } = useI18n({ useScope: 'global' });
  const { copyToClipboard } = useCopyToClipboard();
  const toast = useToast();
  const preferencesStore = usePreferencesStore();
  const { $supabase } = useNuxtApp();
  const runtimeConfig = useRuntimeConfig();
  const selectedMode = ref<GameMode>(GAME_MODES.PVP);
  const selectedMetric = ref<OverlayMetric>('tasks');
  const selectedLayout = ref<OverlayLayout>('card');
  const selectedAccent = ref<OverlayAccent>('kappa');
  const selectedSize = ref<OverlaySize>('md');
  const selectedAlign = ref<OverlayAlign>('left');
  const intervalMs = ref<number>(60000);
  const transparentBackground = ref(false);
  const showPercent = ref(true);
  const showRemaining = ref(true);
  const customLabel = ref('');
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
    { label: t('streamer_tools.accent_kappa', 'Kappa (Amber)'), value: 'kappa' },
    { label: t('streamer_tools.accent_info', 'Info (Cyan)'), value: 'info' },
    { label: t('streamer_tools.accent_success', 'Success (Green)'), value: 'success' },
    { label: t('streamer_tools.accent_warning', 'Warning (Orange)'), value: 'warning' },
  ]);
  const sizeOptions = computed<SelectOption<OverlaySize>[]>(() => [
    { label: t('streamer_tools.size_sm', 'Small'), value: 'sm' },
    { label: t('streamer_tools.size_md', 'Medium'), value: 'md' },
    { label: t('streamer_tools.size_lg', 'Large'), value: 'lg' },
  ]);
  const alignOptions = computed<SelectOption<OverlayAlign>[]>(() => [
    { label: t('streamer_tools.align_left', 'Left'), value: 'left' },
    { label: t('streamer_tools.align_center', 'Center'), value: 'center' },
    { label: t('streamer_tools.align_right', 'Right'), value: 'right' },
  ]);
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
    if (import.meta.client && typeof window !== 'undefined') {
      return window.location.origin;
    }
    const configured = runtimeConfig.public.appUrl;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return configured.replace(/\/$/, '');
    }
    return '';
  });
  const overlayPath = computed(() => {
    if (!currentUserId.value) {
      return '';
    }
    return `/overlay/kappa/${currentUserId.value}/${selectedMode.value}`;
  });
  const apiPath = computed(() => {
    if (!currentUserId.value) {
      return '';
    }
    return `/api/streamer/${currentUserId.value}/${selectedMode.value}/kappa`;
  });
  const sanitizedCustomLabel = computed(() => customLabel.value.trim().slice(0, 60));
  const overlayUrl = computed(() => {
    if (!overlayPath.value) {
      return '';
    }
    const query = new URLSearchParams({
      accent: selectedAccent.value,
      align: selectedAlign.value,
      interval: String(intervalMs.value),
      layout: selectedLayout.value,
      metric: selectedMetric.value,
      showPercent: showPercent.value ? '1' : '0',
      showRemaining: showRemaining.value ? '1' : '0',
      size: selectedSize.value,
    });
    if (transparentBackground.value) {
      query.set('transparent', '1');
    }
    if (sanitizedCustomLabel.value) {
      query.set('label', sanitizedCustomLabel.value);
    }
    return `${appOrigin.value}${overlayPath.value}?${query.toString()}`;
  });
  const apiUrl = computed(() => {
    if (!apiPath.value) {
      return '';
    }
    return `${appOrigin.value}${apiPath.value}`;
  });
  const previewAspectClass = computed(() => {
    if (selectedLayout.value === 'text') {
      return 'aspect-[16/3]';
    }
    if (selectedLayout.value === 'minimal') {
      return 'aspect-[16/3.5]';
    }
    return 'aspect-[16/5]';
  });
  const copyOverlayUrl = async () => {
    if (!overlayUrl.value) {
      return;
    }
    await copyToClipboard(overlayUrl.value);
    toast.add({
      color: 'success',
      title: t('streamer_tools.copy_success', 'Overlay URL copied'),
    });
  };
  useSeoMeta({
    description:
      'Generate browser-source overlays for stream software to display Tarkov Kappa progress.',
    title: 'Streamer Tools',
  });
</script>
