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
                <p
                  :id="modeGroupLabelId"
                  class="text-surface-300 text-xs font-semibold tracking-wider uppercase"
                >
                  {{ t('streamer_tools.mode_label', 'Game Mode') }}
                </p>
                <div
                  role="radiogroup"
                  :aria-labelledby="modeGroupLabelId"
                  class="flex rounded-md border border-white/10 p-1"
                >
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="selectedMode === GAME_MODES.PVP"
                    class="flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors"
                    :class="
                      selectedMode === GAME_MODES.PVP
                        ? 'bg-pvp-800 text-pvp-100'
                        : 'text-pvp-300 hover:bg-pvp-950/60'
                    "
                    @click="selectedMode = GAME_MODES.PVP"
                  >
                    {{ t('streamer_tools.mode_pvp', 'PvP') }}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="selectedMode === GAME_MODES.PVE"
                    class="flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors"
                    :class="
                      selectedMode === GAME_MODES.PVE
                        ? 'bg-pve-700 text-pve-100'
                        : 'text-pve-300 hover:bg-pve-950/60'
                    "
                    @click="selectedMode = GAME_MODES.PVE"
                  >
                    {{ t('streamer_tools.mode_pve', 'PvE') }}
                  </button>
                </div>
              </article>
              <article class="space-y-2">
                <p
                  :id="metricGroupLabelId"
                  class="text-surface-300 text-xs font-semibold tracking-wider uppercase"
                >
                  {{ t('streamer_tools.metric_label', 'Widget') }}
                </p>
                <div
                  role="radiogroup"
                  :aria-labelledby="metricGroupLabelId"
                  class="grid gap-3 sm:grid-cols-3"
                >
                  <button
                    v-for="option in metricOptions"
                    :key="option.value"
                    type="button"
                    role="radio"
                    :aria-checked="selectedMetric === option.value"
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
                  <label
                    :for="customAccentColorId"
                    class="text-surface-300 block text-xs font-semibold tracking-wider uppercase"
                  >
                    {{ t('streamer_tools.custom_accent', 'Custom Accent') }}
                  </label>
                  <input
                    :id="customAccentColorId"
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
                      <label
                        :for="customBackgroundColorId"
                        class="text-surface-200 block text-xs font-medium"
                      >
                        {{ t('streamer_tools.background_color', 'Color') }}
                      </label>
                      <input
                        :id="customBackgroundColorId"
                        v-model="customBackgroundColor"
                        type="color"
                        class="border-surface-700 bg-surface-850 h-9 w-full cursor-pointer rounded border px-1"
                      />
                    </div>
                    <div class="space-y-1">
                      <label
                        :for="customBackgroundOpacityId"
                        class="text-surface-200 block text-xs font-medium"
                      >
                        {{
                          t('streamer_tools.background_opacity', 'Opacity') +
                          ` (${normalizedCustomBackgroundOpacity}%)`
                        }}
                      </label>
                      <input
                        :id="customBackgroundOpacityId"
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
                    <label
                      :for="customScalePercentId"
                      class="text-surface-200 block text-xs font-medium"
                    >
                      {{
                        t('streamer_tools.custom_scale_percent', 'Scale') +
                        ` (${normalizedCustomScalePercent}%)`
                      }}
                    </label>
                    <input
                      :id="customScalePercentId"
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
                      <label :for="textColorId" class="text-surface-200 block text-xs font-medium">
                        {{ t('streamer_tools.text_color', 'Text Color') }}
                      </label>
                      <input
                        :id="textColorId"
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
                        <label
                          :for="cardColorId"
                          class="text-surface-200 block text-xs font-medium"
                        >
                          {{ t('streamer_tools.card_color', 'Card Color') }}
                        </label>
                        <input
                          :id="cardColorId"
                          v-model="cardColor"
                          type="color"
                          class="border-surface-700 bg-surface-850 h-9 w-full cursor-pointer rounded border px-1"
                        />
                      </div>
                      <div class="space-y-1">
                        <label
                          :for="cardOpacityId"
                          class="text-surface-200 block text-xs font-medium"
                        >
                          {{
                            t('streamer_tools.card_opacity', 'Card Opacity') +
                            ` (${normalizedCardOpacity}%)`
                          }}
                        </label>
                        <input
                          :id="cardOpacityId"
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
                        <label
                          :for="borderColorId"
                          class="text-surface-200 block text-xs font-medium"
                        >
                          {{ t('streamer_tools.border_color', 'Border Color') }}
                        </label>
                        <input
                          :id="borderColorId"
                          v-model="borderColor"
                          type="color"
                          class="border-surface-700 bg-surface-850 h-9 w-full cursor-pointer rounded border px-1"
                        />
                      </div>
                      <div class="space-y-1">
                        <label
                          :for="borderOpacityId"
                          class="text-surface-200 block text-xs font-medium"
                        >
                          {{
                            t('streamer_tools.border_opacity', 'Border Opacity') +
                            ` (${normalizedBorderOpacity}%)`
                          }}
                        </label>
                        <input
                          :id="borderOpacityId"
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
                        <label
                          :for="trackColorId"
                          class="text-surface-200 block text-xs font-medium"
                        >
                          {{ t('streamer_tools.track_color', 'Progress Track') }}
                        </label>
                        <input
                          :id="trackColorId"
                          v-model="trackColor"
                          type="color"
                          class="border-surface-700 bg-surface-850 h-9 w-full cursor-pointer rounded border px-1"
                        />
                      </div>
                      <div class="space-y-1">
                        <label
                          :for="trackOpacityId"
                          class="text-surface-200 block text-xs font-medium"
                        >
                          {{
                            t('streamer_tools.track_opacity', 'Track Opacity') +
                            ` (${normalizedTrackOpacity}%)`
                          }}
                        </label>
                        <input
                          :id="trackOpacityId"
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
          v-if="isModePublic"
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
                  {{ t('streamer_tools.platform_obs', 'OBS Studio / Streamlabs Desktop') }}
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
                  {{ t('streamer_tools.platform_xsplit', 'XSplit / vMix') }}
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
  import { useStreamerToolsOverlay } from '@/features/streamer-tools/composables/useStreamerToolsOverlay';
  import { logger } from '@/utils/logger';
  const { t } = useI18n({ useScope: 'global' });
  const { copyToClipboard } = useCopyToClipboard();
  const toast = useToast();
  const {
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
  } = useStreamerToolsOverlay();
  const modeGroupLabelId = useId();
  const metricGroupLabelId = useId();
  const customAccentColorId = useId();
  const customBackgroundColorId = useId();
  const customBackgroundOpacityId = useId();
  const customScalePercentId = useId();
  const textColorId = useId();
  const cardColorId = useId();
  const cardOpacityId = useId();
  const borderColorId = useId();
  const borderOpacityId = useId();
  const trackColorId = useId();
  const trackOpacityId = useId();
  const copyOverlayUrl = async () => {
    if (!isModePublic.value || !overlayUrl.value) return;
    try {
      await copyToClipboard(overlayUrl.value);
      toast.add({
        color: 'success',
        title: t('streamer_tools.copy_success', 'Overlay URL copied'),
      });
    } catch (err) {
      logger.error('[StreamerTools] Failed to copy overlay URL:', err);
      toast.add({
        color: 'error',
        title: t('streamer_tools.copy_failed', 'Failed to copy overlay URL'),
      });
    }
  };
  const resetStreamerToolsSettings = () => {
    resetSettings();
    toast.add({
      color: 'neutral',
      title: t('streamer_tools.settings_reset', 'Streamer settings reset'),
    });
  };
</script>
