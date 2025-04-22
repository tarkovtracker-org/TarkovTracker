<template>
  <v-list-item
    id="app-logo-item"
    class="flex flex-column mt-1"
    :ripple="false"
    to="/"
  >
    <div
      :class="mdAndDown ? 'v-logo-rail' : 'v-logo-full compact-logo'"
      style="height: auto; margin: 8px auto"
    >
      <v-img :src="logo" lazy-src="/favicon-32x32.png" />
    </div>
    <div v-if="!mdAndDown">
      <div
        class="text-subtitle1 text-center mt-1 font-weight-medium compact-site-name"
      >
        {{ t('site_name') }}
      </div>
    </div>
  </v-list-item>
</template>
<script setup>
  import { computed } from 'vue';
  import { useAppStore } from '@/stores/app';
  import { useDisplay } from 'vuetify';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n({ useScope: 'global' });
  const { mdAndDown } = useDisplay();
  const appStore = useAppStore();
  const logo = computed(() => {
    return mdAndDown.value
      ? '/img/tarkovtrackerlogo-mini.png'
      : '/img/tarkovtrackerlogo-light.png';
  });
</script>
<style lang="scss" scoped>
  // Set up styles for rail and standard logo
  // We set global for this because we need to inject into multiple layers of components
  :global(#app-logo-item > .v-list-item__overlay) {
    opacity: 0 !important;
  }
  // We set deep for this so that it is carried down into child componets (vuetify components)
  :deep(.v-logo-full),
  :deep(.compact-logo) {
    width: 55%;
    min-width: 50%;
    max-width: 100px;
  }
  .compact-site-name {
    font-size: 1.1rem !important;
    line-height: 1.1;
  }

  // We set deep for this so that it is carried down into child componets (vuetify components)
  :deep(.v-logo-rail) {
    width: 32x;
  }
</style>
