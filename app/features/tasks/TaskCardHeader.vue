<template>
  <div class="flex min-w-0 items-center gap-2">
    <AppTooltip :text="titleTooltip">
      <component :is="titleComponent" v-bind="titleProps" :class="titleClass">
        <div class="bg-surface-800 h-7 w-7 shrink-0 overflow-hidden rounded-full">
          <NuxtImg
            v-if="task?.trader?.imageLink"
            :src="task.trader.imageLink"
            :alt="task?.trader?.name || 'Trader'"
            width="28"
            height="28"
            sizes="28px"
            class="h-full w-full object-cover"
          />
          <UIcon v-else name="i-mdi-account-circle" class="text-surface-400 h-full w-full" />
        </div>
        <NuxtImg
          v-if="factionImage"
          :src="factionImage"
          :alt="task?.factionName"
          width="20"
          height="20"
          sizes="20px"
          class="h-5 w-5 shrink-0 object-contain invert"
        />
        <span class="min-w-0 text-sm font-semibold sm:truncate sm:text-base">
          {{ task?.name }}
        </span>
        <UIcon
          v-if="shouldLinkToWiki"
          name="i-mdi-open-in-new"
          class="text-surface-400 h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        />
      </component>
    </AppTooltip>
    <div class="flex shrink-0 items-center">
      <AppTooltip
        v-if="taskWikiUrl && !shouldLinkToWiki"
        :text="t('common.view_on_wiki', 'View on Wiki')"
      >
        <a
          :href="taskWikiUrl"
          target="_blank"
          rel="noopener noreferrer"
          :class="ICON_BUTTON_CLASS"
          :aria-label="t('common.view_on_wiki', 'View on Wiki')"
          @click.stop
        >
          <NuxtImg
            src="/img/logos/wikilogo.webp"
            alt="Wiki"
            aria-hidden="true"
            width="20"
            height="20"
            sizes="20px"
            class="h-5 w-5"
          />
        </a>
      </AppTooltip>
      <AppTooltip v-if="task?.id" :text="t('common.view_on_tarkov_dev', 'View on Tarkov.dev')">
        <a
          :href="tarkovDevTaskUrl"
          target="_blank"
          rel="noopener noreferrer"
          :class="ICON_BUTTON_CLASS"
          :aria-label="t('common.view_on_tarkov_dev', 'View on Tarkov.dev')"
          @click.stop
        >
          <NuxtImg
            src="/img/logos/tarkovdevlogo.webp"
            alt="tarkov.dev"
            aria-hidden="true"
            width="20"
            height="20"
            sizes="20px"
            class="h-5 w-5"
          />
        </a>
      </AppTooltip>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useWikiLink } from '@/composables/useWikiLink';
  import { getFactionIconPath } from '@/utils/factionIcons';
  import type { Task } from '@/types/tarkov';
  const props = defineProps<{
    task: Task;
  }>();
  const route = useRoute();
  const { t } = useI18n({ useScope: 'global' });
  const { toWikiUrl } = useWikiLink();
  const factionImage = computed(() => getFactionIconPath(props.task.factionName));
  const tarkovDevTaskUrl = computed(() => `https://tarkov.dev/task/${props.task.id}`);
  const isTasksRoute = computed(() => route.path.startsWith('/tasks'));
  const taskWikiUrl = computed(() => toWikiUrl(props.task?.wikiLink));
  const shouldLinkToWiki = computed(() => isTasksRoute.value && Boolean(taskWikiUrl.value));
  const titleComponent = computed(() => {
    if (shouldLinkToWiki.value) return 'a';
    if (props.task?.id) return 'router-link';
    return 'div';
  });
  const titleProps = computed(() => {
    if (shouldLinkToWiki.value) {
      return {
        href: taskWikiUrl.value,
        target: '_blank',
        rel: 'noopener noreferrer',
      };
    }
    if (props.task?.id) {
      return { to: { path: '/tasks', query: { task: String(props.task.id) } } };
    }
    return {};
  });
  const titleClass = computed(() =>
    titleComponent.value === 'div'
      ? 'text-surface-100 flex min-w-0 items-center gap-2'
      : 'text-link hover:text-link-hover flex min-w-0 items-center gap-2 no-underline'
  );
  const ICON_BUTTON_CLASS = [
    'focus-visible:ring-primary-500',
    'focus-visible:ring-offset-surface-900',
    'text-surface-400',
    'hover:text-surface-200',
    'inline-flex items-center justify-center rounded p-1 transition-colors',
    'hover:bg-white/10 focus:outline-none',
    'focus-visible:ring-2 focus-visible:ring-offset-2',
  ];
  const titleTooltip = computed(() => {
    if (shouldLinkToWiki.value) {
      return t(
        'page.tasks.questcard.view_task_on_wiki',
        { name: props.task?.name ?? '' },
        `View ${props.task?.name ?? ''} on Wiki`
      );
    }
    return props.task?.name ?? '';
  });
</script>
