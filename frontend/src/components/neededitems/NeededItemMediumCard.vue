<template>
  <v-lazy :options="{ threshold: 0.5 }" min-height="100" class="fill-height">
    <v-sheet rounded :class="itemCardClasses">
      <!-- Flexbox display -->
      <div class="fill-height">
        <div class="d-flex flex-column align-end fill-height">
          <!-- Item image -->
          <div class="d-flex align-self-stretch item-panel">
            <v-img
              v-if="imageItem"
              :src="imageItem.image512pxLink"
              :lazy-src="imageItem.baseImageLink"
              :class="itemImageClasses"
            >
              <template #placeholder>
                <v-row class="fill-height ma-0" align="center" justify="center">
                  <v-progress-circular indeterminate color="grey-lighten-5"></v-progress-circular>
                </v-row>
              </template>
            </v-img>
          </div>
          <!-- Item name, directly below item image -->
          <div v-if="item" class="d-flex align-self-center mt-2 mx-2">
            <div class="text-center px-2" style="white-space: pre-line">
              {{ item.name }}
              <v-icon v-if="props.need.foundInRaid" size="x-small"
                >mdi-checkbox-marked-circle-outline</v-icon
              >
            </div>
          </div>
          <!-- Item need details -->
          <div class="d-flex flex-column align-self-center mt-2 mx-2">
            <template v-if="props.need.needType == 'taskObjective'">
              <task-link :task="relatedTask" />
              <v-row v-if="lockedBefore > 0" no-gutters class="mb-1 mt-1 d-flex justify-center">
                <v-col cols="auto" class="mr-1" align="center">
                  <v-icon icon="mdi-lock-open-outline" />
                </v-col>
                <v-col cols="auto" align="center">
                  <i18n-t keypath="page.tasks.questcard.lockedbefore" scope="global">
                    <template #count>
                      {{ lockedBefore }}
                    </template>
                  </i18n-t>
                </v-col>
              </v-row>
              <v-row
                v-if="levelRequired > 0 && levelRequired > tarkovStore.playerLevel"
                no-gutters
                class="mb-1 mt-1 d-flex justify-center"
              >
                <v-col cols="auto" class="mr-1" align="center">
                  <v-icon icon="mdi-menu-right" />
                </v-col>
                <v-col cols="auto" align="center">
                  <i18n-t keypath="page.tasks.questcard.level" scope="global">
                    <template #count>
                      {{ levelRequired }}
                    </template>
                  </i18n-t>
                </v-col>
              </v-row>
            </template>
            <template v-else-if="props.need.needType == 'hideoutModule'">
              <v-row dense no-gutters class="mb-1 mt-1 d-flex justify-center">
                <v-col cols="auto" align="center">
                  <station-link :station="relatedStation" class="justify-center" />
                </v-col>
                <v-col cols="auto" class="ml-1">{{ props.need.hideoutModule.level }}</v-col>
              </v-row>
              <v-row v-if="lockedBefore > 0" no-gutters class="mb-1 mt-1 d-flex justify-center">
                <v-col cols="auto" class="mr-1" align="center">
                  <v-icon icon="mdi-lock-open-outline" />
                </v-col>
                <v-col cols="auto" align="center">
                  <i18n-t keypath="page.tasks.questcard.lockedbefore" scope="global">
                    <template #count>
                      {{ lockedBefore }}
                    </template>
                  </i18n-t>
                </v-col>
              </v-row>
              <v-row v-if="levelRequired > 0" no-gutters class="mb-1 mt-1 d-flex justify-center">
                <v-col cols="auto" class="mr-1" align="center">
                  <v-icon icon="mdi-menu-right" />
                </v-col>
                <v-col cols="auto" align="center">
                  <i18n-t keypath="page.tasks.questcard.level" scope="global">
                    <template #count>
                      {{ levelRequired }}
                    </template>
                  </i18n-t>
                </v-col>
              </v-row>
            </template>
          </div>
          <!-- Item count actions -->
          <div
            v-if="!selfCompletedNeed"
            class="d-flex fill-height align-self-stretch justify-space-between mt-2 mb-2 mx-2"
          >
            <div class="align-self-end">
              <v-btn variant="tonal" class="pa-0 ma-0" @click="$emit('decreaseCount')"
                ><v-icon>mdi-minus-thick</v-icon></v-btn
              >
            </div>
            <div class="mx-1 align-self-end">
              <v-btn variant="tonal" class="pa-0 px-1 ma-0" @click="$emit('toggleCount')">
                {{ currentCount.toLocaleString() }}/{{ neededCount.toLocaleString() }}
              </v-btn>
            </div>
            <div class="align-self-end">
              <v-btn variant="tonal" class="pa-0 ma-0" @click="$emit('increaseCount')"
                ><v-icon>mdi-plus-thick</v-icon></v-btn
              >
            </div>
          </div>
          <div v-else class="d-flex fill-height align-self-stretch justify-center mt-2 mb-2 mx-2">
            <div class="align-self-end text-center">
              <i18n-t keypath="page.neededitems.neededby" scope="global">
                <template #users>
                  <div
                    v-for="(userNeed, userIndex) in teamNeeds"
                    :key="userIndex"
                    style="white-space: pre-line"
                  >
                    <v-icon size="x-small" class="mr-1">mdi-account-child-circle</v-icon
                    >{{ progressStore.getDisplayName(userNeed.user) }}
                    {{ userNeed.count.toLocaleString() }}/{{ neededCount.toLocaleString() }}
                  </div>
                </template>
              </i18n-t>
            </div>
          </div>
        </div>
      </div>
    </v-sheet>
  </v-lazy>
