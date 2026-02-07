<template>
  <div class="inline-block">
    <div class="text-surface-400 mb-2 flex flex-wrap items-center gap-1 text-xs font-medium">
      <span>{{ $t('page.tasks.questcard.keys_header') }}</span>
      <AppTooltip :text="$t('page.tasks.questcard.keys_disclaimer_tooltip')">
        <button
          type="button"
          class="text-surface-500 focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 hover:text-surface-300 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          :aria-label="$t('page.tasks.questcard.keys_disclaimer_aria')"
        >
          <UIcon name="i-mdi-information-outline" class="h-3.5 w-3.5" />
        </button>
      </AppTooltip>
    </div>
    <div
      v-for="(keyGroup, keyGroupIndex) in props.requiredKeys"
      :key="keyGroupIndex"
      class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      <span
        v-if="keyGroup.optional"
        class="border-warning-500/30 bg-warning-500/10 text-warning-300 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
      >
        {{ t('page.tasks.questcard.keys_optional_badge') }}
      </span>
      <i18n-t
        keypath="page.tasks.questcard.keys_needed"
        :plural="keyGroup.anyOf ? 2 : 1"
        scope="global"
      >
        <template #keys>
          <span
            v-for="(key, keyIndex) in keyGroup.keys"
            :key="keyIndex"
            class="relative mr-1 inline-flex items-center gap-1.5"
            @contextmenu="handleKeyContextMenu($event, key)"
          >
            <AppTooltip :ui="{ content: 'p-0 h-auto rounded-lg overflow-hidden' }">
              <img
                :src="getKeyIconSrc(key)"
                :alt="key.name || key.shortName || key.id"
                loading="lazy"
                class="h-8 w-8 shrink-0 cursor-pointer rounded transition-opacity hover:opacity-80"
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
                class="text-link hover:text-link-hover focus-visible:ring-primary-500 inline-flex items-center gap-0.5 rounded-sm text-sm font-bold no-underline focus:outline-none focus-visible:ring-2"
              >
                {{ key.name || key.shortName || key.id }}
                <template v-if="key.shortName && key.name">({{ key.shortName }})</template>
                <UIcon name="i-mdi-open-in-new" class="text-surface-400 h-3 w-3 shrink-0" />
              </a>
            </AppTooltip>
            <AppTooltip :text="t('page.tasks.questcard.view_on_tarkov_dev')">
              <a
                :href="getKeyDevUrl(key)"
                target="_blank"
                rel="noopener noreferrer"
                class="text-surface-400 hover:text-surface-200 inline-flex items-center rounded p-0.5 transition-colors"
                @click.stop
              >
                <img
                  src="/img/logos/tarkovdevlogo.webp"
                  :alt="t('page.tasks.questcard.view_on_tarkov_dev')"
                  class="h-4 w-4"
                />
              </a>
            </AppTooltip>
          </span>
        </template>
        <template #map>
          {{ getMapLabel(keyGroup.maps) }}
        </template>
      </i18n-t>
    </div>
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
  import type { RequiredKeyGroup, TarkovItem } from '@/types/tarkov';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps<{ requiredKeys: RequiredKeyGroup[] }>();
  const { copyToClipboard } = useCopyToClipboard();
  const contextMenu = ref<InstanceType<typeof ContextMenu>>();
  const activeKey = ref<TarkovItem>();
  const getMapLabel = (maps?: RequiredKeyGroup['maps']) =>
    maps?.map((map: { id: string; name?: string }) => map.name || map.id).join(', ') ?? '';
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
