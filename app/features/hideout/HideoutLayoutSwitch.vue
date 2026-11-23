<template>
  <div
    class="flex flex-wrap items-center gap-2"
    role="group"
    :aria-label="t('page.hideout.map.layout')"
  >
    <UButton
      icon="i-mdi-view-grid-outline"
      :aria-pressed="!showMap"
      :variant="showMap ? 'ghost' : 'soft'"
      color="neutral"
      :label="t('page.hideout.map.cards')"
      @click="emit('select', false)"
    />
    <UButton
      icon="i-mdi-map-outline"
      :aria-pressed="showMap"
      :variant="showMap ? 'soft' : 'ghost'"
      color="neutral"
      :label="t('page.hideout.map.title')"
      @click="emit('select', true)"
    />
    <SettingsButton
      v-if="showMap"
      class="ml-auto"
      page-key="hideout"
      :label="t('page.hideout.settings.title')"
    />
  </div>
</template>
<script setup lang="ts">
  import SettingsButton from '@/components/ui/SettingsButton.vue';
  defineProps<{ showMap: boolean }>();
  const emit = defineEmits<{ select: [value: boolean] }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
