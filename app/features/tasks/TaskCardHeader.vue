<template>
  <div class="flex min-w-0 items-center gap-2">
    <AppTooltip :text="titleTooltip">
      <component :is="titleComponent" v-bind="titleProps" :class="titleClass">
        <div class="bg-surface-800 h-9 w-9 shrink-0 overflow-hidden rounded-full">
          <NuxtImg
            v-if="task?.trader?.imageLink"
            :src="task.trader.imageLink"
            :alt="task?.trader?.name || 'Trader'"
            width="36"
            height="36"
            sizes="36px"
            class="h-full w-full object-cover"
          />
          <UIcon v-else name="i-mdi-account-circle" class="text-surface-400 h-full w-full" />
        </div>
        <NuxtImg
          v-if="factionImage"
          :src="factionImage"
          :alt="task?.factionName"
          width="24"
          height="24"
          sizes="24px"
          class="h-6 w-6 shrink-0 object-contain invert"
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
    <div class="ml-2 flex shrink-0 items-center gap-1.5">
      <AppTooltip
        v-if="task?.wikiLink && !shouldLinkToWiki"
        :text="t('page.tasks.questcard.view_on_wiki')"
      >
        <a
          :href="toWikiUrl(task.wikiLink)"
          target="_blank"
          rel="noopener noreferrer"
          :class="ICON_BUTTON_CLASS"
          :aria-label="t('page.tasks.questcard.view_on_wiki')"
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
      <AppTooltip v-if="task?.id" :text="t('page.tasks.questcard.view_on_tarkov_dev')">
        <a
          :href="tarkovDevTaskUrl"
          target="_blank"
          rel="noopener noreferrer"
          :class="ICON_BUTTON_CLASS"
          :aria-label="t('page.tasks.questcard.view_on_tarkov_dev')"
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
      <AppTooltip
        v-if="(task.minPlayerLevel ?? 0) > 0"
        :text="
          t(
            'page.tasks.questcard.level_badge_tooltip',
            { level: task.minPlayerLevel },
            `Minimum player level ${task.minPlayerLevel} required to unlock this quest`
          )
        "
      >
        <UBadge
          size="xs"
          :color="meetsLevelRequirement ? 'success' : 'error'"
          variant="soft"
          class="shrink-0 cursor-help text-[11px]"
        >
          {{ t('page.tasks.questcard.level_badge', { count: task.minPlayerLevel }) }}
        </UBadge>
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
    meetsLevelRequirement: boolean;
  }>();
  const route = useRoute();
  const { t } = useI18n({ useScope: 'global' });
  const { toWikiUrl } = useWikiLink();
  const factionImage = computed(() => getFactionIconPath(props.task.factionName));
  const tarkovDevTaskUrl = computed(() => `https://tarkov.dev/task/${props.task.id}`);
  const isTasksRoute = computed(() => route.path.startsWith('/tasks'));
  const shouldLinkToWiki = computed(() => isTasksRoute.value && Boolean(props.task?.wikiLink));
  const titleComponent = computed(() => {
    if (shouldLinkToWiki.value) return 'a';
    if (props.task?.id) return 'router-link';
    return 'div';
  });
  const titleProps = computed(() => {
    if (shouldLinkToWiki.value) {
      return {
        href: toWikiUrl(props.task.wikiLink),
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