</template>
<script setup>
  import { defineAsyncComponent, computed, inject } from 'vue';
  import { useProgressStore } from '@/stores/progress';
  import { useTarkovStore } from '@/stores/tarkov';
  const TaskLink = defineAsyncComponent(() => import('@/components/tasks/TaskLink'));
  const StationLink = defineAsyncComponent(() => import('@/components/hideout/StationLink'));
  const props = defineProps({
    need: {
      type: Object,
      required: true,
    },
  });
  defineEmits(['increaseCount', 'decreaseCount', 'toggleCount']);
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const {
    selfCompletedNeed,
    relatedTask,
    relatedStation,
    lockedBefore,
    neededCount,
    currentCount,
    levelRequired,
    item,
    teamNeeds,
    imageItem,
  } = inject('neededitem');
  const itemImageClasses = computed(() => {
    return {
      [`item-bg-${item.value.backgroundColor}`]: true,
      rounded: true,
      'elevation-2': true,
      'item-image': true,
      'pa-1': true,
      'fill-height': true,
    };
  });
  const itemCardClasses = computed(() => {
    return {
      'item-complete': selfCompletedNeed.value || currentCount.value >= neededCount.value,
      'fill-height': true,
    };
  });
</script>
<style lang="scss">
  .item-complete {
    background: linear-gradient(
      0deg,
      rgba(var(--v-theme-complete), 1) 0%,
      rgba(var(--v-theme-surface), 1) 75%
    ) !important;
  }
  .item-panel {
    aspect-ratio: 16/9;
    min-height: 138px;
  }
  .item-image {
    min-height: 90px;
  }
  .item-bg-violet {
    background-color: #2c232f;
  }
  .item-bg-grey {
    background-color: #1e1e1e;
  }
  .item-bg-yellow {
    background-color: #343421;
  }
  .item-bg-orange {
    background-color: #261d14;
  }
  .item-bg-green {
    background-color: #1a2314;
  }
  .item-bg-red {
    background-color: #38221f;
  }
  .item-bg-default {
    background-color: #3a3c3b;
  }
  .item-bg-black {
    background-color: #141614;
  }
  .item-bg-blue {
    background-color: #202d32;
  }
</style>
