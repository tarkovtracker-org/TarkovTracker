<template>
  <div class="inline-block">
    <div class="text-surface-400 mb-2 text-xs font-medium">
      {{ $t('page.tasks.questcard.keys_header', 'Suggested Keys') }}
      <span class="text-surface-500 font-normal">
        {{ $t('page.tasks.questcard.keys_subtext', '(may help but not always required)') }}
      </span>
    </div>
    <div
      v-for="(keyGroup, keyGroupIndex) in suggestedKeys"
      :key="keyGroupIndex"
      class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      <span
        v-if="keyGroup.optional"
        class="border-warning-500/30 bg-warning-500/10 text-warning-300 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
      >
        {{ t('page.tasks.questcard.keys_optional_badge', 'Optional') }}
      </span>
      <i18n-t
        keypath="page.tasks.questcard.keys_needed"
        :plural="keyGroup.keys.length"
        scope="global"
      >
        <template #keys>
          <span v-for="(key, keyIndex) in keyGroup.keys" :key="keyIndex" class="inline-block">
            <GameItem
              :item-id="key.id"
              :item-name="`${key.name} (${key.shortName})`"
              :copy-value="key.name"
              :dev-link="key.link"
              :wiki-link="key.wikiLink"
              :count="1"
              size="xs"
            />
          </span>
        </template>
        <template #map>
          {{ getMapLabel(keyGroup.maps) }}
        </template>
      </i18n-t>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { SuggestedKeyGroup } from '@/types/tarkov';
  const { t } = useI18n({ useScope: 'global' });
  const { suggestedKeys } = defineProps<{ suggestedKeys: SuggestedKeyGroup[] }>();
  const getMapLabel = (maps?: SuggestedKeyGroup['maps']) =>
    maps?.map((map) => map.name || map.id).join(', ') ?? '';
</script>
