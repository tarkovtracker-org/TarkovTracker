<template>
  <div
    class="bg-surface-950/60 flex flex-1 flex-col justify-between gap-2.5 rounded-md border border-white/8 p-2.5"
  >
    <div class="space-y-2.5">
      <div class="border-surface-800 flex items-center justify-between gap-2 border-b pb-2">
        <span class="text-surface-100 min-w-0 truncate text-sm font-semibold">
          {{ displayName }}
        </span>
        <span
          class="text-surface-100 inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
        >
          <FactionBadge :faction="pmcFaction" :size="16" />
          <span>{{ pmcFaction }}</span>
        </span>
      </div>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <dt class="text-surface-400 text-xs">{{ $t('common.level') }}</dt>
          <dd class="text-surface-100 text-sm font-semibold tabular-nums">
            {{ level }}
          </dd>
        </div>
        <div v-if="showPrestige">
          <dt class="text-surface-400 text-xs">{{ $t('common.prestige') }}</dt>
          <dd class="text-surface-100 text-sm font-semibold tabular-nums">
            {{ prestigeLevel }}
          </dd>
        </div>
        <div v-if="editionLabel" class="col-span-2">
          <dt class="text-surface-400 text-xs">
            {{ $t('settings.tarkov_dev_import.edition_guess') }}
          </dt>
          <dd class="text-surface-100 truncate text-xs font-semibold">
            {{ editionLabel }}
          </dd>
        </div>
        <div class="col-span-2">
          <dt class="text-surface-400 text-xs">
            {{ $t('settings.tarkov_dev_import.last_refreshed') }}
          </dt>
          <dd class="mt-0.5">
            <UTooltip v-if="updatedTooltip" :text="updatedTooltip">
              <time
                :datetime="updatedIso"
                tabindex="0"
                class="cursor-help text-xs font-semibold underline decoration-dotted underline-offset-4"
                :class="timeToneClass"
              >
                {{ updatedLabel }}
              </time>
            </UTooltip>
            <span v-else class="text-xs font-semibold" :class="timeToneClass">
              {{ updatedLabel }}
            </span>
          </dd>
        </div>
      </dl>
    </div>
    <TarkovDevSkillsList
      :skills="skills"
      :summary-label="$t('settings.tarkov_dev_import.skills_count', { count: skills.length })"
    />
  </div>
  <div
    v-if="isAging"
    class="bg-surface-950/60 border-warning-500/30 space-y-2 rounded-md border p-2.5"
  >
    <div class="flex items-start gap-2">
      <UIcon name="i-mdi-clock-alert-outline" class="text-warning-400 mt-0.5 size-4 shrink-0" />
      <p class="text-surface-200 text-xs leading-4">
        {{ $t('settings.tarkov_dev_import.multi_mode_stale_hint') }}
      </p>
    </div>
    <div class="space-y-1.5">
      <UButton
        v-if="profileUrl"
        icon="i-mdi-open-in-new"
        color="info"
        variant="subtle"
        size="xs"
        class="w-full justify-center whitespace-nowrap"
        :href="profileUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ $t('settings.tarkov_dev_import.refresh_on_tarkov_dev') }}
      </UButton>
      <UButton
        icon="i-mdi-refresh"
        color="warning"
        variant="soft"
        size="xs"
        class="w-full justify-center whitespace-nowrap"
        :loading="refreshing"
        :disabled="refreshDisabled"
        @click="emit('refetch')"
      >
        {{ $t('settings.tarkov_dev_import.recheck_mode') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import FactionBadge from '@/components/FactionBadge.vue';
  import TarkovDevSkillsList from '@/features/settings/TarkovDevSkillsList.vue';
  import type { PMCFaction } from '@/utils/constants';
  const props = defineProps<{
    displayName: string;
    pmcFaction: PMCFaction;
    level: number;
    prestigeLevel: number;
    showPrestige: boolean;
    editionLabel: string;
    updatedLabel: string;
    updatedTooltip: string | null;
    updatedIso?: string;
    isAging: boolean;
    skills: ReadonlyArray<{ id: string; value: number }>;
    profileUrl?: string;
    refreshing: boolean;
    refreshDisabled: boolean;
  }>();
  const emit = defineEmits<{ refetch: [] }>();
  const timeToneClass = computed(() => (props.isAging ? 'text-warning-400' : 'text-surface-100'));
</script>
