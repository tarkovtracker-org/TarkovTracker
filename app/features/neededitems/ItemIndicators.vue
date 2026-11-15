<template>
  <span
    v-if="foundInRaid || kappaRequired || lightkeeperRequired || isCraftable"
    class="bg-surface-900/60 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 ring-1 ring-white/10"
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
        class="-m-0.5 inline-flex p-0.5"
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
      craftableIconBaseClass: 'size-4',
      craftableIconClass: '',
      craftableTitle: '',
      firIconClass: 'size-4 text-warning-300',
      kappaIconClass: 'size-4 text-kappa',
      kappaRequired: false,
      lightkeeperIconClass: 'size-4 text-lightkeeper',
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
