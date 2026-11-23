<template>
  <DrawerLevelRail v-if="isCollapsed" />
  <section v-else class="px-3 pt-1 pb-2" :aria-label="t('navigation_drawer.profile')">
    <div class="border-divider/60 bg-surface-850 overflow-hidden rounded-md border">
      <DrawerLevelEditor />
      <DrawerPrestigeLink
        v-if="prestige.isAvailable.value"
        :icon-link="prestige.iconLink.value"
        :label="prestige.label.value"
        :level="prestige.level.value"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
  import DrawerLevelEditor from '@/features/drawer/DrawerLevelEditor.vue';
  import DrawerLevelRail from '@/features/drawer/DrawerLevelRail.vue';
  import DrawerPrestigeLink from '@/features/drawer/DrawerPrestigeLink.vue';
  import { useDrawerPrestige } from '@/features/drawer/useDrawerPrestige';
  /** Sidebar profile card: player level and, outside Seasonal, the current prestige. */
  defineProps<{ isCollapsed: boolean }>();
  const { t } = useI18n({ useScope: 'global' });
  const prestige = useDrawerPrestige();
</script>
