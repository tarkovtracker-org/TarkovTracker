<template>
  <span
    v-if="foundInRaid || kappaRequired || lightkeeperRequired || isCraftable"
    class="bg-surface-900/60 ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1 ring-white/10"
  >
    <AppTooltip v-if="foundInRaid" :text="foundInRaidTitle">
      <UIcon name="i-mdi-checkbox-marked-circle-outline" :class="firIconClass" />
    </AppTooltip>
    <AppTooltip v-if="kappaRequired" :text="kappaTitleText">
      <UIcon name="i-mdi-trophy" :class="kappaIconClass" />
    </AppTooltip>
    <AppTooltip v-if="lightkeeperRequired" :text="lightkeeperTitleText">
      <UIcon name="i-mdi-lighthouse" :class="lightkeeperIconClass" />
    </AppTooltip>
    <AppTooltip v-if="isCraftable" :text="craftableTitleText">
      <button
        type="button"
        class="inline-flex"
        :aria-label="craftableTitleText"
        @click.stop="emit('craft')"
      >
        <UIcon name="i-mdi-hammer-wrench" :class="[craftableIconBaseClass, craftableIconClass]" />
      </button>
    </AppTooltip>
  </span>
</template>
<script setup lang="ts">
  const props = withDefaults(
    defineProps<{
      craftableIconBaseClass?: string;
      craftableIconClass?: string;
      craftableTitle?: string;
      firIconClass?: string;
      foundInRaid: boolean;
      foundInRaidTitle?: string;
      isCraftable: boolean;
      kappaIconClass?: string;
      kappaRequired?: boolean;
      kappaTitle?: string;
      lightkeeperIconClass?: string;
      lightkeeperRequired?: boolean;
      lightkeeperTitle?: string;
    }>(),
    {
      craftableIconBaseClass: 'h-5 w-5',
      craftableIconClass: '',
      craftableTitle: 'Craftable',
      firIconClass: 'h-5 w-5',
      foundInRaidTitle: 'Found in Raid required',
      kappaIconClass: 'h-5 w-5 text-kappa',
      kappaRequired: false,
      kappaTitle: 'Required for Kappa quest',
      lightkeeperIconClass: 'h-5 w-5 text-lightkeeper',
      lightkeeperRequired: false,
      lightkeeperTitle: 'This quest is required to unlock the Lightkeeper trader',
    }
  );
  const emit = defineEmits<{
    craft: [];
  }>();
  // Parents may pass an empty/whitespace string; trim so tooltip/aria-label are never blank.
  const craftableTitleText = computed(() => {
    const title = props.craftableTitle?.trim();
    return title && title.length > 0 ? title : 'Craftable';
  });
  const kappaTitleText = computed(() => {
    const title = props.kappaTitle?.trim();
    return title && title.length > 0 ? title : 'Required for Kappa quest';
  });
  const lightkeeperTitleText = computed(() => {
    const title = props.lightkeeperTitle?.trim();
    return title && title.length > 0
      ? title
      : 'This quest is required to unlock the Lightkeeper trader';
  });
</script>
