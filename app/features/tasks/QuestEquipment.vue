<template>
  <div>
    <div class="mb-2 text-xs font-medium text-gray-400">
      {{ $t('page.tasks.questcard.equipment_header') }}
    </div>
    <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <div v-for="item in equipment" :key="item.id" class="inline-block">
        <GameItem
          :item-id="item.id"
          :item-name="item.name"
          :copy-value="item.name"
          :dev-link="item.link"
          :wiki-link="item.wikiLink"
          :count="item.count"
          size="xs"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { TarkovItem } from '@/types/tarkov';
  interface EquipmentItem extends TarkovItem {
    count: number;
  }
  defineProps<{
    equipment: EquipmentItem[];
  }>();
</script>
