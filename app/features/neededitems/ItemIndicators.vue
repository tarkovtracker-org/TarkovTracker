<template>
  <span
    v-if="foundInRaid || kappaRequired || lightkeeperRequired || isCraftable"
    class="bg-surface-900/60 ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1 ring-white/10"
  >
    <AppTooltip v-if="foundInRaid" :text="foundInRaidTitle">
      <UIcon name="i-mdi-checkbox-marked-circle-outline" :class="firIconClass" />
    </AppTooltip>
    <AppTooltip v-if="kappaRequired" :text="kappaTitle">
      <UIcon name="i-mdi-trophy" :class="kappaIconClass" />
    </AppTooltip>
    <AppTooltip v-if="lightkeeperRequired" :text="lightkeeperTitle">
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
      isCraftable: boolean;
      kappaIconClass?: string;
      kappaRequired?: boolean;
      lightkeeperIconClass?: string;
      lightkeeperRequired?: boolean;
    }>(),
    {
      craftableIconBaseClass: 'h-5 w-5',
      craftableIconClass: '',
      craftableTitle: '',
      firIconClass: 'h-5 w-5',
      kappaIconClass: 'h-5 w-5 text-kappa',
      kappaRequired: false,
      lightkeeperIconClass: 'h-5 w-5 text-lightkeeper',
      lightkeeperRequired: false,
    }
  );
  const emit = defineEmits<{
    craft: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const foundInRaidTitle = computed(() => t('common.found_in_raid_required'));
  const kappaTitle = computed(() => t('needed_items.task_kappa_req'));
  const lightkeeperTitle = computed(() => t('page.tasks.questcard.lightkeeper_tooltip'));
  const craftableTitleText = computed(
    () => props.craftableTitle.trim() || t('needed_items.craft.craftable')
  );
</script>
