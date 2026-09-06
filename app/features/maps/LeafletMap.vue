<template>
  <div
    ref="mapSurfaceRef"
    tabindex="0"
    class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 relative isolate w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    :class="{ 'flex h-full min-h-0 flex-col': props.fill }"
    @pointerdown.capture="focusMapSurface"
  >
    <div
      v-if="isMapUnavailable"
      class="bg-surface-900 flex w-full flex-col items-center justify-center rounded"
      :class="props.fill ? 'min-h-0 flex-1' : 'h-100 sm:h-125 lg:h-150'"
      :style="mapHeightStyle"
    >
      <UIcon name="i-mdi-map-marker-off" class="text-surface-500 mb-4 h-16 w-16" />
      <h3 class="text-surface-300 mb-2 text-lg font-semibold">
        {{ t('maps.not_available_title') }}
      </h3>
      <p class="text-surface-500 max-w-md text-center text-sm">
        {{
          t('maps.not_available_description', {
            mapName: props.map?.name || t('maps.placeholder'),
          })
        }}
      </p>
    </div>
    <template v-else>
      <AppTooltip
        v-if="hasMultipleFloors"
        :text="t('maps.tooltips.switch_floor')"
        :content="{ side: 'right' }"
      >
        <div
          class="bg-surface-850/95 absolute top-2 left-2 z-1000 flex flex-col gap-1 rounded-lg border border-white/8 p-1.5 shadow-lg"
        >
          <span class="text-surface-400 px-1 text-[10px] font-medium tracking-wide uppercase">
            {{ t('maps.floors') }}
          </span>
          <div class="flex flex-col-reverse gap-0.5">
            <button
              v-for="floor in floors"
              :key="floor"
              type="button"
              :aria-pressed="floor === selectedFloor"
              class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 relative flex h-8 w-full items-center rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              :class="
                floor === selectedFloor
                  ? 'bg-primary-500/15 text-surface-50'
                  : 'text-surface-300/65 hover:text-surface-100 hover:bg-white/5'
              "
              @click="setFloor(floor)"
            >
              <span
                v-if="floor === selectedFloor"
                class="bg-primary-400 absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full"
              />
              {{ floor.replace(/_/g, ' ') }}
            </button>
          </div>
        </div>
      </AppTooltip>
      <div
        v-if="isLoading"
        class="bg-surface-900/50 absolute inset-0 z-1001 flex items-center justify-center"
      >
        <UIcon name="i-mdi-loading" class="text-surface-200 h-8 w-8 animate-spin" />
      </div>
      <div
        class="bg-surface-850/95 absolute top-2 right-2 z-1000 flex flex-wrap items-center gap-1 rounded-lg border border-white/8 p-1 shadow-lg"
      >
        <div class="flex items-center gap-1">
          <button
            v-if="props.showExtractToggle"
            type="button"
            :aria-pressed="showPmcExtracts"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            :class="showPmcExtracts ? MAP_BUTTON_ACTIVE_CLASS : MAP_BUTTON_INACTIVE_CLASS"
            @click="showPmcExtracts = !showPmcExtracts"
          >
            <UIcon name="i-mdi-shield-account-outline" class="h-4 w-4 shrink-0" />
            <span class="whitespace-nowrap">{{ t('maps.factions.pmc') }}</span>
          </button>
          <button
            v-if="props.showExtractToggle"
            type="button"
            :aria-pressed="showScavExtracts"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            :class="showScavExtracts ? MAP_BUTTON_ACTIVE_CLASS : MAP_BUTTON_INACTIVE_CLASS"
            @click="showScavExtracts = !showScavExtracts"
          >
            <UIcon name="i-mdi-skull-outline" class="h-4 w-4 shrink-0" />
            <span class="whitespace-nowrap">{{ t('common.scav') }}</span>
          </button>
          <button
            v-if="props.showSpawnToggle && hasPmcSpawns"
            type="button"
            :aria-pressed="showPmcSpawns"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            :class="showPmcSpawns ? MAP_BUTTON_ACTIVE_CLASS : MAP_BUTTON_INACTIVE_CLASS"
            @click="showPmcSpawns = !showPmcSpawns"
          >
            <UIcon name="i-mdi-crosshairs-gps" class="h-4 w-4 shrink-0" />
            <span class="whitespace-nowrap">{{ t('maps.layers.pmc_spawns') }}</span>
          </button>
        </div>
        <div class="mx-1 h-6 w-px bg-white/10" />
        <div class="flex items-center gap-1">
          <AppTooltip
            :text="t('settings.interface.maps.colors.title')"
            :disabled="mapColorsOpen"
            :content="{ side: 'bottom' }"
          >
            <UPopover
              v-model:open="mapColorsOpen"
              arrow
              :content="{ align: 'end', side: 'bottom', sideOffset: 8 }"
              @update:open="onPopoverOpenChange('colors', $event)"
            >
              <button
                :ref="(el) => (popoverTriggers.colors = el as HTMLElement | null)"
                type="button"
                :aria-label="t('settings.interface.maps.colors.title')"
                class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 flex h-8 w-8 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                :class="
                  mapColorsOpen
                    ? 'border-primary-400/60 bg-primary-500/15 text-primary-100'
                    : 'text-surface-300 hover:text-surface-100 border-transparent hover:bg-white/5'
                "
              >
                <UIcon name="i-mdi-palette" class="h-4 w-4" />
              </button>
              <template #content>
                <div class="w-80 space-y-3 p-3 md:w-96">
                  <div class="flex items-start justify-between gap-3">
                    <div class="space-y-0.5">
                      <p class="text-surface-200 text-xs font-semibold tracking-wide uppercase">
                        {{ t('settings.interface.maps.colors.title') }}
                      </p>
                      <p class="text-surface-400 text-xs">
                        {{ t('settings.interface.maps.colors.description') }}
                      </p>
                    </div>
                    <UButton
                      color="neutral"
                      size="xs"
                      variant="ghost"
                      @click="preferencesStore.resetMapMarkerColors()"
                    >
                      {{ t('common.reset') }}
                    </UButton>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <label
                      v-for="option in mapColorOptions"
                      :key="option.key"
                      class="bg-surface-800/70 border-surface-700 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                    >
                      <span class="flex min-w-0 items-center gap-2">
                        <span
                          class="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30"
                          :style="{ backgroundColor: mapColors[option.key] }"
                        />
                        <span class="text-surface-200 text-[11px] font-medium">
                          {{ option.label }}
                        </span>
                      </span>
                      <input
                        :aria-label="option.label"
                        :value="mapColors[option.key]"
                        type="color"
                        class="bg-surface-900 border-surface-700 h-7 w-9 shrink-0 cursor-pointer rounded border p-1"
                        @input="onMapColorInput(option.key, $event)"
                      />
                    </label>
                  </div>
                </div>
              </template>
            </UPopover>
          </AppTooltip>
          <AppTooltip
            :text="t('maps.map_settings')"
            :disabled="mapSettingsOpen"
            :content="{ side: 'bottom' }"
          >
            <UPopover
              v-model:open="mapSettingsOpen"
              arrow
              :content="{ align: 'end', side: 'bottom', sideOffset: 8 }"
              @update:open="onPopoverOpenChange('settings', $event)"
            >
              <button
                :ref="(el) => (popoverTriggers.settings = el as HTMLElement | null)"
                type="button"
                :aria-label="t('maps.map_settings')"
                class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 flex h-8 w-8 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                :class="
                  mapSettingsOpen
                    ? 'border-primary-400/60 bg-primary-500/15 text-primary-100'
                    : 'text-surface-300 hover:text-surface-100 border-transparent hover:bg-white/5'
                "
              >
                <UIcon name="i-mdi-cog" class="h-4 w-4" />
              </button>
              <template #content>
                <div class="w-56 space-y-2 p-3">
                  <p class="text-surface-200 text-xs font-semibold tracking-wide uppercase">
                    {{ t('maps.map_settings') }}
                  </p>
                  <div class="space-y-2">
                    <div class="space-y-1">
                      <div
                        class="text-surface-400 flex items-center justify-between text-[10px] font-semibold uppercase"
                      >
                        <span>{{ t('common.zoom_speed') }}</span>
                        <span class="text-surface-200 tabular-nums">{{ zoomSpeedLabel }}</span>
                      </div>
                      <input
                        v-model.number="mapZoomSpeed"
                        type="range"
                        :min="ZOOM_SPEED_MIN"
                        :max="ZOOM_SPEED_MAX"
                        step="0.1"
                        class="accent-primary-500 h-1.5 w-full cursor-pointer"
                        :aria-label="t('common.zoom_speed')"
                      />
                    </div>
                    <div class="space-y-1">
                      <div
                        class="text-surface-400 flex items-center justify-between text-[10px] font-semibold uppercase"
                      >
                        <span>{{ t('common.pan_speed') }}</span>
                        <span class="text-surface-200 tabular-nums">{{ panSpeedLabel }}</span>
                      </div>
                      <input
                        v-model.number="mapPanSpeed"
                        type="range"
                        :min="PAN_SPEED_MIN"
                        :max="PAN_SPEED_MAX"
                        step="0.1"
                        class="accent-primary-500 h-1.5 w-full cursor-pointer"
                        :aria-label="t('common.pan_speed')"
                      />
                    </div>
                    <div class="space-y-1">
                      <div
                        class="text-surface-400 flex items-center justify-between text-[10px] font-semibold uppercase"
                      >
                        <span>{{ t('common.zone_opacity') }}</span>
                        <span class="text-surface-200 tabular-nums">{{ zoneOpacityLabel }}</span>
                      </div>
                      <input
                        v-model.number="mapZoneOpacity"
                        type="range"
                        :min="ZONE_OPACITY_MIN"
                        :max="ZONE_OPACITY_MAX"
                        step="0.01"
                        class="accent-primary-500 h-1.5 w-full cursor-pointer"
                        :aria-label="t('common.zone_opacity')"
                      />
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-surface-400 text-[10px] font-semibold uppercase">
                        {{ t('maps.tooltip_density') }}
                      </span>
                      <button
                        type="button"
                        class="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
                        :class="
                          mapTooltipDensity === 'compact'
                            ? 'bg-surface-600 text-surface-100'
                            : 'bg-surface-800 text-surface-400 hover:text-surface-200'
                        "
                        :aria-label="t('maps.aria.tooltip_density')"
                        @click="
                          mapTooltipDensity =
                            mapTooltipDensity === 'compact' ? 'default' : 'compact'
                        "
                      >
                        {{
                          mapTooltipDensity === 'compact'
                            ? t('common.compact')
                            : t('common.default')
                        }}
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </UPopover>
          </AppTooltip>
          <AppTooltip
            :text="t('maps.help.title')"
            :disabled="mapHelpOpen"
            :content="{ side: 'bottom' }"
          >
            <UPopover
              v-model:open="mapHelpOpen"
              arrow
              :content="{ align: 'end', side: 'bottom', sideOffset: 8 }"
              @update:open="onPopoverOpenChange('help', $event)"
            >
              <button
                :ref="(el) => (popoverTriggers.help = el as HTMLElement | null)"
                type="button"
                data-testid="map-help-toggle"
                :aria-label="t('maps.help.title')"
                class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 relative flex h-8 w-8 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                :class="
                  mapHelpOpen
                    ? 'border-primary-400/60 bg-primary-500/15 text-primary-100'
                    : 'text-surface-300 hover:text-surface-100 border-transparent hover:bg-white/5'
                "
              >
                <span
                  v-if="!mapHelpSeen"
                  data-testid="map-help-unseen-dot"
                  class="bg-primary-400 absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
                />
                <UIcon name="i-mdi-help-circle-outline" class="h-4 w-4" />
              </button>
              <template #content>
                <div class="w-80 space-y-2.5 p-3">
                  <p class="text-surface-200 text-xs font-semibold tracking-wide uppercase">
                    {{ t('maps.help.title') }}
                  </p>
                  <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <div class="space-y-1">
                      <p class="text-surface-400 text-[10px] font-semibold tracking-wide uppercase">
                        {{ t('maps.help.groups.navigate') }}
                      </p>
                      <i18n-t
                        keypath="maps.help.pan"
                        tag="p"
                        scope="global"
                        class="text-surface-300 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]"
                      >
                        <template #keys>
                          <kbd
                            class="bg-surface-700 text-surface-200 rounded px-1 py-0.5 font-mono text-[10px]"
                          >
                            {{ 'WASD' }}
                          </kbd>
                          <span>/</span>
                          <kbd
                            class="bg-surface-700 text-surface-200 rounded px-1 py-0.5 font-mono text-[10px]"
                          >
                            {{ '←↑↓→' }}
                          </kbd>
                        </template>
                      </i18n-t>
                      <i18n-t
                        keypath="maps.help.zoom"
                        tag="p"
                        scope="global"
                        class="text-surface-300 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]"
                      >
                        <template #keys>
                          <kbd
                            class="bg-surface-700 text-surface-200 rounded px-1 py-0.5 font-mono text-[10px]"
                          >
                            {{ 'Shift' }}
                          </kbd>
                          <kbd
                            class="bg-surface-700 text-surface-200 rounded px-1 py-0.5 font-mono text-[10px]"
                          >
                            {{ 'Scroll' }}
                          </kbd>
                          <span>/</span>
                          <kbd
                            class="bg-surface-700 text-surface-200 rounded px-1 py-0.5 font-mono text-[10px]"
                          >
                            {{ 'Q/E' }}
                          </kbd>
                        </template>
                      </i18n-t>
                      <i18n-t
                        keypath="maps.help.reset"
                        tag="p"
                        scope="global"
                        class="text-surface-300 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]"
                      >
                        <template #key>
                          <kbd
                            class="bg-surface-700 text-surface-200 rounded px-1 py-0.5 font-mono text-[10px]"
                          >
                            {{ 'R' }}
                          </kbd>
                        </template>
                      </i18n-t>
                    </div>
                    <div class="space-y-1">
                      <div v-if="hasMultipleFloors" class="space-y-1">
                        <p
                          class="text-surface-400 text-[10px] font-semibold tracking-wide uppercase"
                        >
                          {{ t('maps.help.groups.floors') }}
                        </p>
                        <i18n-t
                          keypath="maps.help.cycle_floors"
                          tag="p"
                          scope="global"
                          class="text-surface-300 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]"
                        >
                          <template #keys>
                            <kbd
                              class="bg-surface-700 text-surface-200 rounded px-1 py-0.5 font-mono text-[10px]"
                            >
                              {{ 'Ctrl' }}
                            </kbd>
                            <kbd
                              class="bg-surface-700 text-surface-200 rounded px-1 py-0.5 font-mono text-[10px]"
                            >
                              {{ 'Scroll' }}
                            </kbd>
                          </template>
                        </i18n-t>
                        <p class="text-surface-400 text-[11px]">
                          {{ t('maps.help.floor_panel') }}
                        </p>
                      </div>
                      <p
                        class="text-surface-400 pt-1 text-[10px] font-semibold tracking-wide uppercase"
                      >
                        {{ t('maps.help.groups.interact') }}
                      </p>
                      <i18n-t
                        keypath="maps.help.click_at_cursor"
                        tag="p"
                        scope="global"
                        class="text-surface-300 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]"
                      >
                        <template #key>
                          <kbd
                            class="bg-surface-700 text-surface-200 rounded px-1 py-0.5 font-mono text-[10px]"
                          >
                            {{ 'F' }}
                          </kbd>
                        </template>
                      </i18n-t>
                      <p class="text-surface-300 text-[11px]">
                        {{ t('maps.help.click_marker') }}
                      </p>
                    </div>
                    <div class="col-span-2 space-y-1">
                      <p class="text-surface-400 text-[10px] font-semibold tracking-wide uppercase">
                        {{ t('maps.help.groups.view') }}
                      </p>
                      <p class="text-surface-300 text-[11px]">
                        {{ t('maps.help.fullscreen') }}
                      </p>
                      <p class="text-surface-300 text-[11px]">
                        {{ t('maps.help.resize') }}
                      </p>
                    </div>
                  </div>
                </div>
              </template>
            </UPopover>
          </AppTooltip>
        </div>
      </div>
      <div class="relative" :class="{ 'min-h-0 flex-1': props.fill }">
        <div
          ref="mapContainer"
          class="bg-surface-900 w-full rounded ring-1 ring-white/10 ring-inset"
          :class="props.fill ? 'h-full' : 'h-100 sm:h-125 lg:h-150'"
          :style="mapHeightStyle"
        />
        <div
          v-if="showKeyboardCursor"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 z-1000"
        >
          <div
            class="border-surface-50/80 bg-surface-950/40 ring-surface-950/80 absolute top-1/2 left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border ring-1"
          >
            <div
              class="bg-surface-50 absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            />
          </div>
        </div>
        <div
          class="bg-surface-850/95 absolute right-2 bottom-2 z-1000 flex flex-col overflow-hidden rounded-md border border-white/10 shadow-lg"
        >
          <AppTooltip :text="t('maps.tooltips.zoom_in')" :kbds="['E']">
            <button
              type="button"
              data-testid="map-zoom-in"
              :disabled="!canZoomIn"
              :aria-label="t('maps.tooltips.zoom_in')"
              class="focus-visible:ring-primary-500 text-surface-200 hover:text-surface-50 focus-visible:ring-offset-surface-850 disabled:hover:text-surface-200 flex h-9 w-9 items-center justify-center transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              @click="zoomMapIn"
            >
              <UIcon name="i-mdi-plus" class="h-4.5 w-4.5" />
            </button>
          </AppTooltip>
          <AppTooltip :text="t('maps.tooltips.zoom_out')" :kbds="['Q']">
            <button
              type="button"
              data-testid="map-zoom-out"
              :disabled="!canZoomOut"
              :aria-label="t('maps.tooltips.zoom_out')"
              class="focus-visible:ring-primary-500 text-surface-200 hover:text-surface-50 focus-visible:ring-offset-surface-850 disabled:hover:text-surface-200 flex h-9 w-9 items-center justify-center transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              @click="zoomMapOut"
            >
              <UIcon name="i-mdi-minus" class="h-4.5 w-4.5" />
            </button>
          </AppTooltip>
          <div class="mx-1 h-px bg-white/10" />
          <AppTooltip :text="t('maps.tooltips.reset_view')" :kbds="['R']">
            <button
              type="button"
              data-testid="map-reset-view"
              :aria-label="t('maps.tooltips.reset_view')"
              class="focus-visible:ring-primary-500 text-surface-200 hover:text-surface-50 focus-visible:ring-offset-surface-850 flex h-9 w-9 items-center justify-center transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              @click="resetMapView"
            >
              <UIcon name="i-mdi-restore" class="h-4.5 w-4.5" />
            </button>
          </AppTooltip>
          <template v-if="props.showFullscreenToggle">
            <div class="mx-1 h-px bg-white/10" />
            <AppTooltip :text="fullscreenToggleLabel">
              <button
                type="button"
                data-testid="map-fullscreen-toggle"
                :aria-label="fullscreenToggleLabel"
                class="focus-visible:ring-primary-500 text-surface-200 hover:text-surface-50 focus-visible:ring-offset-surface-850 flex h-9 w-9 items-center justify-center transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                @click="emit('toggle-fullscreen')"
              >
                <UIcon
                  :name="props.isFullscreen ? 'i-mdi-fullscreen-exit' : 'i-mdi-fullscreen'"
                  class="h-4.5 w-4.5"
                />
              </button>
            </AppTooltip>
          </template>
        </div>
        <div
          v-if="showFirstUseHint"
          data-testid="map-first-use-hint"
          class="bg-surface-850/95 absolute bottom-3 left-1/2 z-1001 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-lg border border-white/12 p-3 shadow-xl"
        >
          <p class="text-surface-100 text-xs font-semibold">{{ t('maps.hint.title') }}</p>
          <p class="text-surface-300 mt-1 text-xs">
            {{ hasMultipleFloors ? t('maps.hint.summary_multi_floor') : t('maps.hint.summary') }}
          </p>
          <div class="mt-2.5 flex items-center gap-3">
            <button
              type="button"
              class="bg-primary-500 hover:bg-primary-400 text-surface-950 rounded px-3 py-1 text-xs font-semibold transition-colors"
              data-testid="map-hint-dismiss"
              @click="dismissFirstUseHint"
            >
              {{ t('common.got_it') }}
            </button>
            <button
              type="button"
              class="text-primary-300 hover:text-primary-200 text-xs font-medium underline-offset-2 transition-colors hover:underline"
              data-testid="map-hint-all-controls"
              @click="openHelpFromHint"
            >
              {{ t('maps.hint.all_controls') }}
            </button>
          </div>
        </div>
      </div>
      <div class="mt-2 flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-4">
        <div
          v-if="props.showLegend"
          class="bg-surface-850/95 text-surface-300 flex flex-wrap items-center gap-4 rounded-lg border border-white/8 px-3 py-2 text-xs shadow-lg"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-surface-400 text-[10px] font-medium tracking-wide uppercase">
              {{ t('common.tasks') }}
            </span>
            <button
              v-for="chip in objectiveChips"
              :key="chip.key"
              type="button"
              class="flex items-center gap-2 rounded-full border px-3 py-1.5 transition-opacity"
              :class="chip.isOn ? '' : 'opacity-55 hover:opacity-80'"
              :style="{
                borderColor: chip.isOn
                  ? `color-mix(in srgb, ${chip.color} 45%, transparent)`
                  : 'var(--color-surface-700)',
                backgroundColor: chip.isOn
                  ? `color-mix(in srgb, ${chip.color} 15%, transparent)`
                  : 'transparent',
              }"
              :aria-pressed="chip.isOn"
              @click="chip.toggle()"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                :class="chip.isOn ? '' : 'box-border border-2'"
                :style="chip.isOn ? { backgroundColor: chip.color } : { borderColor: chip.color }"
              />
              <span
                class="text-surface-100"
                :class="chip.isOn ? '' : 'text-surface-400 line-through'"
              >
                {{ chip.label }}
              </span>
            </button>
          </div>
          <div v-if="showPmcSpawns && hasPmcSpawns" class="flex items-center gap-1">
            <div class="h-3 w-3 rounded-full" :style="{ backgroundColor: mapColors.PMC_SPAWN }" />
            <span>{{ t('common.pmc_spawn') }}</span>
          </div>
          <div v-if="showPmcExtracts" class="flex items-center gap-1">
            <UIcon
              name="i-mdi-exit-run"
              class="h-3 w-3"
              :style="{ color: mapColors.PMC_EXTRACT }"
            />
            <span>{{ t('common.pmc_extract') }}</span>
          </div>
          <div v-if="showScavExtracts" class="flex items-center gap-1">
            <UIcon
              name="i-mdi-exit-run"
              class="h-3 w-3"
              :style="{ color: mapColors.SCAV_EXTRACT }"
            />
            <span>{{ t('common.scav_extract') }}</span>
          </div>
          <div
            v-if="(showPmcExtracts || showScavExtracts) && hasSharedExtracts"
            class="flex items-center gap-1"
          >
            <UIcon
              name="i-mdi-exit-run"
              class="h-3 w-3"
              :style="{ color: mapColors.SHARED_EXTRACT }"
            />
            <span>{{ t('maps.legend.shared_extract') }}</span>
          </div>
          <div
            v-if="(showPmcExtracts || showScavExtracts) && hasCoopExtracts"
            class="flex items-center gap-1"
          >
            <UIcon
              name="i-mdi-exit-run"
              class="h-3 w-3"
              :style="{ color: mapColors.COOP_EXTRACT }"
            />
            <span>{{ t('maps.legend.coop_extract') }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
  import 'leaflet/dist/leaflet.css';
  import { createApp } from 'vue';
  import { type MapViewState, useLeafletMap, withoutZoomSnap } from '@/composables/useLeafletMap';
  import {
    mapObjectiveCategory,
    type MapObjectiveCategory,
  } from '@/composables/useMapObjectiveMarks';
  import {
    MAP_BUTTON_ACTIVE_CLASS,
    MAP_BUTTON_INACTIVE_CLASS,
    PAN_SPEED_MAX,
    PAN_SPEED_MIN,
    ZONE_OPACITY_MAX,
    ZONE_OPACITY_MIN,
    ZOOM_SPEED_MAX,
    ZOOM_SPEED_MIN,
    isCoopExtract,
    useLeafletMapControls,
  } from '@/features/maps/composables/useLeafletMapControls';
  import LeafletObjectiveTooltip from '@/features/maps/LeafletObjectiveTooltip.vue';
  import { getMarksHash, type MapMark } from '@/features/maps/utils/marksHash';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { logger } from '@/utils/logger';
  import { clusterSpawns } from '@/utils/mapClustering';
  import {
    gameToLatLng,
    outlineToLatLngArray,
    isValidMapSvgConfig,
    isValidMapTileConfig,
  } from '@/utils/mapCoordinates';
  import type { TarkovMap } from '@/types/tarkov';
  import type L from 'leaflet';
  const MAP_CONTROLS_HINT_KEY = 'mapControlsHintSeen';
  const MAP_HELP_SEEN_KEY = 'mapHelpSeen';
  const MAP_HELP_SEEN_EVENT = 'map-help-seen';
  const mapControlsHintSeen = ref(false);
  const mapHelpSeen = ref(false);
  const onMapHelpSeenElsewhere = () => {
    mapHelpSeen.value = true;
  };
  onMounted(() => {
    try {
      mapControlsHintSeen.value = window.localStorage.getItem(MAP_CONTROLS_HINT_KEY) === 'true';
      mapHelpSeen.value = window.localStorage.getItem(MAP_HELP_SEEN_KEY) === 'true';
    } catch (error) {
      logger.warn('[LeafletMap] Failed to read map hint flags:', error);
    }
    window.addEventListener(MAP_HELP_SEEN_EVENT, onMapHelpSeenElsewhere);
  });
  const markMapHelpSeen = () => {
    if (mapHelpSeen.value) return;
    mapHelpSeen.value = true;
    try {
      window.localStorage.setItem(MAP_HELP_SEEN_KEY, 'true');
    } catch (error) {
      logger.warn('[LeafletMap] Failed to persist map help seen flag:', error);
    }
    window.dispatchEvent(new CustomEvent(MAP_HELP_SEEN_EVENT));
  };
  const dismissMapControlsHint = () => {
    mapControlsHintSeen.value = true;
    try {
      window.localStorage.setItem(MAP_CONTROLS_HINT_KEY, 'true');
    } catch (error) {
      logger.warn('[LeafletMap] Failed to persist map controls hint flag:', error);
    }
  };
  interface Props {
    map: TarkovMap;
    marks?: MapMark[];
    showExtracts?: boolean;
    showPmcExtracts?: boolean;
    showScavExtracts?: boolean;
    showExtractToggle?: boolean;
    showPmcSpawns?: boolean;
    showSpawnToggle?: boolean;
    showLegend?: boolean;
    showFullscreenToggle?: boolean;
    isFullscreen?: boolean;
    fill?: boolean;
    height?: number;
    initialView?: MapViewState | null;
    initialFloor?: string;
  }
  const props = withDefaults(defineProps<Props>(), {
    marks: () => [],
    showExtracts: true,
    showExtractToggle: true,
    showSpawnToggle: true,
    showLegend: true,
    showFullscreenToggle: false,
    isFullscreen: false,
    fill: false,
    height: undefined,
    initialView: null,
    initialFloor: undefined,
  });
  const emit = defineEmits<{ 'toggle-fullscreen': [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const router = useRouter();
  const preferencesStore = usePreferencesStore();
  const mapSurfaceRef = ref<HTMLElement | null>(null);
  const showKeyboardCursor = ref(false);
  const fullscreenToggleLabel = computed(() =>
    props.isFullscreen ? t('maps.tooltips.exit_fullscreen') : t('maps.tooltips.open_fullscreen')
  );
  const mapHeightStyle = computed(() => {
    if (props.fill) return undefined;
    if (typeof props.height !== 'number' || Number.isNaN(props.height)) return undefined;
    return { height: `${props.height}px` };
  });
  const isMapUnavailable = computed(() => {
    return props.map?.unavailable === true;
  });
  const mapShowSelfObjectives = computed({
    get: () => preferencesStore.getMapShowSelfObjectives,
    set: (value: boolean) => preferencesStore.setMapShowSelfObjectives(value),
  });
  const mapShowPinnedObjectives = computed({
    get: () => preferencesStore.getMapShowPinnedObjectives,
    set: (value: boolean) => preferencesStore.setMapShowPinnedObjectives(value),
  });
  const mapShowTeamObjectives = computed({
    get: () => preferencesStore.getMapShowTeamObjectives,
    set: (value: boolean) => preferencesStore.setMapShowTeamObjectives(value),
  });
  interface ObjectiveChip {
    key: MapObjectiveCategory;
    label: string;
    color: string;
    isOn: boolean;
    toggle: () => void;
  }
  const objectiveChips = computed<ObjectiveChip[]>(() => {
    return [
      {
        key: 'self',
        label: t('maps.legend.regular'),
        color: mapColors.value.SELF_OBJECTIVE,
        isOn: mapShowSelfObjectives.value,
        toggle: () => {
          mapShowSelfObjectives.value = !mapShowSelfObjectives.value;
        },
      },
      {
        key: 'pinned',
        label: t('maps.legend.pinned'),
        color: mapColors.value.PINNED_OBJECTIVE,
        isOn: mapShowPinnedObjectives.value,
        toggle: () => {
          mapShowPinnedObjectives.value = !mapShowPinnedObjectives.value;
        },
      },
      {
        key: 'team',
        label: t('maps.legend.team'),
        color: mapColors.value.TEAM_OBJECTIVE,
        isOn: mapShowTeamObjectives.value,
        toggle: () => {
          mapShowTeamObjectives.value = !mapShowTeamObjectives.value;
        },
      },
    ];
  });
  const mapContainer = ref<HTMLElement | null>(null);
  const {
    mapInstance,
    leaflet,
    selectedFloor,
    floors,
    hasMultipleFloors,
    isLoading,
    objectiveLayer,
    extractLayer,
    spawnLayer,
    setFloor,
    refreshView,
    clearMarkers,
  } = useLeafletMap({
    containerRef: mapContainer,
    map: toRef(props, 'map'),
    initialView: props.initialView ?? null,
    initialFloor: props.initialFloor,
  });
  const ZONE_HOVER_DELTA = 0.16;
  const ZONE_HOVER_MAX = 0.6;
  const SPAWN_CLUSTER_ZOOM_THRESHOLD = 3.5;
  const SPAWN_CLUSTER_GRID_SIZE = 50;
  const SPAWN_CLUSTER_MIN_RADIUS = 6;
  const SPAWN_CLUSTER_MAX_RADIUS = 14;
  const MARKER_SVG_LOAD_DELAY_MS = 500;
  const {
    hasCoopExtracts,
    hasPmcSpawns,
    hasSharedExtracts,
    mapColors,
    mapColorOptions,
    mapExtracts,
    mapPanSpeed,
    mapPmcSpawns,
    mapTooltipDensity,
    mapZoneOpacity,
    mapZoomSpeed,
    onMapColorInput,
    panSpeedLabel,
    showPmcExtracts,
    showPmcSpawns,
    showScavExtracts,
    zoomSpeedLabel,
    zoneOpacityLabel,
  } = useLeafletMapControls({
    map: toRef(props, 'map'),
    preferencesStore,
    showExtracts: props.showExtracts,
    showPmcExtracts: props.showPmcExtracts,
    showPmcSpawns: props.showPmcSpawns,
    showScavExtracts: props.showScavExtracts,
    t,
  });
  const mapColorsOpen = ref(false);
  const mapSettingsOpen = ref(false);
  const mapHelpOpen = ref(false);
  const popoverTriggers = { colors: null, settings: null, help: null } as Record<
    'colors' | 'settings' | 'help',
    HTMLElement | null
  >;
  let lastUserOpenedPopover: 'colors' | 'settings' | 'help' | null = null;
  const onPopoverOpenChange = (key: 'colors' | 'settings' | 'help', isOpen: boolean) => {
    if (isOpen) {
      lastUserOpenedPopover = key;
      return;
    }
    if (lastUserOpenedPopover !== key) return;
    lastUserOpenedPopover = null;
    nextTick(() => popoverTriggers[key]?.focus());
  };
  watch(mapHelpOpen, (isOpen) => {
    if (!isOpen) return;
    markMapHelpSeen();
  });
  watch([mapColorsOpen, mapSettingsOpen, mapHelpOpen], ([colors, settings, help]) => {
    if (colors) {
      mapSettingsOpen.value = false;
      mapHelpOpen.value = false;
    } else if (settings) {
      mapColorsOpen.value = false;
      mapHelpOpen.value = false;
    } else if (help) {
      mapColorsOpen.value = false;
      mapSettingsOpen.value = false;
    }
  });
  const currentMapZoom = ref(0);
  const canZoomIn = computed(() => {
    const instance = mapInstance.value;
    if (!instance) return false;
    return currentMapZoom.value < instance.getMaxZoom();
  });
  const canZoomOut = computed(() => {
    const instance = mapInstance.value;
    if (!instance) return false;
    return currentMapZoom.value > instance.getMinZoom();
  });
  const updateCurrentMapZoom = () => {
    currentMapZoom.value = mapInstance.value?.getZoom() ?? 0;
  };
  const zoomMapBy = (direction: 1 | -1) => {
    const instance = mapInstance.value;
    if (!instance) return;
    withoutZoomSnap(instance, () => {
      if (direction > 0) {
        instance.zoomIn();
        return;
      }
      instance.zoomOut();
    });
  };
  const zoomMapIn = () => {
    zoomMapBy(1);
  };
  const zoomMapOut = () => {
    zoomMapBy(-1);
  };
  const resetMapView = () => {
    refreshView();
  };
  const showFirstUseHint = computed(() => {
    return !mapControlsHintSeen.value && !isLoading.value && Boolean(mapInstance.value);
  });
  const dismissFirstUseHint = () => {
    dismissMapControlsHint();
  };
  const openHelpFromHint = () => {
    dismissMapControlsHint();
    mapHelpOpen.value = true;
  };
  let firstUseHintListeners: { instance: L.Map; dismiss: () => void } | null = null;
  watch(
    showFirstUseHint,
    (visible) => {
      if (visible) {
        const instance = mapInstance.value;
        if (!instance) return;
        const dismiss = () => dismissMapControlsHint();
        firstUseHintListeners = { instance, dismiss };
        instance.on('dragstart', dismiss);
        instance.on('zoomstart', dismiss);
        return;
      }
      if (firstUseHintListeners) {
        firstUseHintListeners.instance.off('dragstart', firstUseHintListeners.dismiss);
        firstUseHintListeners.instance.off('zoomstart', firstUseHintListeners.dismiss);
        firstUseHintListeners = null;
      }
    },
    { immediate: true }
  );
  const pressedMapKeys = new Set<'up' | 'down' | 'left' | 'right' | 'zoom-in' | 'zoom-out'>();
  let mapKeyboardFrameId: number | null = null;
  let mapKeyboardLastTick = 0;
  let keyboardCursorHoverTarget: Element | null = null;
  const MAP_KEYBOARD_PAN_SPEED = 225;
  const MAP_KEYBOARD_ZOOM_SPEED = 1.7;
  const normalizeMapControlKey = (
    key: string,
    code?: string
  ): 'up' | 'down' | 'left' | 'right' | 'zoom-in' | 'zoom-out' | null => {
    const normalizedKey = key.toLowerCase();
    switch (normalizedKey) {
      case 'w':
      case 'arrowup':
        return 'up';
      case 's':
      case 'arrowdown':
        return 'down';
      case 'a':
      case 'arrowleft':
        return 'left';
      case 'd':
      case 'arrowright':
        return 'right';
      case 'e':
        return 'zoom-in';
      case 'q':
        return 'zoom-out';
      default:
        break;
    }
    switch (code) {
      case 'KeyW':
        return 'up';
      case 'KeyS':
        return 'down';
      case 'KeyA':
        return 'left';
      case 'KeyD':
        return 'right';
      case 'KeyE':
        return 'zoom-in';
      case 'KeyQ':
        return 'zoom-out';
      default:
        return null;
    }
  };
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return Boolean(
      target.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'
      )
    );
  };
  const isMapKeyboardActive = (): boolean => {
    if (!mapInstance.value) return false;
    const mapSurface = mapSurfaceRef.value;
    if (!mapSurface) return false;
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLElement && mapSurface.contains(activeElement);
  };
  const stopMapKeyboardLoop = (clearKeys = false) => {
    if (mapKeyboardFrameId !== null) {
      window.cancelAnimationFrame(mapKeyboardFrameId);
      mapKeyboardFrameId = null;
    }
    mapKeyboardLastTick = 0;
    if (clearKeys) {
      pressedMapKeys.clear();
    }
  };
  const getMapCenterTarget = (): {
    clientX: number;
    clientY: number;
    target: Element;
  } | null => {
    const instance = mapInstance.value;
    if (!instance) return null;
    const container = instance.getContainer();
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const eventTarget = document.elementFromPoint(clientX, clientY);
    const target =
      eventTarget instanceof Element && container.contains(eventTarget) ? eventTarget : container;
    return { clientX, clientY, target };
  };
  const dispatchCenterMouseEvent = (
    type: string,
    target: Element,
    clientX: number,
    clientY: number,
    buttons = 0,
    detail = 0
  ) => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons,
        clientX,
        clientY,
        detail,
        view: window,
      })
    );
  };
  const clearKeyboardCursorHover = () => {
    if (!keyboardCursorHoverTarget) return;
    const centerTarget = getMapCenterTarget();
    if (centerTarget) {
      dispatchCenterMouseEvent(
        'mouseout',
        keyboardCursorHoverTarget,
        centerTarget.clientX,
        centerTarget.clientY
      );
      dispatchCenterMouseEvent(
        'mouseleave',
        keyboardCursorHoverTarget,
        centerTarget.clientX,
        centerTarget.clientY
      );
    }
    keyboardCursorHoverTarget = null;
  };
  const syncKeyboardCursorHover = () => {
    if (!showKeyboardCursor.value) {
      clearKeyboardCursorHover();
      return;
    }
    const centerTarget = getMapCenterTarget();
    if (!centerTarget) return;
    const { clientX, clientY, target } = centerTarget;
    if (keyboardCursorHoverTarget !== target) {
      if (keyboardCursorHoverTarget) {
        dispatchCenterMouseEvent('mouseout', keyboardCursorHoverTarget, clientX, clientY);
        dispatchCenterMouseEvent('mouseleave', keyboardCursorHoverTarget, clientX, clientY);
      }
      dispatchCenterMouseEvent('mouseover', target, clientX, clientY);
      dispatchCenterMouseEvent('mouseenter', target, clientX, clientY);
      keyboardCursorHoverTarget = target;
    }
    dispatchCenterMouseEvent('mousemove', target, clientX, clientY);
  };
  const applyMapKeyboardStep = (elapsedMs: number) => {
    const instance = mapInstance.value;
    if (!instance || !pressedMapKeys.size) return;
    const panDelta = MAP_KEYBOARD_PAN_SPEED * mapPanSpeed.value * (elapsedMs / 1000);
    const zoomDelta = MAP_KEYBOARD_ZOOM_SPEED * mapZoomSpeed.value * (elapsedMs / 1000);
    let panX = 0;
    let panY = 0;
    const moveUp = pressedMapKeys.has('up');
    const moveDown = pressedMapKeys.has('down');
    const moveLeft = pressedMapKeys.has('left');
    const moveRight = pressedMapKeys.has('right');
    if (moveUp && !moveDown) panY -= panDelta;
    if (moveDown && !moveUp) panY += panDelta;
    if (moveLeft && !moveRight) panX -= panDelta;
    if (moveRight && !moveLeft) panX += panDelta;
    if (panX !== 0 || panY !== 0) {
      instance.panBy([panX, panY], {
        animate: false,
        noMoveStart: true,
      });
    }
    const zoomIn = pressedMapKeys.has('zoom-in');
    const zoomOut = pressedMapKeys.has('zoom-out');
    if ((zoomIn && zoomOut) || (!zoomIn && !zoomOut)) {
      syncKeyboardCursorHover();
      return;
    }
    const currentZoom = instance.getZoom();
    const minZoom = Number.isFinite(instance.getMinZoom()) ? instance.getMinZoom() : currentZoom;
    const maxZoom = Number.isFinite(instance.getMaxZoom()) ? instance.getMaxZoom() : currentZoom;
    let nextZoom = currentZoom;
    if (zoomIn) {
      nextZoom = Math.min(maxZoom, currentZoom * (1 + zoomDelta));
    } else {
      nextZoom = Math.max(minZoom, currentZoom / (1 + zoomDelta));
    }
    if (nextZoom === currentZoom) {
      syncKeyboardCursorHover();
      return;
    }
    const container = instance.getContainer();
    const center = instance.containerPointToLatLng([
      container.clientWidth / 2,
      container.clientHeight / 2,
    ]);
    const originalZoomSnap = instance.options.zoomSnap ?? 0;
    instance.options.zoomSnap = 0;
    try {
      instance.setZoomAround(center, nextZoom, { animate: false });
    } finally {
      instance.options.zoomSnap = originalZoomSnap;
    }
    syncKeyboardCursorHover();
  };
  const runMapKeyboardLoop = (timestamp: number) => {
    if (!isMapKeyboardActive() || !pressedMapKeys.size) {
      clearKeyboardCursorHover();
      showKeyboardCursor.value = false;
      stopMapKeyboardLoop(true);
      return;
    }
    const elapsedMs = mapKeyboardLastTick ? Math.min(48, timestamp - mapKeyboardLastTick) : 16;
    mapKeyboardLastTick = timestamp;
    applyMapKeyboardStep(elapsedMs);
    mapKeyboardFrameId = window.requestAnimationFrame(runMapKeyboardLoop);
  };
  const startMapKeyboardLoop = () => {
    if (mapKeyboardFrameId !== null) return;
    mapKeyboardLastTick = 0;
    mapKeyboardFrameId = window.requestAnimationFrame(runMapKeyboardLoop);
  };
  const focusMapSurface = () => {
    clearKeyboardCursorHover();
    showKeyboardCursor.value = false;
    mapSurfaceRef.value?.focus({ preventScroll: true });
  };
  const triggerCenterMapClick = () => {
    const centerTarget = getMapCenterTarget();
    if (!centerTarget) return;
    const { clientX, clientY, target } = centerTarget;
    dispatchCenterMouseEvent('mousedown', target, clientX, clientY, 1);
    dispatchCenterMouseEvent('mouseup', target, clientX, clientY);
    dispatchCenterMouseEvent('click', target, clientX, clientY, 0, 1);
  };
  const onGlobalMapKeydown = (event: KeyboardEvent) => {
    const normalizedKey = event.key.toLowerCase();
    const normalizedCode = event.code.toLowerCase();
    if (normalizedKey === 'f' || normalizedCode === 'keyf') {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (!isMapKeyboardActive()) return;
      event.preventDefault();
      showKeyboardCursor.value = true;
      syncKeyboardCursorHover();
      if (event.repeat) return;
      triggerCenterMapClick();
      return;
    }
    if (normalizedKey === 'r' || normalizedCode === 'keyr') {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (!isMapKeyboardActive()) return;
      event.preventDefault();
      showKeyboardCursor.value = true;
      if (event.repeat) return;
      refreshView();
      window.requestAnimationFrame(syncKeyboardCursorHover);
      return;
    }
    const controlKey = normalizeMapControlKey(event.key, event.code);
    if (!controlKey) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;
    if (!isMapKeyboardActive()) return;
    event.preventDefault();
    showKeyboardCursor.value = true;
    syncKeyboardCursorHover();
    pressedMapKeys.add(controlKey);
    startMapKeyboardLoop();
  };
  const onGlobalMapKeyup = (event: KeyboardEvent) => {
    const controlKey = normalizeMapControlKey(event.key, event.code);
    if (!controlKey) return;
    pressedMapKeys.delete(controlKey);
    if (!pressedMapKeys.size) {
      stopMapKeyboardLoop();
    }
  };
  const onMapWindowBlur = () => {
    clearKeyboardCursorHover();
    showKeyboardCursor.value = false;
    stopMapKeyboardLoop(true);
  };
  const baseZoomDelta = ref<number | null>(null);
  const baseZoomSnap = ref<number | null>(null);
  let svgReadyFallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  let svgReadyListener: EventListener | null = null;
  let svgReadyElement: SVGElement | null = null;
  let svgReadyObserver: MutationObserver | null = null;
  const teardownSvgReadyWatcher = () => {
    if (svgReadyObserver) {
      svgReadyObserver.disconnect();
      svgReadyObserver = null;
    }
    if (svgReadyFallbackTimeout !== null) {
      clearTimeout(svgReadyFallbackTimeout);
      svgReadyFallbackTimeout = null;
    }
    if (svgReadyElement && svgReadyListener) {
      svgReadyElement.removeEventListener('load', svgReadyListener);
    }
    svgReadyElement = null;
    svgReadyListener = null;
  };
  const getMapSvgElement = (instance: L.Map): SVGElement | null => {
    const mapBackgroundSvg = instance.getPane('mapBackground')?.querySelector('svg');
    if (mapBackgroundSvg instanceof SVGElement) {
      return mapBackgroundSvg;
    }
    const markerLayerSvg = instance.getPane('overlayPane')?.querySelector('svg');
    if (markerLayerSvg instanceof SVGElement) {
      return markerLayerSvg;
    }
    const containerSvg = instance.getContainer().querySelector('svg');
    return containerSvg instanceof SVGElement ? containerSvg : null;
  };
  const isSvgReady = (svgElement: SVGElement | null): boolean => {
    if (!svgElement) return false;
    if (svgElement.childElementCount > 0) return true;
    return (
      !!svgElement.getAttribute('viewBox') ||
      (!!svgElement.getAttribute('width') && !!svgElement.getAttribute('height'))
    );
  };
  const waitForSvgAndUpdateMarkers = (instance: L.Map) => {
    teardownSvgReadyWatcher();
    if (!isValidMapSvgConfig(props.map.svg)) {
      updateMarkers();
      return;
    }
    const finalizeUpdate = () => {
      teardownSvgReadyWatcher();
      updateMarkers();
    };
    const ensureSvgLoadListener = (svgElement: SVGElement | null) => {
      if (!svgElement || svgReadyElement === svgElement) return;
      if (svgReadyElement && svgReadyListener) {
        svgReadyElement.removeEventListener('load', svgReadyListener);
      }
      svgReadyElement = svgElement;
      svgReadyListener = () => finalizeUpdate();
      svgReadyElement.addEventListener('load', svgReadyListener, { once: true });
    };
    const tryUpdateMarkers = () => {
      const svgElement = getMapSvgElement(instance);
      ensureSvgLoadListener(svgElement);
      if (isSvgReady(svgElement)) {
        finalizeUpdate();
      }
    };
    const observerTarget =
      instance.getPane('mapBackground') ??
      instance.getPane('overlayPane') ??
      instance.getContainer();
    svgReadyObserver = new MutationObserver(() => {
      tryUpdateMarkers();
    });
    svgReadyObserver.observe(observerTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['viewBox', 'width', 'height'],
    });
    tryUpdateMarkers();
    if (svgReadyObserver || svgReadyElement) {
      svgReadyFallbackTimeout = setTimeout(() => {
        finalizeUpdate();
      }, MARKER_SVG_LOAD_DELAY_MS);
    }
  };
  const popupOptions = {
    autoClose: false,
    closeOnClick: false,
    closeButton: false,
  };
  let activePinnedPopupCleanup: (() => void) | null = null;
  const objectiveMarkers = new Map<
    string,
    { layer: L.Layer; getLatLng: () => L.LatLngExpression; showPopup: (pinned: boolean) => void }
  >();
  const lastMarksHash = ref('');
  const mountObjectiveTooltip = (
    objectiveId: string,
    onClose: () => void
  ): { element: HTMLElement; unmount: () => void } => {
    const container = document.createElement('div');
    const app = createApp(LeafletObjectiveTooltip, { objectiveId, onClose, t });
    app.provide('router', router);
    app.mount(container);
    return { element: container, unmount: () => app.unmount() };
  };
  const POPUP_HIDE_DELAY = 100;
  const attachHoverPinPopup = (
    layer: L.Layer,
    objectiveId: string,
    getLatLng: () => L.LatLngExpression
  ): void => {
    if (!leaflet.value || !mapInstance.value) return;
    const popup = leaflet.value.popup({
      ...popupOptions,
      className: 'map-objective-popup',
    });
    let isPinned = false;
    let isHovering = false;
    let popupHideTimer: ReturnType<typeof setTimeout> | null = null;
    let currentMountedComponent: { element: HTMLElement; unmount: () => void } | null = null;
    let popupListenersAttached = false;
    const styledLayer = layer as L.CircleMarker | L.Polygon;
    const originalFillColor = styledLayer.options?.fillColor || mapColors.value.SELF_OBJECTIVE;
    const originalStrokeColor = styledLayer.options?.color || mapColors.value.SELF_OBJECTIVE;
    const isCircleMarker = 'getRadius' in styledLayer;
    const setLayerSelected = (selected: boolean) => {
      if (!('setStyle' in styledLayer)) return;
      if (selected) {
        if (isCircleMarker) {
          styledLayer.setStyle({ fillColor: mapColors.value.SELECTED });
        } else {
          styledLayer.setStyle({
            color: mapColors.value.SELECTED,
            fillColor: mapColors.value.SELECTED,
          });
        }
        return;
      }
      if (isCircleMarker) {
        styledLayer.setStyle({ fillColor: originalFillColor });
        return;
      }
      styledLayer.setStyle({ color: originalStrokeColor, fillColor: originalFillColor });
    };
    const cleanupMountedComponent = () => {
      if (currentMountedComponent) {
        currentMountedComponent.unmount();
        currentMountedComponent = null;
      }
    };
    const unpinAndHide = () => {
      isPinned = false;
      setLayerSelected(false);
      if (activePinnedPopupCleanup === unpinAndHide) {
        activePinnedPopupCleanup = null;
      }
      if (mapInstance.value) {
        popup.remove();
        cleanupMountedComponent();
      }
    };
    const showPopup = (pinned: boolean) => {
      if (!mapInstance.value) return;
      if (pinned && activePinnedPopupCleanup) {
        activePinnedPopupCleanup();
      }
      isPinned = pinned;
      if (pinned) {
        setLayerSelected(true);
      }
      cleanupMountedComponent();
      currentMountedComponent = mountObjectiveTooltip(objectiveId, unpinAndHide);
      popup.setContent(currentMountedComponent.element);
      popup.setLatLng(getLatLng());
      if (!mapInstance.value.hasLayer(popup)) {
        popup.addTo(mapInstance.value);
      }
      if (pinned) {
        activePinnedPopupCleanup = unpinAndHide;
      }
    };
    const hidePopup = () => {
      if (!isPinned && mapInstance.value) {
        popup.remove();
        cleanupMountedComponent();
      }
    };
    objectiveMarkers.set(objectiveId, { layer, getLatLng, showPopup });
    layer.on('mouseover', () => {
      isHovering = true;
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
        popupHideTimer = null;
      }
      if (!isPinned) {
        showPopup(false);
      }
    });
    layer.on('mouseout', () => {
      isHovering = false;
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
      }
      popupHideTimer = setTimeout(() => {
        popupHideTimer = null;
        if (!isHovering && !isPinned) {
          hidePopup();
        }
      }, POPUP_HIDE_DELAY);
    });
    layer.on('click', (event) => {
      leaflet.value?.DomEvent.stop(event);
      if (isPinned) {
        unpinAndHide();
        return;
      }
      if (activePinnedPopupCleanup) {
        activePinnedPopupCleanup();
      }
      showPopup(true);
    });
    const handlePopupMouseEnter = () => {
      isHovering = true;
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
        popupHideTimer = null;
      }
    };
    const handlePopupMouseLeave = () => {
      isHovering = false;
      if (!isPinned) {
        if (popupHideTimer) {
          clearTimeout(popupHideTimer);
        }
        popupHideTimer = setTimeout(() => {
          popupHideTimer = null;
          if (!isHovering) {
            hidePopup();
          }
        }, POPUP_HIDE_DELAY);
      }
    };
    popup.on('add', () => {
      if (popupListenersAttached) return;
      const popupElement = popup.getElement();
      if (popupElement) {
        popupElement.addEventListener('mouseenter', handlePopupMouseEnter);
        popupElement.addEventListener('mouseleave', handlePopupMouseLeave);
        popupListenersAttached = true;
      }
    });
    popup.on('remove', () => {
      if (!popupListenersAttached) return;
      const popupElement = popup.getElement();
      if (popupElement) {
        popupElement.removeEventListener('mouseenter', handlePopupMouseEnter);
        popupElement.removeEventListener('mouseleave', handlePopupMouseLeave);
        popupListenersAttached = false;
      }
    });
    layer.on('remove', () => {
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
        popupHideTimer = null;
      }
      popup.remove();
      objectiveMarkers.delete(objectiveId);
      cleanupMountedComponent();
    });
  };
  function createObjectiveMarkers(): void {
    if (!leaflet.value || !objectiveLayer.value || !props.map) return;
    const L = leaflet.value;
    if (!isValidMapSvgConfig(props.map.svg) && !isValidMapTileConfig(props.map.tile)) return;
    const currentHash = getMarksHash(props.marks, props.map.id);
    if (currentHash === lastMarksHash.value && objectiveMarkers.size > 0) {
      return;
    }
    lastMarksHash.value = currentHash;
    if (activePinnedPopupCleanup) {
      activePinnedPopupCleanup();
      activePinnedPopupCleanup = null;
    }
    objectiveLayer.value.clearLayers();
    objectiveMarkers.clear();
    const zoneEntries: Array<{
      polygon: L.Polygon;
      centerMarker: L.CircleMarker;
      area: number;
      objectiveId: string;
    }> = [];
    const pointEntries: Array<{
      marker: L.CircleMarker;
      objectiveId: string;
    }> = [];
    const calculateZoneArea = (outline: Array<{ x: number; z: number }>): number => {
      if (outline.length < 3) return 0;
      let sum = 0;
      for (let i = 0; i < outline.length; i++) {
        const current = outline[i];
        const next = outline[(i + 1) % outline.length];
        if (!current || !next) continue;
        sum += current.x * next.z - next.x * current.z;
      }
      return Math.abs(sum / 2);
    };
    const categoryColors: Record<MapObjectiveCategory, string> = {
      self: mapColors.value.SELF_OBJECTIVE,
      pinned: mapColors.value.PINNED_OBJECTIVE,
      team: mapColors.value.TEAM_OBJECTIVE,
    };
    const categoryEnabled: Record<MapObjectiveCategory, boolean> = {
      self: mapShowSelfObjectives.value,
      pinned: mapShowPinnedObjectives.value,
      team: mapShowTeamObjectives.value,
    };
    props.marks.forEach((mark) => {
      const objectiveId = mark.id;
      if (!objectiveId) return;
      const category = mapObjectiveCategory(mark.pinned === true, mark.users ?? []);
      if (!categoryEnabled[category]) return;
      const markerColor = categoryColors[category];
      mark.possibleLocations?.forEach((location) => {
        if (location.map.id !== props.map.id) return;
        const positions = location.positions;
        if (!positions || positions.length === 0) return;
        const pos = positions[0];
        if (!pos) return;
        const latLng = gameToLatLng(pos.x, pos.z);
        const marker = L.circleMarker([latLng.lat, latLng.lng], {
          radius: 8,
          fillColor: markerColor,
          fillOpacity: 0.8,
          color: mapColors.value.MARKER_BORDER,
          weight: 2,
        });
        pointEntries.push({ marker, objectiveId });
      });
      mark.zones.forEach((zone) => {
        if (zone.map.id !== props.map.id) return;
        if (zone.outline.length < 3) return;
        const latLngs = outlineToLatLngArray(zone.outline);
        if (latLngs.length < 3) return;
        const zoneColor = markerColor;
        const polygonLatLngs = latLngs.map((ll) => [ll.lat, ll.lng]) as L.LatLngExpression[];
        const polygon = L.polygon(polygonLatLngs, {
          color: zoneColor,
          fillColor: zoneColor,
          fillOpacity: mapZoneOpacity.value,
          weight: 2.25,
          opacity: 0.95,
        });
        const center = polygon.getBounds().getCenter();
        const centerMarker = L.circleMarker([center.lat, center.lng], {
          radius: 5,
          fillColor: zoneColor,
          fillOpacity: 0.95,
          color: mapColors.value.MARKER_BORDER,
          weight: 1.5,
          opacity: 1,
        });
        zoneEntries.push({
          polygon,
          centerMarker,
          area: calculateZoneArea(zone.outline),
          objectiveId,
        });
      });
    });
    zoneEntries
      .sort((a, b) => b.area - a.area)
      .forEach(({ polygon, centerMarker, objectiveId }) => {
        if (objectiveId) {
          attachHoverPinPopup(polygon, objectiveId, () => polygon.getBounds().getCenter());
          attachHoverPinPopup(centerMarker, objectiveId, () => centerMarker.getLatLng());
        }
        polygon.on('mouseover', () =>
          polygon.setStyle({
            fillOpacity: Math.min(mapZoneOpacity.value + ZONE_HOVER_DELTA, ZONE_HOVER_MAX),
            weight: 3,
          })
        );
        polygon.on('mouseout', () =>
          polygon.setStyle({ fillOpacity: mapZoneOpacity.value, weight: 2.25 })
        );
        objectiveLayer.value!.addLayer(polygon);
        objectiveLayer.value!.addLayer(centerMarker);
      });
    pointEntries.forEach(({ marker, objectiveId }) => {
      if (objectiveId) {
        attachHoverPinPopup(marker, objectiveId, () => marker.getLatLng());
      }
      objectiveLayer.value!.addLayer(marker);
    });
  }
  function createExtractMarkers(): void {
    if (!leaflet.value || !extractLayer.value || !props.map) return;
    const L = leaflet.value;
    if (!isValidMapSvgConfig(props.map.svg) && !isValidMapTileConfig(props.map.tile)) return;
    extractLayer.value.clearLayers();
    const showAnyExtracts = showPmcExtracts.value || showScavExtracts.value;
    if (!showAnyExtracts) return;
    mapExtracts.value.forEach((extract) => {
      if (!extract.position) return;
      const isCoop = extract.faction === 'shared' && isCoopExtract(extract);
      const shouldShow =
        extract.faction === 'pmc'
          ? showPmcExtracts.value
          : extract.faction === 'scav'
            ? showScavExtracts.value
            : showAnyExtracts;
      if (!shouldShow) return;
      const latLng = gameToLatLng(extract.position.x, extract.position.z);
      let markerColor: string;
      switch (extract.faction) {
        case 'pmc':
          markerColor = mapColors.value.PMC_EXTRACT;
          break;
        case 'scav':
          markerColor = mapColors.value.SCAV_EXTRACT;
          break;
        case 'shared':
          markerColor = isCoop ? mapColors.value.COOP_EXTRACT : mapColors.value.SHARED_EXTRACT;
          break;
        default:
          markerColor = mapColors.value.DEFAULT_EXTRACT;
          break;
      }
      const extractDot = L.circleMarker([latLng.lat, latLng.lng], {
        radius: 3,
        fillColor: markerColor,
        fillOpacity: 1,
        color: mapColors.value.EXTRACT_DOT_BORDER,
        weight: 1,
        opacity: 1,
        interactive: false,
      });
      const extractBadge = document.createElement('div');
      extractBadge.setAttribute('title', extract.name);
      extractBadge.setAttribute('aria-label', extract.name);
      extractBadge.className = 'extract-badge';
      extractBadge.style.borderColor = markerColor;
      const extractLabel = document.createElement('span');
      extractLabel.className = 'extract-badge-label';
      extractLabel.textContent = extract.name;
      extractBadge.appendChild(extractLabel);
      const extractIcon = L.divIcon({
        className: 'extract-marker',
        html: extractBadge,
        iconAnchor: [0, 0],
        iconSize: undefined,
      });
      const labelMarker = L.marker([latLng.lat, latLng.lng], {
        icon: extractIcon,
        interactive: false,
        zIndexOffset: 1000,
      });
      extractLayer.value!.addLayer(extractDot);
      extractLayer.value!.addLayer(labelMarker);
    });
  }
  let lastSpawnZoomAboveThreshold: boolean | null = null;
  function createPmcSpawnMarkers(): void {
    if (!leaflet.value || !spawnLayer.value || !props.map) return;
    if (!isValidMapSvgConfig(props.map.svg) && !isValidMapTileConfig(props.map.tile)) return;
    spawnLayer.value.clearLayers();
    if (!showPmcSpawns.value || mapPmcSpawns.value.length === 0) return;
    const L = leaflet.value;
    const currentZoom = mapInstance.value?.getZoom() ?? 0;
    const aboveThreshold = currentZoom >= SPAWN_CLUSTER_ZOOM_THRESHOLD;
    lastSpawnZoomAboveThreshold = aboveThreshold;
    if (aboveThreshold) {
      mapPmcSpawns.value.forEach((spawn) => {
        const position = spawn.position;
        if (!position) return;
        const latLng = gameToLatLng(position.x, position.z);
        const marker = L.circleMarker([latLng.lat, latLng.lng], {
          radius: 3,
          fillColor: mapColors.value.PMC_SPAWN,
          fillOpacity: 0.9,
          color: mapColors.value.MARKER_BORDER,
          weight: 1,
          interactive: false,
        });
        spawnLayer.value!.addLayer(marker);
      });
    } else {
      const clusters = clusterSpawns(mapPmcSpawns.value, SPAWN_CLUSTER_GRID_SIZE);
      for (const cluster of clusters) {
        const latLng = gameToLatLng(cluster.centerX, cluster.centerZ);
        if (cluster.count === 1) {
          const marker = L.circleMarker([latLng.lat, latLng.lng], {
            radius: 3,
            fillColor: mapColors.value.PMC_SPAWN,
            fillOpacity: 0.9,
            color: mapColors.value.MARKER_BORDER,
            weight: 1,
            interactive: false,
          });
          spawnLayer.value!.addLayer(marker);
        } else {
          const clampedCount = Math.min(cluster.count, 20);
          const radius =
            SPAWN_CLUSTER_MIN_RADIUS +
            ((clampedCount - 2) / 18) * (SPAWN_CLUSTER_MAX_RADIUS - SPAWN_CLUSTER_MIN_RADIUS);
          const marker = L.circleMarker([latLng.lat, latLng.lng], {
            radius,
            fillColor: mapColors.value.PMC_SPAWN,
            fillOpacity: 0.6,
            color: mapColors.value.MARKER_BORDER,
            weight: 1.5,
            interactive: false,
          });
          spawnLayer.value!.addLayer(marker);
          const label = L.tooltip({
            permanent: true,
            direction: 'center',
            className: 'spawn-cluster-label',
          })
            .setContent(String(cluster.count))
            .setLatLng([latLng.lat, latLng.lng]);
          spawnLayer.value!.addLayer(label as unknown as L.Layer);
        }
      }
    }
  }
  function handleSpawnZoomChange(): void {
    if (!mapInstance.value || !showPmcSpawns.value) return;
    const currentZoom = mapInstance.value.getZoom();
    const aboveThreshold = currentZoom >= SPAWN_CLUSTER_ZOOM_THRESHOLD;
    if (aboveThreshold === lastSpawnZoomAboveThreshold) return;
    createPmcSpawnMarkers();
  }
  function updateMarkers(): void {
    try {
      createObjectiveMarkers();
      createExtractMarkers();
      createPmcSpawnMarkers();
    } catch (error) {
      logger.error('Error updating map markers:', error);
    }
  }
  const applyZoomSpeed = (instance: L.Map | null, speed: number) => {
    if (!instance) return;
    if (baseZoomDelta.value === null) {
      baseZoomDelta.value = instance.options.zoomDelta ?? 0.35;
    }
    if (baseZoomSnap.value === null) {
      baseZoomSnap.value = instance.options.zoomSnap ?? 0.25;
    }
    instance.options.zoomDelta = baseZoomDelta.value * speed;
    if (baseZoomSnap.value !== null) {
      const nextZoomSnap =
        speed < 1 ? Math.max(0.05, baseZoomSnap.value * speed) : baseZoomSnap.value;
      instance.options.zoomSnap = nextZoomSnap;
    }
  };
  watch(
    () => props.marks,
    () => updateMarkers(),
    { deep: true }
  );
  watch(mapZoomSpeed, (speed) => {
    applyZoomSpeed(mapInstance.value, speed);
  });
  watch(
    mapColors,
    () => {
      lastMarksHash.value = '';
      updateMarkers();
    },
    { deep: true }
  );
  watch(mapZoneOpacity, () => {
    lastMarksHash.value = '';
    updateMarkers();
  });
  watch([mapShowSelfObjectives, mapShowPinnedObjectives, mapShowTeamObjectives], () => {
    lastMarksHash.value = '';
    updateMarkers();
  });
  watch([showPmcExtracts, showScavExtracts], () => createExtractMarkers());
  watch(showPmcSpawns, () => createPmcSpawnMarkers());
  watch(
    () => props.showPmcSpawns,
    (value) => {
      if (typeof value === 'boolean') {
        showPmcSpawns.value = value;
      }
    }
  );
  watch(
    () => props.map,
    () => {
      lastMarksHash.value = '';
      lastSpawnZoomAboveThreshold = null;
      updateMarkers();
    }
  );
  watch(selectedFloor, () => {
    lastMarksHash.value = '';
    updateMarkers();
  });
  watch(
    mapInstance,
    (instance) => {
      teardownSvgReadyWatcher();
      if (instance) {
        baseZoomDelta.value = instance.options.zoomDelta ?? 0.35;
        baseZoomSnap.value = instance.options.zoomSnap ?? 0.25;
        applyZoomSpeed(instance, mapZoomSpeed.value);
      }
    },
    { immediate: true }
  );
  onMounted(() => {
    window.addEventListener('keydown', onGlobalMapKeydown);
    window.addEventListener('keyup', onGlobalMapKeyup);
    window.addEventListener('blur', onMapWindowBlur);
  });
  watch(
    [isLoading, objectiveLayer, extractLayer, spawnLayer, mapInstance],
    (
      [loading, objectiveMarkersLayer, extractMarkersLayer, spawnMarkersLayer, instance],
      oldValues
    ) => {
      const oldInstance = oldValues?.[4] as L.Map | null | undefined;
      if (oldInstance && oldInstance !== instance) {
        oldInstance.off('zoomend', handleSpawnZoomChange);
        oldInstance.off('zoomend', updateCurrentMapZoom);
      }
      if (
        loading ||
        !instance ||
        !objectiveMarkersLayer ||
        !extractMarkersLayer ||
        !spawnMarkersLayer
      )
        return;
      lastMarksHash.value = '';
      instance.off('zoomend', handleSpawnZoomChange);
      instance.on('zoomend', handleSpawnZoomChange);
      instance.off('zoomend', updateCurrentMapZoom);
      instance.on('zoomend', updateCurrentMapZoom);
      updateCurrentMapZoom();
      waitForSvgAndUpdateMarkers(instance);
    },
    { immediate: true, flush: 'post' }
  );
  const activateObjectivePopup = (objectiveId: string): boolean => {
    const markerData = objectiveMarkers.get(objectiveId);
    if (!markerData) return false;
    markerData.showPopup(true);
    return true;
  };
  const closeActivePopup = (): void => {
    if (activePinnedPopupCleanup) {
      activePinnedPopupCleanup();
    }
  };
  const hasLaidOutContainer = (instance: L.Map): boolean => {
    const size = instance.getSize();
    return size.x > 0 && size.y > 0;
  };
  const getViewState = (): MapViewState | null => {
    const instance = mapInstance.value;
    if (!instance || !hasLaidOutContainer(instance)) return null;
    const center = instance.getCenter();
    return { center: [center.lat, center.lng], zoom: instance.getZoom() };
  };
  const setViewState = (state: MapViewState): void => {
    const instance = mapInstance.value;
    if (!instance || !hasLaidOutContainer(instance)) return;
    if (instance.getZoom() === state.zoom) {
      instance.panTo(state.center, { animate: false });
      return;
    }
    withoutZoomSnap(instance, () => instance.setView(state.center, state.zoom, { animate: false }));
  };
  const getFloor = (): string => selectedFloor.value;
  defineExpose({
    activateObjectivePopup,
    closeActivePopup,
    refreshView,
    getViewState,
    setViewState,
    getFloor,
    setFloor,
  });
  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalMapKeydown);
    window.removeEventListener('keyup', onGlobalMapKeyup);
    window.removeEventListener('blur', onMapWindowBlur);
    window.removeEventListener(MAP_HELP_SEEN_EVENT, onMapHelpSeenElsewhere);
    clearKeyboardCursorHover();
    stopMapKeyboardLoop(true);
    teardownSvgReadyWatcher();
    if (firstUseHintListeners) {
      firstUseHintListeners.instance.off('dragstart', firstUseHintListeners.dismiss);
      firstUseHintListeners.instance.off('zoomstart', firstUseHintListeners.dismiss);
      firstUseHintListeners = null;
    }
    if (mapInstance.value) {
      mapInstance.value.off('zoomend', handleSpawnZoomChange);
      mapInstance.value.off('zoomend', updateCurrentMapZoom);
    }
    if (activePinnedPopupCleanup) {
      activePinnedPopupCleanup();
    }
    objectiveMarkers.clear();
    clearMarkers();
  });
</script>
