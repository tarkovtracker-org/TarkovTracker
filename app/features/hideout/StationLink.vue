<template>
  <router-link
    :to="stationHref"
    class="text-link hover:text-link-hover no-underline"
    :aria-label="
      t(
        'page.hideout.station_link_label',
        { name: props.station.name },
        `Go to ${props.station.name}`
      )
    "
  >
    <div class="flex max-w-full min-w-0 items-center overflow-hidden">
      <NuxtImg
        :src="stationIcon"
        :alt="`${props.station.name} icon`"
        :width="compact ? 20 : 32"
        :height="compact ? 20 : 32"
        :sizes="compact ? '20px lg:32px' : '32px'"
        class="shrink-0 align-middle"
        :class="compact ? 'h-4 w-4 sm:h-5 sm:w-5 lg:h-8 lg:w-8' : 'h-8 w-8'"
        loading="lazy"
      />
      <span
        class="ml-1 truncate font-bold"
        :class="compact ? 'hidden text-xs lg:inline lg:text-sm' : 'text-sm'"
      >
        {{ props.station.name }}
      </span>
    </div>
  </router-link>
</template>
<script setup lang="ts">
  import type { HideoutStation } from '@/types/tarkov';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps<{
    station: Pick<HideoutStation, 'id' | 'name' | 'imageLink'>;
    compact?: boolean;
    moduleId?: string | null;
  }>();
  const stationIcon = computed(() => props.station.imageLink);
  const stationHref = computed(() => ({
    path: '/hideout',
    query: {
      station: props.station.id,
      ...(props.moduleId ? { module: props.moduleId } : {}),
    },
  }));
</script>
