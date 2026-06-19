<template>
  <div class="flex max-w-full min-w-0 items-center justify-between overflow-hidden">
    <AppTooltip :text="props.task?.name">
      <router-link
        :to="taskHref"
        class="text-link hover:text-link-hover flex min-w-0 items-center overflow-hidden no-underline"
      >
        <div
          class="shrink-0 overflow-hidden rounded-full"
          :class="compact ? 'h-4 w-4 sm:h-5 sm:w-5 lg:h-8 lg:w-8' : 'h-8 w-8 lg:h-12 lg:w-12'"
        >
          <img :src="traderAvatarSrc" :alt="traderAlt" class="h-full w-full object-cover" />
        </div>
        <template v-if="isFactionTask">
          <div
            class="ml-0.5 shrink-0 rounded-none"
            :class="compact ? 'h-4 w-4 sm:h-5 sm:w-5 lg:h-8 lg:w-8' : 'h-8 w-8 lg:h-12 lg:w-12'"
          >
            <img
              :src="factionImage"
              :alt="factionAlt"
              class="h-full w-full object-contain invert"
            />
          </div>
        </template>
        <span
          class="ml-1 truncate font-bold"
          :class="compact ? 'hidden text-xs lg:inline lg:text-sm' : 'text-sm lg:text-xl'"
        >
          {{ props.task?.name }}
        </span>
      </router-link>
    </AppTooltip>
    <a
      v-if="props.showWikiLink"
      :href="toWikiUrl(props.task.wikiLink)"
      target="_blank"
      class="text-link hover:text-link-hover flex items-center text-xs whitespace-nowrap"
    >
      <img src="/img/logos/wikilogo.webp" alt="Wiki" class="mr-1 h-6 w-6" />
      <span>{{ t('page.tasks.questcard.wiki') }}</span>
    </a>
  </div>
</template>
<script setup lang="ts">
  import { useWikiLink } from '@/composables/useWikiLink';
  import { getFactionIconPath } from '@/utils/factionIcons';
  const props = defineProps({
    task: {
      type: Object,
      required: true,
    },
    showWikiLink: {
      type: Boolean,
      required: false,
      default: false,
    },
    compact: {
      type: Boolean,
      required: false,
      default: false,
    },
  });
  const { t } = useI18n({ useScope: 'global' });
  const { toWikiUrl } = useWikiLink();
  const factionImage = computed(() => getFactionIconPath(props.task?.factionName) ?? undefined);
  const isFactionTask = computed(() => Boolean(factionImage.value));
  const factionAlt = computed(() => props.task?.factionName || 'Faction image');
  const traderAlt = computed(() => props.task?.trader?.name || 'Trader');
  const fallbackAvatar = '/img/default-avatar.svg';
  const traderAvatarSrc = computed(() => {
    const avatar = props.task?.trader?.imageLink;
    return typeof avatar === 'string' && avatar.trim().length > 0 ? avatar : fallbackAvatar;
  });
  const taskHref = computed(() => `/tasks?task=${props.task?.id}`);
</script>
