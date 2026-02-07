<template>
  <div
    class="border-surface-700/50 bg-surface-800/30 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2 py-1.5"
  >
    <UIcon name="i-mdi-key-variant" aria-hidden="true" class="text-surface-400 h-3.5 w-3.5" />
    <span
      v-for="(key, keyIndex) in flatKeys"
      :key="key.id"
      class="relative inline-flex items-center gap-1"
      @contextmenu="handleKeyContextMenu($event, key)"
    >
      <AppTooltip :ui="{ content: 'p-0 h-auto rounded-lg overflow-hidden' }">
        <img
          :src="getKeyIconSrc(key)"
          :alt="key.name || key.shortName || key.id"
          loading="lazy"
          class="h-6 w-6 shrink-0 cursor-pointer rounded transition-opacity hover:opacity-80"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
          @click="openKeyPrimaryLink(key)"
        />
        <template #content>
          <img
            :src="getKeyPreviewSrc(key)"
            :alt="key.name || key.shortName || key.id"
            loading="lazy"
            class="block h-32 w-32 object-contain"
            :class="getKeyBackgroundClass(key)"
          />
        </template>
      </AppTooltip>
      <AppTooltip :text="getKeyPrimaryTooltip(key)">
        <a
          :href="getKeyPrimaryUrl(key)"
          target="_blank"
          rel="noopener noreferrer"
          class="text-link hover:text-link-hover focus-visible:ring-primary-500 inline-flex items-center gap-0.5 rounded-sm text-xs font-bold no-underline focus:outline-none focus-visible:ring-2"
          @click.stop
        >
          {{ key.shortName || key.name || key.id }}
          <UIcon name="i-mdi-open-in-new" class="text-surface-400 h-2.5 w-2.5 shrink-0" />
        </a>
      </AppTooltip>
      <AppTooltip :text="t('page.tasks.questcard.view_on_tarkov_dev')">
        <a
          :href="getKeyDevUrl(key)"
          target="_blank"
          rel="noopener noreferrer"
          class="text-surface-400 hover:text-surface-200 inline-flex items-center self-center rounded p-0.5 transition-colors"
          @click.stop
        >
          <img
            src="/img/logos/tarkovdevlogo.webp"
            :alt="t('page.tasks.questcard.tarkov_dev_logo')"
            class="h-3.5 w-3.5"
          />
        </a>
      </AppTooltip>
      <span
        v-if="isAnyOf && keyIndex < flatKeys.length - 1"
        class="text-surface-500 text-[10px] italic"
      >
        {{ $t('page.tasks.questcard.keys_or') }}
      </span>
    </span>
    <AppTooltip :text="$t('page.tasks.questcard.keys_disclaimer_tooltip')">
      <button
        type="button"
        class="text-surface-500 focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 hover:text-surface-300 inline-flex items-center self-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        :aria-label="$t('page.tasks.questcard.keys_disclaimer_aria')"
        @click.stop
      >
        <UIcon name="i-mdi-information-outline" class="h-3.5 w-3.5" />
      </button>
    </AppTooltip>
    <ContextMenu ref="contextMenu">
      <template #default="{ close }">
        <ContextMenuItem
          v-if="activeKey?.wikiLink"
          icon="/img/logos/wikilogo.webp"
          :label="
            t('page.tasks.questcard.view_task_on_wiki', {
              name: activeKey?.name || activeKey?.shortName || '',
            })
          "
          @click="
            openKeyWikiLink();
            close();
          "
        />
        <ContextMenuItem
          icon="/img/logos/tarkovdevlogo.webp"
          :label="
            t('quest.view_on_dev', {
              name: activeKey?.name || activeKey?.shortName || '',
            })
          "
          @click="
            openKeyDevLink();
            close();
          "
        />
        <div v-if="activeKey?.name" class="border-surface-700 my-1 border-t" />
        <ContextMenuItem
          v-if="activeKey?.name"
          icon="i-mdi-content-copy"
          :label="$t('page.tasks.questcard.copy_key_name')"
          @click="
            copyKeyName();
            close();
          "
        />
      </template>
    </ContextMenu>
  </div>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  import {
    getKeyBackgroundClass,
    getKeyDevUrl,
    getKeyIconSrc,
    getKeyPreviewSrc,
    getKeyPrimaryUrl,
  } from '@/utils/tarkovKeyHelpers';
  import type ContextMenu from '@/components/ui/ContextMenu.vue';
  import type { TarkovItem } from '@/types/tarkov';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps<{ requiredKeys: TarkovItem[][] }>();
  const { copyToClipboard } = useCopyToClipboard();
  const contextMenu = ref<InstanceType<typeof ContextMenu>>();
  const activeKey = ref<TarkovItem>();
  const flatKeys = computed(() => {
    const seen = new Set<string>();
    return props.requiredKeys.flat().filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  });
  const isAnyOf = computed(
    () => props.requiredKeys.length === 1 && (props.requiredKeys[0]?.length ?? 0) > 1
  );
  const getKeyPrimaryTooltip = (key: TarkovItem) =>
    key.wikiLink
      ? t('page.tasks.questcard.view_on_wiki')
      : t('page.tasks.questcard.view_on_tarkov_dev');
  const openKeyPrimaryLink = (key: TarkovItem) => {
    window.open(getKeyPrimaryUrl(key), '_blank', 'noopener,noreferrer');
  };
  const handleKeyContextMenu = (event: MouseEvent, key: TarkovItem) => {
    activeKey.value = key;
    contextMenu.value?.open(event);
  };
  const openKeyDevLink = () => {
    if (activeKey.value) {
      window.open(getKeyDevUrl(activeKey.value), '_blank', 'noopener,noreferrer');
    }
  };
  const openKeyWikiLink = () => {
    if (activeKey.value?.wikiLink) {
      window.open(activeKey.value.wikiLink, '_blank', 'noopener,noreferrer');
    }
  };
  const copyKeyName = async () => {
    if (activeKey.value?.name) {
      try {
        await copyToClipboard(activeKey.value.name);
      } catch (error) {
        logger.error('Failed to copy key name', {
          error,
          keyName: activeKey.value?.name,
        });
      }
    }
  };
</script>
