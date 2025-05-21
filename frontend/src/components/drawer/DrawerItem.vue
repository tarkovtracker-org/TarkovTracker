<template>
  <v-list-item
    :class="itemClass"
    :to="props.to"
    :active="props.to === $route.path"
    @click="visitHref()"
  >
    <template v-if="props.avatar">
      <v-avatar size="24">
        <v-img :src="props.avatar" />
      </v-avatar>
    </template>
    <template v-else>
      <v-icon :icon="props.icon" />
    </template>
    <v-list-item-title
      v-if="!props.isCollapsed"
      :class="[titleClass, props.extLink ? 'drawer-external-link' : '']"
      style="display: inline-flex"
    >
      <template v-if="props.localeKey">
        {{ t(`navigation_drawer.${props.localeKey}`) }}
      </template>
      <template v-else-if="props.text">
        {{ props.text }}
      </template>
    </v-list-item-title>
  </v-list-item>
</template>
<script setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps({
    icon: {
      type: String,
      default: 'mdi-menu-right',
      required: false,
    },
    avatar: {
      type: String,
      required: false,
      default: null,
    },
    localeKey: {
      type: String,
      required: false,
      default: null,
    },
    text: {
      type: String,
      required: false,
      default: null,
    },
    to: {
      type: String,
      required: false,
      default: null,
    },
    href: {
      type: String,
      required: false,
      default: null,
    },
    extLink: {
      type: Boolean,
      required: false,
      default: false,
    },
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });
  const visitHref = () => {
    if (props.href !== null) {
      window.open(props.href, '_blank');
    }
  };
  const itemClass = computed(() => ({
    'align-center': props.isCollapsed,
    'justify-center': props.isCollapsed,
  }));
  const titleClass = computed(() => ({
    'v-drawer-item-full': !props.isCollapsed,
    'v-drawer-item-rail': props.isCollapsed,
  }));
</script>
<style lang="scss" scoped>
  // Set up styles for rail and standard item
  .v-drawer-item-full {
    margin-inline-start: 32px;
  }
  .drawer-external-link {
    font-size: 0.97rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-inline-start: 8px !important;
  }

  .v-drawer-item-rail {
    width: 26px;
  }
</style>
