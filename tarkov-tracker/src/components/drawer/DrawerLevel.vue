<template>
  <div class="d-flex justify-center align-center mb-2">
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
          type="number"
          :min="minPlayerLevel"
          :max="maxPlayerLevel"
          v-model.number="levelInputValue"
          @blur="saveLevel"
          @keyup.enter="saveLevel"
          style="font-size: 2.5em; width: 2.5em; text-align: center"
        />
      </div>
    </span>
    <span v-if="!mdAndDown">
      <div>
        <v-btn
          icon
          size="small"
          variant="plain"
          @click="incrementLevel"
          :disabled="tarkovStore.playerLevel() >= maxPlayerLevel"
        >
          <v-icon class="ma-0" small> mdi-chevron-up </v-icon>
        </v-btn>
      </div>
      <div>
        <v-btn
          icon
          size="small"
          variant="plain"
          @click="decrementLevel"
          :disabled="tarkovStore.playerLevel() <= minPlayerLevel"
        >
          <v-icon class="ma-0" small> mdi-chevron-down </v-icon>
        </v-btn>
      </div>
    </span>
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
  import { useAppStore } from '@/stores/app';
  import { useDisplay } from 'vuetify';
  import { useI18n } from 'vue-i18n';
  import { useTarkovData } from '@/composables/tarkovdata';
  const { t } = useI18n({ useScope: 'global' });
  const { mdAndDown } = useDisplay();
  const tarkovStore = useTarkovStore();
  const appStore = useAppStore();
  const { minPlayerLevel, maxPlayerLevel } = useTarkovData();
  const pmcFactionIcon = computed(() => {
    return `/img/factions/${tarkovStore.getPMCFaction()}.webp`;
  });
  const groupIcon = computed(() => {
    const level = tarkovStore.playerLevel();
    const groupNum =
      typeof level === 'number' && !isNaN(level)
        ? Math.floor(level / 5) + 1
        : 1;
    return `/img/levelgroups/${groupNum}.png`;
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
    newLevel = Math.max(
      minPlayerLevel.value,
      Math.min(maxPlayerLevel.value, newLevel)
    );
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
