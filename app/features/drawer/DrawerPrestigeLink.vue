<template>
  <NuxtLink
    to="/prestige"
    class="border-divider/60 text-surface-300 hover:bg-surface-800/60 hover:text-surface-50 focus-visible:outline-primary group/prestige flex items-center gap-2 border-t px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
    :aria-label="
      t(
        'navigation_drawer.prestige_link',
        { prestige: label },
        '{prestige}, open prestige settings'
      )
    "
  >
    <DrawerEmblem v-if="level > 0" :src="iconLink" :size="20" fallback-icon="i-mdi-medal-outline" />
    <UIcon
      v-else
      name="i-mdi-medal-outline"
      class="text-surface-500 size-5 shrink-0"
      aria-hidden="true"
    />
    <span class="min-w-0 flex-1 truncate">{{ label }}</span>
    <UIcon
      name="i-mdi-chevron-right"
      class="text-surface-500 group-hover/prestige:text-surface-300 size-4 shrink-0 transition-colors"
      aria-hidden="true"
    />
  </NuxtLink>
</template>
<script setup lang="ts">
  import DrawerEmblem from '@/features/drawer/DrawerEmblem.vue';
  /** Sidebar row showing the active mode's prestige; opens the prestige settings tab. */
  defineProps<{ iconLink: string; label: string; level: number }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
