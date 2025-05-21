<template>
  <v-list nav bg-color="transparent" class="mx-auto">
    <drawer-item
      icon="mdi-view-dashboard"
      locale-key="home"
      to="/"
      :is-collapsed="props.isCollapsed"
    >
    </drawer-item>
    <drawer-item
      icon="mdi-clipboard-text-multiple"
      locale-key="tasks"
      to="/tasks"
      :is-collapsed="props.isCollapsed"
    >
    </drawer-item>
    <drawer-item
      icon="mdi-list-box"
      locale-key="neededitems"
      to="/items"
      :is-collapsed="props.isCollapsed"
    >
    </drawer-item>
    <drawer-item
      icon="mdi-home"
      locale-key="hideout"
      to="/hideout"
      :is-collapsed="props.isCollapsed"
    >
    </drawer-item>
    <drawer-item
      v-show="fireuser.loggedIn"
      icon="mdi-account-group"
      locale-key="team"
      to="/team"
      :is-collapsed="props.isCollapsed"
    >
    </drawer-item>
    <drawer-item
      icon="mdi-cog"
      locale-key="settings"
      to="/settings"
      :is-collapsed="props.isCollapsed"
    >
    </drawer-item>
  </v-list>
</template>
<script setup>
  import { defineAsyncComponent } from 'vue';
  import { fireuser } from '@/plugins/firebase';

  const props = defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });

  const DrawerItem = defineAsyncComponent(() => import('@/components/drawer/DrawerItem'));
</script>
<style lang="scss" scoped></style>
