<template>
  <fitted-card icon="mdi-filter-cog" icon-color="white">
    <template #title>
      {{ $t('page.settings.card.questfilter.title') }}
    </template>
    <template #content>
      {{ $t('page.settings.card.questfilter.description') }}
      <v-container>
        <v-row justify="center">
          <v-col cols="12">
            <v-switch
              v-model="hideGlobalTasks"
              :label="$t(hideGlobalTasksLabel)"
              :disabled="Boolean(userStore.saving && userStore.saving.hideGlobalTasks)"
              inset
              true-icon="mdi-eye-off"
              false-icon="mdi-eye"
              :color="hideGlobalTasksColor"
              hide-details
              density="compact"
            ></v-switch>
            <v-switch
              v-model="hideNonKappaTasks"
              :label="$t(hideNonKappaTasksLabel)"
              :disabled="Boolean(userStore.saving && userStore.saving.hideNonKappaTasks)"
              inset
              true-icon="mdi-eye-off"
              false-icon="mdi-eye"
              :color="hideNonKappaTasksColor"
              hide-details
              density="compact"
            ></v-switch>
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
  import { useI18n } from 'vue-i18n';
  import { computed } from 'vue';
  import { useTarkovStore } from '@/stores/tarkov';
  import { useUserStore } from '@/stores/user';
  import FittedCard from '@/components/FittedCard.vue';

  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
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
  const hideGlobalTasksColor = computed(() => (hideGlobalTasks.value ? 'error' : 'success'));
  const hideNonKappaTasksColor = computed(() => (hideNonKappaTasks.value ? 'error' : 'success'));
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
