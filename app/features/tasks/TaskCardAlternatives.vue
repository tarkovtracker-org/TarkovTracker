<template>
  <UPopover v-if="hasQuestLinks" :open="open" :content="contentOptions" @update:open="setOpen">
    <UButton
      type="button"
      size="xs"
      color="warning"
      variant="soft"
      icon="i-mdi-swap-horizontal"
      class="min-h-6 shrink-0 gap-1 px-1.5 py-0 text-[11px]"
      :ui="{ leadingIcon: 'size-3' }"
      :aria-label="t('page.tasks.questcard.quest_links')"
      data-testid="task-alternatives-trigger"
      @pointerenter="openOnHover"
      @pointerleave="scheduleHoverClose"
      @click.capture="keepHoverOpen"
    >
      {{ t('page.tasks.questcard.quest_links') }}
    </UButton>
    <template #content>
      <div
        ref="panel"
        data-testid="task-alternatives"
        class="flex max-h-(--reka-popper-available-height) w-md max-w-(--reka-popper-available-width) flex-col text-xs"
        @focusin="activatePanel"
        @pointerenter="cancelHoverClose"
        @pointerleave="scheduleHoverClose"
      >
        <div
          class="border-surface-700 flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-3 py-2.5"
        >
          <h3 class="text-surface-100 text-sm font-semibold">
            {{ t('page.tasks.questcard.quest_links') }}
          </h3>
          <span class="text-surface-300">
            {{ t('page.tasks.questcard.quest_links_count', { count: questLinkCount }) }}
          </span>
        </div>
        <div
          class="divide-surface-700 max-h-96 min-h-0 divide-y overflow-y-auto overscroll-contain"
        >
          <section v-for="group in questLinkGroups" :key="group.kind" class="px-3 pt-2.5 pb-1">
            <div class="flex items-start justify-between gap-3">
              <h4 class="text-surface-100 flex min-w-0 items-start gap-1.5 font-semibold">
                <UIcon
                  :name="group.icon"
                  :class="group.iconClass"
                  class="size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span class="wrap-anywhere">{{ group.label }}</span>
              </h4>
              <span class="text-surface-300 shrink-0 tabular-nums" aria-hidden="true">
                {{ group.tasks.length }}
              </span>
            </div>
            <p v-if="group.hint" class="text-surface-300 mt-1 ps-5">{{ group.hint }}</p>
            <ul class="divide-surface-700/70 mt-1 divide-y">
              <li v-for="quest in group.tasks" :key="quest.id">
                <router-link
                  :to="{ path: '/tasks', query: { task: quest.id } }"
                  class="text-link hover:text-link-hover hover:bg-surface-800 focus-visible:ring-primary-500 flex min-h-8 items-center justify-between gap-2 rounded-sm py-1.5 ps-5 pe-1 text-start font-medium focus-visible:ring-2 focus-visible:ring-inset pointer-coarse:min-h-11"
                  @click="closeAfterLink"
                >
                  <span class="min-w-0 wrap-anywhere">{{ quest.name || quest.id }}</span>
                  <UIcon
                    name="i-mdi-chevron-right"
                    class="text-surface-300 size-3.5 shrink-0 rtl:rotate-180"
                    aria-hidden="true"
                  />
                </router-link>
              </li>
            </ul>
          </section>
        </div>
        <AppTooltip v-if="impactCount" :text="t('page.tasks.questcard.impact_tooltip')">
          <p tabindex="0" class="text-surface-300 border-surface-700 border-t px-3 py-2">
            {{ t('common.impact') }}: {{ impactCount }}
          </p>
        </AppTooltip>
      </div>
    </template>
  </UPopover>
  <AppTooltip v-else-if="impactCount" :text="t('page.tasks.questcard.impact_tooltip')">
    <span
      tabindex="0"
      class="text-surface-400 border-surface-600 inline-flex shrink-0 cursor-help items-center gap-1 border-b border-dotted text-[11px]"
    >
      <UIcon name="i-mdi-sitemap" class="size-3 shrink-0" aria-hidden="true" />
      {{ t('common.impact') }}: {{ impactCount }}
    </span>
  </AppTooltip>
</template>
<script setup lang="ts">
  import { useTaskCardPreview } from '@/features/tasks/composables/useTaskCardPreview';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { Task } from '@/types/tarkov';
  const props = defineProps<{
    taskId: string;
    previousTasks: Task[];
    nextTasks: Task[];
    impactCount: number;
  }>();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const { t } = useI18n({ useScope: 'global' });
  const panel = useTemplateRef<HTMLDivElement>('panel');
  const {
    open,
    setOpen,
    openOnHover,
    scheduleHoverClose,
    cancelHoverClose,
    onOpenAutoFocus,
    onCloseAutoFocus,
    activatePanel,
    keepHoverOpen,
    closeAfterLink,
  } = useTaskCardPreview(panel);
  const contentOptions = computed(() => ({
    align: 'end' as const,
    sideOffset: 4,
    'aria-label': t('page.tasks.questcard.quest_links'),
    onOpenAutoFocus,
    onCloseAutoFocus,
  }));
  const questLinkGroups = computed(() => {
    const id = props.taskId;
    const targets = new Set(metadataStore.alternativeTasks[id]);
    const sources = new Set(metadataStore.alternativeTaskSources[id]);
    const resolveTasks = (ids: string[]) =>
      ids.flatMap((taskId) => {
        const task = metadataStore.getTaskById(taskId);
        return task?.name ? [task] : [];
      });
    return [
      {
        kind: 'mutual',
        label: t('page.tasks.questcard.quest_links_mutual'),
        hint: t('page.tasks.questcard.quest_links_mutual_hint'),
        icon: 'i-mdi-swap-horizontal',
        iconClass: 'text-warning-200',
        tasks: resolveTasks([...targets].filter((taskId) => sources.has(taskId))),
      },
      {
        kind: 'outgoing',
        label: t('page.tasks.questcard.quest_links_fails_others'),
        icon: 'i-mdi-arrow-right',
        iconClass: 'text-error-300',
        tasks: resolveTasks([...targets].filter((taskId) => !sources.has(taskId))),
      },
      {
        kind: 'incoming',
        label: t('page.tasks.questcard.quest_links_failed_by_others'),
        icon: 'i-mdi-arrow-left',
        iconClass: 'text-error-300',
        tasks: resolveTasks([...sources].filter((taskId) => !targets.has(taskId))),
      },
      {
        kind: 'next',
        label: t('page.tasks.questcard.unlocks_next'),
        hint: undefined,
        icon: 'i-mdi-arrow-right-circle-outline',
        iconClass: 'text-surface-300',
        tasks: preferencesStore.getShowNextQuests ? props.nextTasks : [],
      },
      {
        kind: 'previous',
        label: t('page.tasks.settings.cards.previous_tasks'),
        hint: undefined,
        icon: 'i-mdi-arrow-left-circle-outline',
        iconClass: 'text-surface-300',
        tasks: preferencesStore.getShowPreviousQuests ? props.previousTasks : [],
      },
    ].filter((group) => group.tasks.length > 0);
  });
  const questLinkCount = computed(() =>
    questLinkGroups.value.reduce((count, group) => count + group.tasks.length, 0)
  );
  const hasQuestLinks = computed(() => questLinkCount.value > 0);
  watch([() => props.taskId, hasQuestLinks], () => setOpen(false));
</script>
