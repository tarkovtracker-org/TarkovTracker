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
              <div class="mt-3 flex justify-end">
                <UButton
                  icon="i-mdi-restore"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  @click="resetStreamerToolsSettings"
                >
                  {{ t('streamer_tools.reset_defaults', 'Reset Defaults') }}
                </UButton>
              </div>
              <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <SelectMenuFixed v-model="selectedSize" :items="sizeOptions" value-key="value" />
                </article>
                <article class="space-y-2">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.resolution_label', 'Resolution') }}
                  </p>
                  <SelectMenuFixed
                    v-model="selectedResolution"
                    :items="resolutionOptions"
                    value-key="value"
                  />
                </article>
                <article class="space-y-2">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.container_label', 'Container') }}
                  </p>
                  <SelectMenuFixed
                    v-model="selectedContainer"
                    :items="containerOptions"
                    value-key="value"
                  />
                </article>
                <article v-if="!isSelfContained" class="space-y-2">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.align_label', 'Alignment') }}
                  </p>
                  <SelectMenuFixed
                    v-model="selectedAlign"
                    :items="alignOptions"
                    value-key="value"
                  />
                </article>
                <article v-if="isSelfContained" class="space-y-2 sm:col-span-2 lg:col-span-3">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.self_contained_hint_label', 'Self Contained') }}
                  </p>
                  <p class="text-surface-400 text-xs">
                    {{
                      t(
                        'streamer_tools.self_contained_hint',
                        'Outputs only the widget bounds. Move the browser source in OBS/Streamlabs instead of changing overlay alignment.'
                      )
                    }}
                  </p>
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
                <article class="space-y-2">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.background_label', 'Background') }}
                  </p>
                  <SelectMenuFixed
                    v-model="selectedBackground"
                    :items="backgroundOptions"
                    value-key="value"
                  />
                </article>
                <article class="space-y-2">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.font_label', 'Font') }}
                  </p>
                  <SelectMenuFixed v-model="selectedFont" :items="fontOptions" value-key="value" />
                </article>
                <article class="space-y-2">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.show_title', 'Show title') }}
                  </p>
                  <label
                    class="flex h-9 cursor-pointer items-center justify-between rounded-md border border-white/10 px-3"
                  >
                    <span class="text-surface-200 text-sm">
                      {{ t('streamer_tools.show_title', 'Show title') }}
                    </span>
                    <USwitch v-model="showTitle" />
                  </label>
                </article>
                <article class="space-y-2">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.show_percent', 'Show percent') }}
                  </p>
                  <label
                    class="flex h-9 cursor-pointer items-center justify-between rounded-md border border-white/10 px-3"
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
                    class="flex h-9 cursor-pointer items-center justify-between rounded-md border border-white/10 px-3"
                  >
                    <span class="text-surface-200 text-sm">
                      {{ t('streamer_tools.show_remaining', 'Show remaining') }}
                    </span>
                    <USwitch v-model="showRemaining" />
                  </label>
                </article>
                <article class="space-y-2 sm:col-span-2 lg:col-span-3">
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
                <article v-if="isCustomAccent" class="space-y-2">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.custom_accent', 'Custom Accent') }}
                  </p>
                  <input
                    v-model="customAccentColor"
                    type="color"
                    class="border-surface-700 bg-surface-850 h-9 w-full cursor-pointer rounded border px-1"
                  />
                </article>
                <article v-if="isCustomBackground" class="space-y-2 sm:col-span-2 lg:col-span-3">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.custom_background', 'Custom Background') }}
                  </p>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="space-y-1">
                      <label class="text-surface-200 block text-xs font-medium">
                        {{ t('streamer_tools.background_color', 'Color') }}
                      </label>
                      <input
                        v-model="customBackgroundColor"
                        type="color"
                        class="border-surface-700 bg-surface-850 h-9 w-full cursor-pointer rounded border px-1"
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-surface-200 block text-xs font-medium">
                        {{
                          t('streamer_tools.background_opacity', 'Opacity') +
                          ` (${normalizedCustomBackgroundOpacity}%)`
                        }}
                      </label>
                      <input
                        v-model.number="customBackgroundOpacity"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        class="accent-primary-500 mt-2 w-full"
                      />
                    </div>
                  </div>
                </article>
                <article v-if="isCustomResolution" class="space-y-2 sm:col-span-2 lg:col-span-3">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.custom_scale', 'Custom Scale') }}
                  </p>
                  <div class="max-w-sm space-y-1">
                    <label class="text-surface-200 block text-xs font-medium">
                      {{
                        t('streamer_tools.custom_scale_percent', 'Scale') +
                        ` (${normalizedCustomScalePercent}%)`
                      }}
                    </label>
                    <input
                      v-model.number="customScalePercent"
                      type="range"
                      min="50"
                      max="250"
                      step="1"
                      class="accent-primary-500 w-full"
                    />
                  </div>
                </article>
                <article class="space-y-4 sm:col-span-2 lg:col-span-3">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.colors_label', 'Colors') }}
                  </p>
                  <div class="border-surface-700 space-y-4 rounded-lg border p-3">
                    <p class="text-surface-400 text-[11px] font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.colors_text', 'Text') }}
                    </p>
                    <div class="space-y-1">
                      <label class="text-surface-200 block text-xs font-medium">
                        {{ t('streamer_tools.text_color', 'Text Color') }}
                      </label>
                      <input
                        v-model="textColor"
                        type="color"
                        class="border-surface-700 bg-surface-850 h-9 w-full max-w-xs cursor-pointer rounded border px-1"
                      />
                    </div>
                  </div>
                  <div class="border-surface-700 space-y-4 rounded-lg border p-3">
                    <p class="text-surface-400 text-[11px] font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.colors_card', 'Card') }}
                    </p>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div class="space-y-1">
                        <label class="text-surface-200 block text-xs font-medium">
                          {{ t('streamer_tools.card_color', 'Card Color') }}
                        </label>
                        <input
                          v-model="cardColor"
                          type="color"
                          class="border-surface-700 bg-surface-850 h-9 w-full cursor-pointer rounded border px-1"
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-surface-200 block text-xs font-medium">
                          {{
                            t('streamer_tools.card_opacity', 'Card Opacity') +
                            ` (${normalizedCardOpacity}%)`
                          }}
                        </label>
                        <input
                          v-model.number="cardOpacity"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          class="accent-primary-500 mt-2 w-full"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="border-surface-700 space-y-4 rounded-lg border p-3">
                    <p class="text-surface-400 text-[11px] font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.colors_border', 'Border') }}
                    </p>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div class="space-y-1">
                        <label class="text-surface-200 block text-xs font-medium">
                          {{ t('streamer_tools.border_color', 'Border Color') }}
                        </label>
                        <input
                          v-model="borderColor"
                          type="color"
                          class="border-surface-700 bg-surface-850 h-9 w-full cursor-pointer rounded border px-1"
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-surface-200 block text-xs font-medium">
                          {{
                            t('streamer_tools.border_opacity', 'Border Opacity') +
                            ` (${normalizedBorderOpacity}%)`
                          }}
                        </label>
                        <input
                          v-model.number="borderOpacity"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          class="accent-primary-500 mt-2 w-full"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="border-surface-700 space-y-4 rounded-lg border p-3">
                    <p class="text-surface-400 text-[11px] font-semibold tracking-wider uppercase">
                      {{ t('streamer_tools.colors_progress', 'Progress Track') }}
                    </p>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div class="space-y-1">
                        <label class="text-surface-200 block text-xs font-medium">
                          {{ t('streamer_tools.track_color', 'Progress Track') }}
                        </label>
                        <input
                          v-model="trackColor"
                          type="color"
                          class="border-surface-700 bg-surface-850 h-9 w-full cursor-pointer rounded border px-1"
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-surface-200 block text-xs font-medium">
                          {{
                            t('streamer_tools.track_opacity', 'Track Opacity') +
                            ` (${normalizedTrackOpacity}%)`
                          }}
                        </label>
                        <input
                          v-model.number="trackOpacity"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          class="accent-primary-500 mt-2 w-full"
                        />
                      </div>
                    </div>
                  </div>
                </article>
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
                <div class="flex items-center justify-between">
                  <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
                    {{ t('streamer_tools.preview', 'Preview') }}
                  </p>
                  <span class="text-surface-500 text-xs">
                    {{ previewDimensionLabel }}
                  </span>
                </div>
                <div
                  class="relative overflow-hidden rounded-lg border border-white/10"
                  :class="isSelfContained ? 'bg-surface-950/70 p-3' : 'aspect-video'"
                >
                  <div
                    v-if="!isSelfContained"
                    class="absolute inset-0"
                    :style="{
                      backgroundImage:
                        'linear-gradient(45deg, var(--color-checker-dark) 25%, transparent 25%), linear-gradient(-45deg, var(--color-checker-dark) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-checker-dark) 75%), linear-gradient(-45deg, transparent 75%, var(--color-checker-dark) 75%)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
                      backgroundColor: 'var(--color-checker-bg)',
                    }"
                  />
                  <iframe
                    :src="overlayUrl"
                    class="relative w-full border-0"
                    :class="isSelfContained ? 'rounded-md' : 'h-full'"
                    :style="
                      isSelfContained ? { height: selfContainedPreviewHeight + 'px' } : undefined
                    "
                    loading="lazy"
                    :title="t('streamer_tools.preview_title', 'Streamer overlay preview')"
                  ></iframe>
                </div>
                <p class="text-surface-500 text-xs">
                  {{ previewHelpText }}
                </p>
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
            <div class="space-y-4 p-4">
              <div class="bg-surface-900 rounded-md border border-white/10 p-4">
                <div class="flex items-center gap-2">
                  <UIcon name="i-mdi-information-outline" class="text-primary-400 shrink-0" />
                  <p class="text-surface-200 text-sm font-semibold">
                    {{
                      isSelfContained
                        ? t(
                            'streamer_tools.setup_mode_self_contained',
                            'Self Contained mode — widget-sized source'
                          )
                        : t(
                            'streamer_tools.setup_mode_canvas',
                            'Scene Canvas mode — full-resolution source'
                          )
                    }}
                  </p>
                </div>
                <p class="text-surface-400 mt-2 text-sm">
                  {{
                    isSelfContained
                      ? t(
                          'streamer_tools.setup_mode_self_contained_desc',
                          'The browser source outputs only the widget. Drag and resize the source anywhere in your scene to position it.'
                        )
                      : t(
                          'streamer_tools.setup_mode_canvas_desc',
                          'The browser source fills your entire stream canvas. The widget is positioned automatically based on the Alignment setting above. Set the source dimensions to match your stream resolution.'
                        )
                  }}
                </p>
              </div>
              <details open class="text-sm">
                <summary class="text-surface-300 cursor-pointer text-sm font-semibold select-none">
                  OBS Studio / Streamlabs Desktop
                </summary>
                <ol class="text-surface-400 mt-3 list-inside list-decimal space-y-2 pl-1">
                  <li>
                    {{
                      t(
                        'streamer_tools.obs_step_1',
                        'In your scene, click + under Sources and select Browser.'
                      )
                    }}
                  </li>
                  <li>
                    {{
                      t(
                        'streamer_tools.obs_step_2',
                        'Paste the Browser Source URL from above into the URL field.'
                      )
                    }}
                  </li>
                  <li>
                    <span>
                      {{ t('streamer_tools.obs_step_3_prefix', 'Set Width and Height to') }}
                    </span>
                    <span class="text-primary-300 font-semibold">
                      {{ ` ${recommendedWidth} × ${recommendedHeight}` }}
                    </span>
                    <span v-if="!isSelfContained" class="text-surface-500">
                      {{
                        ' ' +
                        t(
                          'streamer_tools.obs_step_3_canvas_note',
                          '(must match your stream resolution).'
                        )
                      }}
                    </span>
                    <span v-else class="text-surface-500">
                      {{
                        ' ' +
                        t(
                          'streamer_tools.obs_step_3_self_note',
                          '(or any size that fits your layout).'
                        )
                      }}
                    </span>
                  </li>
                  <li v-if="!isSelfContained">
                    {{
                      t(
                        'streamer_tools.obs_step_4_canvas',
                        'Use Edit > Transform > Center on Screen (or Ctrl+D) to center the source in your scene.'
                      )
                    }}
                  </li>
                  <li v-else>
                    {{
                      t(
                        'streamer_tools.obs_step_4_self',
                        'Drag the source to your desired position in the scene preview.'
                      )
                    }}
                  </li>
                  <li>
                    {{
                      t(
                        'streamer_tools.obs_step_5',
                        'Recommended: check "Shutdown source when not visible" and "Refresh browser when scene becomes active".'
                      )
                    }}
                  </li>
                </ol>
              </details>
              <details class="text-sm">
                <summary class="text-surface-300 cursor-pointer text-sm font-semibold select-none">
                  XSplit / vMix
                </summary>
                <ol class="text-surface-400 mt-3 list-inside list-decimal space-y-2 pl-1">
                  <li>
                    {{ t('streamer_tools.xsplit_step_1', 'Add a Webpage / Browser input source.') }}
                  </li>
                  <li>
                    {{
                      t('streamer_tools.xsplit_step_2', 'Paste the Browser Source URL from above.')
                    }}
                  </li>
                  <li>
                    <span>
                      {{ t('streamer_tools.obs_step_3_prefix', 'Set Width and Height to') }}
                    </span>
                    <span class="text-primary-300 font-semibold">
                      {{ ` ${recommendedWidth} × ${recommendedHeight}` }}
                    </span>
                  </li>
                  <li>
                    {{
                      t(
                        'streamer_tools.xsplit_step_4',
                        'Ensure transparency is enabled in the source properties.'
                      )
                    }}
                  </li>
                </ol>
              </details>
              <div class="rounded-md border border-amber-500/30 bg-amber-950/30 px-3 py-2">
                <div class="flex gap-2">
                  <UIcon name="i-mdi-alert-outline" class="mt-0.5 shrink-0 text-amber-400" />
                  <div class="space-y-1">
                    <p class="text-xs font-semibold text-amber-300">
                      {{
                        t(
                          'streamer_tools.setup_scaling_warning_title',
                          'Avoid resizing the source in OBS'
                        )
                      }}
                    </p>
                    <p class="text-xs text-amber-400/80">
                      {{
                        t(
                          'streamer_tools.setup_scaling_warning',
                          'Dragging the source handles to make it larger in OBS will stretch the image and cause heavy blur. To change the widget size, use the Resolution, Text Size, or Custom Scale settings on this page instead — the overlay re-renders at native quality.'
                        )
                      }}
                    </p>
                  </div>
                </div>
              </div>
              <div class="bg-surface-900/60 rounded-md border border-white/5 px-3 py-2">
                <p class="text-surface-500 text-xs">
                  {{
                    t(
                      'streamer_tools.setup_transparency_note',
                      'The overlay background is transparent by default. No Custom CSS or color-key filters are needed — OBS and Streamlabs support transparent browser sources natively.'
                    )
                  }}
                </p>
              </div>
            </div>
          </template>
        </GenericCard>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useStorage } from '@vueuse/core';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  type OverlayMetric = 'items' | 'summary' | 'tasks';
  type OverlayAccent = 'custom' | 'info' | 'kappa' | 'success' | 'warning';
  type OverlayAlign =
    | 'bottom-center'
    | 'bottom-left'
    | 'bottom-right'
    | 'center'
    | 'center-left'
    | 'center-right'
    | 'top-center'
    | 'top-left'
    | 'top-right';
  type OverlayBackground = 'custom' | 'transparent';
  type OverlayContainer = 'canvas' | 'self-contained';
  type OverlayLayout = 'card' | 'minimal' | 'text';
  type OverlayResolution = '1080p' | '1440p' | 'custom';
  type OverlaySize = 'lg' | 'md' | 'sm';
  type OverlayFont = 'inter' | 'oswald' | 'outfit' | 'poppins' | 'rajdhani' | 'roboto-mono';
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
  interface StreamerToolsSettings {
    accent: OverlayAccent;
    align: OverlayAlign;
    background: OverlayBackground;
    container: OverlayContainer;
    borderColor: string;
    borderOpacity: number;
    cardColor: string;
    cardOpacity: number;
    customAccentColor: string;
    customBackgroundColor: string;
    customBackgroundOpacity: number;
    customLabel: string;
    customScalePercent: number;
    font: OverlayFont;
    intervalMs: number;
    layout: OverlayLayout;
    metric: OverlayMetric;
    mode: GameMode;
    resolution: OverlayResolution;
    showPercent: boolean;
    showRemaining: boolean;
    showTitle: boolean;
    size: OverlaySize;
    textColor: string;
    trackColor: string;
    trackOpacity: number;
  }
  const STREAMER_TOOLS_SETTINGS_STORAGE_KEY = 'streamer_tools:overlay_settings:v1';
  const DEFAULT_STREAMER_TOOLS_SETTINGS: StreamerToolsSettings = {
    accent: 'kappa',
    align: 'bottom-left',
    background: 'transparent',
    container: 'canvas',
    borderColor: '#ffffff',
    borderOpacity: 12,
    cardColor: '#0f172a',
    cardOpacity: 45,
    customAccentColor: '#e61919',
    customBackgroundColor: '#0f172a',
    customBackgroundOpacity: 88,
    customLabel: '',
    customScalePercent: 100,
    font: 'rajdhani',
    intervalMs: 60000,
    layout: 'card',
    metric: 'tasks',
    mode: GAME_MODES.PVP,
    resolution: '1080p',
    showPercent: true,
    showRemaining: true,
    showTitle: true,
    size: 'md',
    textColor: '#ffffff',
    trackColor: '#94a3b8',
    trackOpacity: 20,
  };
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;
  const sanitizeMode = (value: unknown): GameMode => {
    if (value === GAME_MODES.PVE || value === GAME_MODES.PVP) {
      return value;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.mode;
  };
  const sanitizeMetric = (value: unknown): OverlayMetric => {
    if (value === 'items' || value === 'summary' || value === 'tasks') {
      return value;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.metric;
  };
  const sanitizeLayout = (value: unknown): OverlayLayout => {
    if (value === 'card' || value === 'minimal' || value === 'text') {
      return value;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.layout;
  };
  const sanitizeAccent = (value: unknown): OverlayAccent => {
    if (
      value === 'custom' ||
      value === 'info' ||
      value === 'kappa' ||
      value === 'success' ||
      value === 'warning'
    ) {
      return value;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.accent;
  };
  const sanitizeSize = (value: unknown): OverlaySize => {
    if (value === 'sm' || value === 'md' || value === 'lg') {
      return value;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.size;
  };
  const VALID_ALIGNS = new Set<OverlayAlign>([
    'top-left',
    'top-center',
    'top-right',
    'center-left',
    'center',
    'center-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ]);
  const LEGACY_ALIGN_MAP: Record<string, OverlayAlign> = {
    left: 'bottom-left',
    center: 'bottom-center',
    right: 'bottom-right',
  };
  const sanitizeAlign = (value: unknown): OverlayAlign => {
    if (typeof value === 'string' && VALID_ALIGNS.has(value as OverlayAlign)) {
      return value as OverlayAlign;
    }
    if (typeof value === 'string' && value in LEGACY_ALIGN_MAP) {
      return LEGACY_ALIGN_MAP[value] as OverlayAlign;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.align;
  };
  const sanitizeBackground = (value: unknown): OverlayBackground => {
    if (value === 'custom') {
      return value;
    }
    return 'transparent';
  };
  const sanitizeContainer = (value: unknown): OverlayContainer => {
    if (value === 'self-contained') {
      return value;
    }
    return 'canvas';
  };
  const sanitizeIntervalMs = (value: unknown): number => {
    if (value === 60000 || value === 120000 || value === 300000 || value === 600000) {
      return value;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.intervalMs;
  };
  const sanitizeResolution = (value: unknown): OverlayResolution => {
    if (value === '1440p' || value === 'custom') {
      return value;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.resolution;
  };
  const sanitizeCustomScalePercent = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_STREAMER_TOOLS_SETTINGS.customScalePercent;
    }
    return Math.min(250, Math.max(50, Math.round(numeric)));
  };
  const sanitizeHexColor = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') {
      return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(normalized)) {
      return normalized;
    }
    return fallback;
  };
  const sanitizeCustomBackgroundColor = (value: unknown): string => {
    if (typeof value !== 'string') {
      return DEFAULT_STREAMER_TOOLS_SETTINGS.customBackgroundColor;
    }
    const normalized = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(normalized)) {
      return normalized;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.customBackgroundColor;
  };
  const sanitizeCustomBackgroundOpacity = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_STREAMER_TOOLS_SETTINGS.customBackgroundOpacity;
    }
    return Math.min(100, Math.max(0, Math.round(numeric)));
  };
  const sanitizeCustomLabel = (value: unknown): string => {
    if (typeof value !== 'string') {
      return DEFAULT_STREAMER_TOOLS_SETTINGS.customLabel;
    }
    return value.slice(0, 60);
  };
  const VALID_FONTS = new Set<OverlayFont>([
    'inter',
    'oswald',
    'outfit',
    'poppins',
    'rajdhani',
    'roboto-mono',
  ]);
  const sanitizeFont = (value: unknown): OverlayFont => {
    if (typeof value === 'string' && VALID_FONTS.has(value as OverlayFont)) {
      return value as OverlayFont;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.font;
  };
  const sanitizeOpacity = (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(100, Math.max(0, Math.round(numeric)));
  };
  const sanitizeSettings = (value: unknown): StreamerToolsSettings => {
    if (!isObject(value)) {
      return { ...DEFAULT_STREAMER_TOOLS_SETTINGS };
    }
    return {
      accent: sanitizeAccent(value.accent),
      align: sanitizeAlign(value.align),
      background: sanitizeBackground(value.background),
      container: sanitizeContainer(value.container),
      borderColor: sanitizeHexColor(value.borderColor, DEFAULT_STREAMER_TOOLS_SETTINGS.borderColor),
      borderOpacity: sanitizeOpacity(
        value.borderOpacity,
        DEFAULT_STREAMER_TOOLS_SETTINGS.borderOpacity
      ),
      cardColor: sanitizeHexColor(value.cardColor, DEFAULT_STREAMER_TOOLS_SETTINGS.cardColor),
      cardOpacity: sanitizeOpacity(value.cardOpacity, DEFAULT_STREAMER_TOOLS_SETTINGS.cardOpacity),
      customAccentColor: sanitizeHexColor(
        value.customAccentColor,
        DEFAULT_STREAMER_TOOLS_SETTINGS.customAccentColor
      ),
      customBackgroundColor: sanitizeCustomBackgroundColor(value.customBackgroundColor),
      customBackgroundOpacity: sanitizeCustomBackgroundOpacity(value.customBackgroundOpacity),
      customLabel: sanitizeCustomLabel(value.customLabel),
      customScalePercent: sanitizeCustomScalePercent(value.customScalePercent),
      font: sanitizeFont(value.font),
      intervalMs: sanitizeIntervalMs(value.intervalMs),
      layout: sanitizeLayout(value.layout),
      metric: sanitizeMetric(value.metric),
      mode: sanitizeMode(value.mode),
      resolution: sanitizeResolution(value.resolution),
      showPercent:
        typeof value.showPercent === 'boolean'
          ? value.showPercent
          : DEFAULT_STREAMER_TOOLS_SETTINGS.showPercent,
      showRemaining:
        typeof value.showRemaining === 'boolean'
          ? value.showRemaining
          : DEFAULT_STREAMER_TOOLS_SETTINGS.showRemaining,
      showTitle:
        typeof value.showTitle === 'boolean'
          ? value.showTitle
          : DEFAULT_STREAMER_TOOLS_SETTINGS.showTitle,
      size: sanitizeSize(value.size),
      textColor: sanitizeHexColor(value.textColor, DEFAULT_STREAMER_TOOLS_SETTINGS.textColor),
      trackColor: sanitizeHexColor(value.trackColor, DEFAULT_STREAMER_TOOLS_SETTINGS.trackColor),
      trackOpacity: sanitizeOpacity(
        value.trackOpacity,
        DEFAULT_STREAMER_TOOLS_SETTINGS.trackOpacity
      ),
    };
  };
  const persistedSettings = useStorage<StreamerToolsSettings>(
    STREAMER_TOOLS_SETTINGS_STORAGE_KEY,
    { ...DEFAULT_STREAMER_TOOLS_SETTINGS },
    undefined,
    {
      mergeDefaults: true,
      serializer: {
        read: (value) => {
          try {
            return sanitizeSettings(JSON.parse(value));
          } catch {
            return { ...DEFAULT_STREAMER_TOOLS_SETTINGS };
          }
        },
        write: (value) => JSON.stringify(sanitizeSettings(value)),
      },
    }
  );
  const { t } = useI18n({ useScope: 'global' });
  const { copyToClipboard } = useCopyToClipboard();
  const toast = useToast();
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
    if (/^#[0-9a-f]{6}$/.test(normalized)) {
      return normalized;
    }
    return DEFAULT_STREAMER_TOOLS_SETTINGS.customAccentColor;
  });
  const normalizedCustomBackgroundColor = computed(() => {
    const normalized = customBackgroundColor.value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(normalized)) {
      return normalized;
    }
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
    if (!Number.isFinite(cardOpacity.value)) {
      return DEFAULT_STREAMER_TOOLS_SETTINGS.cardOpacity;
    }
    return Math.min(100, Math.max(0, Math.round(cardOpacity.value)));
  });
  const normalizedBorderColor = computed(() =>
    sanitizeHexColor(borderColor.value, DEFAULT_STREAMER_TOOLS_SETTINGS.borderColor)
  );
  const normalizedBorderOpacity = computed(() => {
    if (!Number.isFinite(borderOpacity.value)) {
      return DEFAULT_STREAMER_TOOLS_SETTINGS.borderOpacity;
    }
    return Math.min(100, Math.max(0, Math.round(borderOpacity.value)));
  });
  const normalizedTrackColor = computed(() =>
    sanitizeHexColor(trackColor.value, DEFAULT_STREAMER_TOOLS_SETTINGS.trackColor)
  );
  const normalizedTrackOpacity = computed(() => {
    if (!Number.isFinite(trackOpacity.value)) {
      return DEFAULT_STREAMER_TOOLS_SETTINGS.trackOpacity;
    }
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
    if (!apiPath.value) {
      return '';
    }
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
  const persistStreamerToolsSettings = () => {
    persistedSettings.value = sanitizeSettings({
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
  let persistStreamerToolsSettingsTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedPersistStreamerToolsSettings = () => {
    if (persistStreamerToolsSettingsTimeout) {
      clearTimeout(persistStreamerToolsSettingsTimeout);
    }
    persistStreamerToolsSettingsTimeout = setTimeout(() => {
      persistStreamerToolsSettingsTimeout = null;
      persistStreamerToolsSettings();
    }, 400);
  };
  const flushDebouncedPersistStreamerToolsSettings = () => {
    if (!persistStreamerToolsSettingsTimeout) {
      return;
    }
    clearTimeout(persistStreamerToolsSettingsTimeout);
    persistStreamerToolsSettingsTimeout = null;
    persistStreamerToolsSettings();
  };
  const resetStreamerToolsSettings = () => {
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
    debouncedPersistStreamerToolsSettings();
    toast.add({
      color: 'neutral',
      title: t('streamer_tools.settings_reset', 'Streamer settings reset'),
    });
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
    debouncedPersistStreamerToolsSettings
  );
  onBeforeUnmount(() => {
    flushDebouncedPersistStreamerToolsSettings();
  });
  useSeoMeta({
    description:
      'Generate browser-source overlays for stream software to display Tarkov Kappa progress.',
    title: 'Streamer Tools',
  });
</script>
