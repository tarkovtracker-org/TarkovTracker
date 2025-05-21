<template>
  <v-list nav bg-color="transparent" class="mx-auto">
    <drawer-item
      avatar="/img/logos/tarkovdevlogo.png"
      locale-key="tarkovdev"
      href="https://tarkov.dev/"
      ext-link
      :is-collapsed="props.isCollapsed"
    />
    <drawer-item
      avatar="/img/logos/tarkovmonitorlogo.avif"
      locale-key="tarkovmonitor"
      href="https://github.com/the-hideout/TarkovMonitor"
      ext-link
      :is-collapsed="props.isCollapsed"
    />
    <drawer-item
      avatar="/img/logos/ratscannerlogo.png"
      locale-key="ratscanner"
      href="https://ratscanner.com/"
      ext-link
      :is-collapsed="props.isCollapsed"
    />
    <drawer-item
      avatar="/img/logos/tarkovgurulogo.png"
      locale-key="tarkovguru"
      href="https://tarkov.guru/"
      ext-link
      :is-collapsed="props.isCollapsed"
    />
    <drawer-item
      avatar="/img/logos/tarkovchangeslogo.svg"
      locale-key="tarkovchanges"
      href="https://tarkov-changes.com/"
      ext-link
      :is-collapsed="props.isCollapsed"
    />
  </v-list>
</template>
<script setup>
  import { defineAsyncComponent } from 'vue';

  // Define the prop
  const props = defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });

  const DrawerItem = defineAsyncComponent(() => import('@/components/drawer/DrawerItem'));
</script>
<style lang="scss" scoped></style>
