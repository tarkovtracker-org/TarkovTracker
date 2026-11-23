<template>
  <UTooltip :text="summary" :content="{ side: 'right' }">
    <div
      class="mx-auto my-1 flex w-10 flex-col items-center gap-1 py-1"
      role="group"
      :aria-label="summary"
    >
      <span class="relative">
        <DrawerEmblem
          :src="badgeSrc"
          :loading="!isReady"
          :size="32"
          fallback-icon="i-heroicons-photo"
        />
        <DrawerEmblem
          v-if="showPrestigeEmblem"
          :src="prestige.iconLink.value"
          :size="16"
          fallback-icon="i-mdi-medal-outline"
          class="absolute -right-1.5 -bottom-1"
        />
      </span>
      <span class="text-surface-100 text-sm leading-none font-bold tabular-nums">
        {{ level }}
      </span>
    </div>
  </UTooltip>
</template>
<script setup lang="ts">
  import DrawerEmblem from '@/features/drawer/DrawerEmblem.vue';
  import { useDrawerLevelBadge } from '@/features/drawer/useDrawerLevelBadge';
  import { useDrawerPrestige } from '@/features/drawer/useDrawerPrestige';
  import { useTarkovStore } from '@/stores/useTarkov';
  /** Collapsed-rail level badge with the prestige emblem on its corner and a full-text tooltip. */
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const prestige = useDrawerPrestige();
  const level = computed<number>(() => tarkovStore.playerLevel());
  const { badgeSrc, isReady } = useDrawerLevelBadge(level);
  const showPrestigeEmblem = computed<boolean>(
    () => prestige.isAvailable.value && prestige.level.value > 0
  );
  const summary = computed<string>(() =>
    prestige.isAvailable.value
      ? t(
          'navigation_drawer.level_prestige_summary',
          { level: level.value, prestige: prestige.label.value },
          'Level {level} · {prestige}'
        )
      : t('navigation_drawer.level_summary', { level: level.value }, 'Level {level}')
  );
</script>
