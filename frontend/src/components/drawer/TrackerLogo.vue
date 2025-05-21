<template>
  <v-list-item id="app-logo-item" class="flex flex-column mt-1" :ripple="false" to="/">
    <div
      :class="isCollapsed ? 'v-logo-rail' : 'v-logo-full compact-logo'"
      style="height: auto; margin: 8px auto"
    >
      <v-img :src="logo" lazy-src="/favicon-32x32.png" />
    </div>
    <div v-if="!isCollapsed">
      <div class="text-subtitle1 text-center mt-1 font-weight-medium compact-site-name">
        {{ t('site_name') }}
      </div>
    </div>
  </v-list-item>
</template>
<script setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });
  const logo = computed(() => {
    return props.isCollapsed
      ? '/img/logos/tarkovtrackerlogo-mini.png'
      : '/img/logos/tarkovtrackerlogo-light.png';
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
