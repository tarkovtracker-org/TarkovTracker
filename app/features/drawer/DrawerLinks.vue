<template>
  <div>
    <div v-if="!props.isCollapsed" class="px-4 py-1">
      <h3 class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
        {{ t('navigation_drawer.section_navigation') }}
      </h3>
    </div>
    <ul class="flex flex-col gap-0.5 px-1">
      <DrawerItem
        icon="i-heroicons-squares-2x2"
        locale-key="home"
        to="/"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-heroicons-clipboard-document-list"
        locale-key="tasks"
        to="/tasks"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-heroicons-cube"
        locale-key="needed_items"
        to="/needed-items"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-heroicons-home"
        locale-key="hideout"
        to="/hideout"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-heroicons-user-group"
        locale-key="team"
        to="/team"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-heroicons-video-camera"
        locale-key="streamer_tools"
        to="/streamer-tools"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-heroicons-cog-6-tooth"
        locale-key="settings"
        to="/settings"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
    </ul>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import DrawerItem from '@/features/drawer/DrawerItem.vue';
  const props = defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });
  const { t } = useI18n({ useScope: 'global' });
</script>
