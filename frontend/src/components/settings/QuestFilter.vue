<template>
  <fitted-card icon="mdi-filter-cog" icon-color="white">
    <template #title>
      {{ $t('page.settings.card.questfilter.title') }}
    </template>
    <template #content>
      <div style="text-align: left" class="pt-2 px-4">
        {{ $t('page.settings.card.questfilter.description') }}
      </div>
      <v-container>
        <v-row justify="center">
          <v-col cols="12">
            <v-switch
              v-model="hideGlobalTasks"
              :disabled="Boolean(userStore.saving && userStore.saving.hideGlobalTasks)"
              inset
              true-icon="mdi-eye-off"
              false-icon="mdi-eye"
              color="error"
              base-color="green"
              hide-details
              density="compact"
            >
              <template #label>
                <div style="text-align: left">{{ $t(hideGlobalTasksLabel) }}</div>
              </template>
            </v-switch>
            <v-switch
              v-model="hideNonKappaTasks"
              :disabled="Boolean(userStore.saving && userStore.saving.hideNonKappaTasks)"
              inset
              true-icon="mdi-eye-off"
              false-icon="mdi-eye"
              color="error"
              base-color="green"
              hide-details
              density="compact"
            >
              <template #label>
                <div style="text-align: left">{{ $t(hideNonKappaTasksLabel) }}</div>
              </template>
            </v-switch>
            <v-progress-circular
              v-if="
                userStore.saving &&
                (userStore.saving.hideGlobalTasks || userStore.saving.hideNonKappaTasks)
              "
              indeterminate
              color="primary"
              size="20"
              class="ml-2 align-middle"
            />
          </v-col>
        </v-row>
      </v-container>
    </template>
  </fitted-card>
</template>
<script setup>
  import { computed } from 'vue';
  import { useUserStore } from '@/stores/user';
  import FittedCard from '@/components/FittedCard';

  const userStore = useUserStore();
  const hideGlobalTasks = computed({
    get: () => userStore.getHideGlobalTasks,
    set: (value) => userStore.setHideGlobalTasks(value),
  });
  const hideNonKappaTasks = computed({
    get: () => userStore.getHideNonKappaTasks,
    set: (value) => userStore.setHideNonKappaTasks(value),
  });
  const hideGlobalTasksLabel = computed(() =>
    hideGlobalTasks.value
      ? 'page.settings.card.questfilter.hide_global_tasks'
      : 'page.settings.card.questfilter.show_global_tasks'
  );
  const hideNonKappaTasksLabel = computed(() =>
    hideNonKappaTasks.value
      ? 'page.settings.card.questfilter.hide_non_kappa_tasks'
      : 'page.settings.card.questfilter.show_non_kappa_tasks'
  );
</script>
<style lang="scss" scoped>
  a:link,
  a:active,
  a:visited {
    color: rgba(var(--v-theme-link), 1);
  }
  .faction-invert {
    filter: invert(1);
  }
  .info-link {
    text-decoration: none;
  }
</style>
