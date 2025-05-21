<template>
  <div class="d-flex justify-center align-center mb-2">
    <template v-if="isCollapsed">
      <div class="text-center">
        <div style="font-size: 0.7em" class="mb-1">
          {{ t('navigation_drawer.level') }}
        </div>
        <h1 class="rail-level-number">{{ tarkovStore.playerLevel() }}</h1>
      </div>
    </template>
    <template v-else>
      <span v-if="!mdAndDown" style="line-height: 0px">
        <div class="crossfade">
          <img
            :src="pmcFactionIcon"
            style="max-width: 64px"
            class="px-2 faction-icon crossfade-faction"
          />
          <img :src="groupIcon" style="max-width: 64px" class="crossfade-level" />
        </div>
      </span>
      <span>
        <div style="font-size: 0.7em" class="text-center mb-1">
          {{ t('navigation_drawer.level') }}
        </div>
        <div class="text-center">
          <h1
            v-if="!editingLevel"
            style="font-size: 2.5em; line-height: 0.8em; cursor: pointer"
            @click="startEditingLevel"
          >
            {{ tarkovStore.playerLevel() }}
          </h1>
          <input
            v-else
            ref="levelInput"
            v-model.number="levelInputValue"
            type="number"
            :min="minPlayerLevel"
            :max="maxPlayerLevel"
            style="font-size: 2.5em; width: 2.5em; text-align: center"
            @blur="saveLevel"
            @keyup.enter="saveLevel"
          />
        </div>
      </span>
      <span v-if="!mdAndDown">
        <div>
          <v-btn
            icon
            size="small"
            variant="plain"
            :disabled="tarkovStore.playerLevel() >= maxPlayerLevel"
            @click="incrementLevel"
          >
            <v-icon class="ma-0" small> mdi-chevron-up </v-icon>
          </v-btn>
        </div>
        <div>
          <v-btn
            icon
            size="small"
            variant="plain"
            :disabled="tarkovStore.playerLevel() <= minPlayerLevel"
            @click="decrementLevel"
          >
            <v-icon class="ma-0" small> mdi-chevron-down </v-icon>
          </v-btn>
        </div>
      </span>
    </template>
  </div>
  <!-- <template v-if="mdAndDown">

    </template>
    <template v-else>
      {{ tarkovStore.storeSelected }}
    </template> -->
</template>
<script setup>
  import { computed, ref, nextTick } from 'vue';
  import { useTarkovStore } from '@/stores/tarkov';
  import { useDisplay } from 'vuetify';
  import { useI18n } from 'vue-i18n';
  import { useTarkovData } from '@/composables/tarkovdata';
  const { t } = useI18n({ useScope: 'global' });
  const { mdAndDown } = useDisplay();
  defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });
  const tarkovStore = useTarkovStore();
  const { minPlayerLevel, maxPlayerLevel, playerLevels } = useTarkovData();
  const pmcFactionIcon = computed(() => {
    return `/img/factions/${tarkovStore.getPMCFaction()}.webp`;
  });
  const groupIcon = computed(() => {
    const level = tarkovStore.playerLevel();
    const entry = playerLevels.value.find((pl) => pl.level === level);
    return entry?.levelBadgeImageLink ?? '';
  });

  // Manual level editing logic
  const editingLevel = ref(false);
  const levelInputValue = ref(tarkovStore.playerLevel());
  const levelInput = ref(null);

  function startEditingLevel() {
    editingLevel.value = true;
    levelInputValue.value = tarkovStore.playerLevel();
    nextTick(() => {
      if (levelInput.value) levelInput.value.focus();
    });
  }

  function saveLevel() {
    let newLevel = parseInt(levelInputValue.value, 10);
    if (isNaN(newLevel)) newLevel = minPlayerLevel.value;
    newLevel = Math.max(minPlayerLevel.value, Math.min(maxPlayerLevel.value, newLevel));
    tarkovStore.setLevel(newLevel);
    editingLevel.value = false;
  }
  function incrementLevel() {
    if (tarkovStore.playerLevel() < maxPlayerLevel.value) {
      tarkovStore.setLevel(tarkovStore.playerLevel() + 1);
    }
  }
  function decrementLevel() {
    if (tarkovStore.playerLevel() > minPlayerLevel.value) {
      tarkovStore.setLevel(tarkovStore.playerLevel() - 1);
    }
  }
</script>
<style lang="scss" scoped>
  .faction-icon {
    filter: invert(1);
  }
  .crossfade {
    position: relative;
    width: 64px;
    height: 64px;
    overflow: hidden;
  }
  .crossfade-faction {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    opacity: 0;
    margin-top: 8px;
    transition: opacity 1s ease-in-out;
  }
  .crossfade-level {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    opacity: 1;
    transition: opacity 1s ease-in-out;
  }
  .crossfade:hover .crossfade-faction {
    opacity: 1;
  }
  .crossfade:hover .crossfade-level {
    opacity: 0;
  }
  .rail-level-number {
    font-size: 2em;
    font-weight: bold;
    text-align: center;
    margin: 0;
    padding: 0;
    line-height: 1.2;
  }
</style>

<style>
  input[type='number']::-webkit-inner-spin-button,
  input[type='number']::-webkit-outer-spin-button {
    -webkit-appearance: none !important;
    margin: 0;
  }
  input[type='number'] {
    appearance: textfield !important;
    -moz-appearance: textfield !important;
  }
</style>
