<template>
  <div class="space-y-5">
    <section
      class="bg-surface-900/90 space-y-4 rounded-xl border border-white/10 p-5 shadow-sm sm:p-6"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3">
          <span
            class="bg-success-500/15 border-success-500/30 flex size-10 shrink-0 items-center justify-center rounded-xl border"
          >
            <UIcon name="i-mdi-check-decagram-outline" class="text-success-300 size-5" />
          </span>
          <div class="space-y-0.5">
            <h3 class="text-surface-50 text-base font-semibold">
              {{ $t('setup.ready.title') }}
            </h3>
            <p class="text-surface-400 text-xs">{{ $t('setup.ready.subtitle') }}</p>
          </div>
        </div>
        <UBadge :color="isLoggedIn ? 'success' : 'neutral'" variant="subtle" size="sm">
          <UIcon
            :name="isLoggedIn ? 'i-mdi-cloud-check-outline' : 'i-mdi-laptop'"
            class="mr-1 size-3.5"
          />
          {{ $t(isLoggedIn ? 'setup.ready.cloud_synced' : 'setup.ready.local_only') }}
        </UBadge>
      </div>
      <dl class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div class="bg-surface-950/60 rounded-lg border border-white/8 px-3 py-2.5">
          <dt class="text-surface-400 text-xs font-semibold uppercase">
            {{ $t('setup.ready.stat_mode') }}
          </dt>
          <dd class="text-surface-100 mt-1 flex items-center gap-1.5 text-sm font-semibold">
            <GameModeBadge :mode="mode" class="-my-1.5" />
            <span>{{ $t(getGameModeLabel(mode)) }}</span>
          </dd>
        </div>
        <div class="bg-surface-950/60 rounded-lg border border-white/8 px-3 py-2.5">
          <dt class="text-surface-400 text-xs font-semibold uppercase">
            {{ $t('setup.ready.stat_pmc') }}
          </dt>
          <dd class="text-surface-100 mt-1 flex items-center gap-1.5 text-sm font-semibold">
            <FactionBadge :faction="faction" :size="18" />
            <span>{{ faction }} · {{ $t('common.lv') }} {{ level }}</span>
            <span v-if="showPrestige" class="text-warning-300 text-xs">
              · {{ $t('prestige.prestige_n', { n: prestigeLevel }) }}
            </span>
          </dd>
        </div>
        <div class="bg-surface-950/60 rounded-lg border border-white/8 px-3 py-2.5">
          <dt class="text-surface-400 text-xs font-semibold uppercase">
            {{ $t('common.game_edition') }}
          </dt>
          <dd class="text-surface-100 mt-1 truncate text-sm font-semibold">
            {{ editionTitle }}
          </dd>
        </div>
        <div class="bg-surface-950/60 rounded-lg border border-white/8 px-3 py-2.5">
          <dt class="text-surface-400 text-xs font-semibold uppercase">
            {{ $t('setup.ready.stat_tracked') }}
          </dt>
          <dd class="text-surface-100 mt-1 text-sm font-semibold tabular-nums">
            {{
              $t('setup.ready.tracked_counts', {
                tasks: completedTaskCount,
                hideout: builtHideoutCount,
              })
            }}
          </dd>
        </div>
      </dl>
      <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
        <UButton to="/tasks" color="neutral" variant="soft" icon="i-mdi-checkbox-multiple-marked">
          {{ $t('setup.ready.view_tasks') }}
        </UButton>
        <UButton to="/" color="primary" variant="solid" icon="i-mdi-view-dashboard-outline">
          {{ $t('setup.open_dashboard') }}
        </UButton>
      </div>
    </section>
    <section
      v-if="!isLoggedIn"
      class="bg-info-500/8 border-info-500/25 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex items-start gap-3">
        <span
          class="bg-info-500/15 border-info-500/30 flex size-9 shrink-0 items-center justify-center rounded-lg border"
        >
          <UIcon name="i-mdi-cloud-sync-outline" class="text-info-300 size-5" />
        </span>
        <div class="space-y-0.5">
          <h3 class="text-surface-100 text-sm font-semibold">
            {{ $t('setup.ready.sync_title') }}
          </h3>
          <p class="text-surface-300 text-xs leading-5">
            {{ $t('setup.ready.sync_description') }}
          </p>
        </div>
      </div>
      <UButton
        :to="{ path: '/login', query: { redirect: '/setup' } }"
        color="info"
        variant="solid"
        size="sm"
        icon="i-lucide-user-round"
        class="shrink-0 justify-center"
      >
        {{ $t('setup.ready.sign_in_cta') }}
      </UButton>
    </section>
    <section class="space-y-3">
      <h3 class="text-surface-200 text-sm font-semibold">
        {{ $t('setup.ready.next_steps_title') }}
      </h3>
      <div class="grid gap-3 sm:grid-cols-3">
        <NuxtLink
          v-for="card in guideCards"
          :key="card.to"
          :to="card.to"
          class="bg-surface-900/90 hover:border-primary-500/40 hover:bg-surface-850 focus-visible:ring-primary-500/60 group flex flex-col gap-2 rounded-xl border border-white/10 p-4 transition focus-visible:ring-2 focus-visible:outline-none"
        >
          <div class="flex items-center justify-between gap-2">
            <span
              class="bg-primary-500/12 border-primary-500/25 flex size-8 items-center justify-center rounded-lg border"
            >
              <UIcon :name="card.icon" class="text-primary-300 size-4" />
            </span>
            <UIcon
              name="i-mdi-arrow-right"
              class="text-surface-500 group-hover:text-primary-300 size-4 transition-transform group-hover:translate-x-0.5"
            />
          </div>
          <span class="text-surface-100 text-sm font-semibold">{{ $t(card.title) }}</span>
          <span class="text-surface-400 text-xs leading-5">{{ $t(card.description) }}</span>
        </NuxtLink>
      </div>
    </section>
    <div
      class="bg-surface-900/60 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 px-4 py-3"
    >
      <span class="text-surface-400 text-xs">{{ $t('setup.ready.adjust_hint') }}</span>
      <div class="flex flex-wrap items-center gap-1.5">
        <UButton color="neutral" variant="ghost" size="xs" @click="emit('jumpTo', 'tarkov-dev')">
          {{ $t('setup.stepper.tarkov_dev') }}
        </UButton>
        <UButton color="neutral" variant="ghost" size="xs" @click="emit('jumpTo', 'profile')">
          {{ $t('setup.stepper.profile') }}
        </UButton>
        <UButton color="neutral" variant="ghost" size="xs" @click="emit('jumpTo', 'eft-logs')">
          {{ $t('setup.stepper.eft_logs') }}
        </UButton>
        <UButton color="neutral" variant="ghost" size="xs" @click="emit('jumpTo', 'catch-up')">
          {{ $t('setup.stepper.catch_up') }}
        </UButton>
        <UButton color="neutral" variant="soft" size="xs" @click="emit('restart')">
          {{ $t('setup.restart') }}
        </UButton>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import FactionBadge from '@/components/FactionBadge.vue';
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, getGameModeLabel } from '@/utils/constants';
  import { isTaskComplete } from '@/utils/taskStatus';
  import type { SetupStep } from '@/features/setup/useSetupCheckpoint';
  const emit = defineEmits<{ jumpTo: [step: SetupStep]; restart: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const isLoggedIn = computed(() => Boolean($supabase?.user?.loggedIn));
  const mode = computed(() => tarkovStore.getCurrentGameMode());
  const modeData = computed(() => tarkovStore.getCurrentProgressData());
  const faction = computed(() => tarkovStore.getPMCFaction());
  const level = computed(() => tarkovStore.playerLevel());
  const prestigeLevel = computed(() => tarkovStore.getPrestigeLevel());
  const showPrestige = computed(
    () => mode.value !== GAME_MODES.SEASONAL && prestigeLevel.value > 0
  );
  const editionTitle = computed(() => {
    const editionValue = tarkovStore.getGameEdition();
    return (
      metadataStore.editions.find((entry) => entry.value === editionValue)?.title ??
      t('setup.ready.edition_fallback')
    );
  });
  const completedTaskCount = computed(
    () =>
      Object.values(modeData.value.taskCompletions ?? {}).filter((entry) => isTaskComplete(entry))
        .length
  );
  const builtHideoutCount = computed(
    () =>
      Object.values(modeData.value.hideoutModules ?? {}).filter((entry) => Boolean(entry?.complete))
        .length
  );
  const guideCards = [
    {
      to: '/tasks',
      icon: 'i-mdi-checkbox-multiple-marked-outline',
      title: 'setup.ready.cards.tasks_title',
      description: 'setup.ready.cards.tasks_description',
    },
    {
      to: '/needed-items',
      icon: 'i-mdi-package-variant-closed',
      title: 'setup.ready.cards.items_title',
      description: 'setup.ready.cards.items_description',
    },
    {
      to: '/resources/tarkovmonitor',
      icon: 'i-mdi-radar',
      title: 'setup.ready.cards.monitor_title',
      description: 'setup.ready.cards.monitor_description',
    },
  ] as const;
</script>
