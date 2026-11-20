<template>
  <UPopover v-if="hasAlternatives" :open="open" :content="contentOptions" @update:open="setOpen">
    <UButton
      type="button"
      size="xs"
      color="warning"
      variant="soft"
      icon="i-mdi-swap-horizontal"
      class="min-h-6 shrink-0 gap-1 px-1.5 py-0 text-[11px]"
      :ui="{ leadingIcon: 'size-3' }"
      :aria-label="t('page.tasks.questcard.alternatives_button', { count: alternativeCount })"
      data-testid="task-alternatives-trigger"
      @pointerenter="openOnHover"
      @pointerleave="scheduleHoverClose"
      @click.capture="keepHoverOpen"
    >
      {{ t('page.tasks.questcard.alternatives_badge', { count: alternativeCount }) }}
    </UButton>
    <template #content>
      <div
        ref="panel"
        data-testid="task-alternatives"
        class="max-h-(--reka-popper-available-height) w-72 max-w-(--reka-popper-available-width) overflow-y-auto p-2.5 text-xs"
        @focusin="activatePanel"
        @pointerenter="cancelHoverClose"
        @pointerleave="scheduleHoverClose"
      >
        <div class="text-warning-200 font-semibold">
          {{ t('page.tasks.questcard.quest_alternatives') }}
        </div>
        <ul class="mt-1 space-y-1.5">
          <li v-for="group in alternativeGroups" :key="group.label">
            <p class="text-surface-300">{{ group.label }}</p>
            <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              <router-link
                v-for="alternative in group.tasks"
                :key="alternative.id"
                :to="{ path: '/tasks', query: { task: alternative.id } }"
                class="text-link hover:text-link-hover focus-visible:ring-primary-500 block min-h-6 max-w-full content-center rounded-sm font-medium wrap-anywhere underline underline-offset-2 focus-visible:ring-2"
                @click="closeAfterLink"
              >
                {{ alternative.name }}
              </router-link>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </UPopover>
</template>
<script setup lang="ts">
  import { useTimeoutFn } from '@vueuse/core';
  import { useMetadataStore } from '@/stores/useMetadata';
  const props = defineProps<{ taskId: string }>();
  const metadataStore = useMetadataStore();
  const { t } = useI18n({ useScope: 'global' });
  const open = ref(false);
  let manageFocus = false;
  const panel = useTemplateRef<HTMLDivElement>('panel');
  const contentOptions = computed(() => ({
    align: 'end' as const,
    sideOffset: 4,
    'aria-label': t('page.tasks.questcard.quest_alternatives'),
    onOpenAutoFocus: preserveFocus,
    onCloseAutoFocus: preserveFocus,
  }));
  const { start: startHoverClose, stop: cancelHoverClose } = useTimeoutFn(
    () => setOpen(false),
    200,
    { immediate: false }
  );
  function setOpen(next: boolean) {
    cancelHoverClose();
    if (next) manageFocus = true;
    open.value = next;
  }
  function openOnHover(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    cancelHoverClose();
    if (open.value) return;
    manageFocus = false;
    open.value = true;
  }
  function scheduleHoverClose() {
    if (open.value && !manageFocus) startHoverClose();
  }
  function preserveFocus(event: Event) {
    if (!manageFocus) event.preventDefault();
  }
  function activatePanel() {
    cancelHoverClose();
    manageFocus = true;
  }
  function keepHoverOpen(event: MouseEvent) {
    if (!open.value || manageFocus) return;
    // The first click keeps a hovered preview open so later clicks can toggle it.
    event.stopImmediatePropagation();
    activatePanel();
    panel.value?.querySelector('a')?.focus();
  }
  function closeAfterLink() {
    // Let the quest deep link handle navigation without refocusing the old chip.
    manageFocus = false;
    setOpen(false);
  }
  const alternativeGroups = computed(() => {
    const id = props.taskId;
    const targets = new Set(metadataStore.alternativeTasks[id]);
    const sources = new Set(metadataStore.alternativeTaskSources[id]);
    if (!targets.size && !sources.size) return [];
    const resolveTasks = (ids: string[]) =>
      ids.flatMap((taskId) => {
        const task = metadataStore.getTaskById(taskId);
        return task?.name ? [task] : [];
      });
    return [
      {
        label: t('page.tasks.questcard.alternatives_mutual'),
        tasks: resolveTasks([...targets].filter((taskId) => sources.has(taskId))),
      },
      {
        label: t('page.tasks.questcard.alternatives_failed_by_this'),
        tasks: resolveTasks([...targets].filter((taskId) => !sources.has(taskId))),
      },
      {
        label: t('page.tasks.questcard.alternatives_fail_this'),
        tasks: resolveTasks([...sources].filter((taskId) => !targets.has(taskId))),
      },
    ].filter((group) => group.tasks.length > 0);
  });
  const alternativeCount = computed(() =>
    alternativeGroups.value.reduce((count, group) => count + group.tasks.length, 0)
  );
  const hasAlternatives = computed(() => alternativeCount.value > 0);
  watch([() => props.taskId, hasAlternatives], () => setOpen(false));
</script>
