<template>
  <tracker-tip tip="tasks"></tracker-tip>
  <v-container>
    <v-row dense>
      <v-col lg="4" md="12">
        <!-- Primary views (all, maps, traders) -->
        <v-card>
          <v-tabs
            v-model="activePrimaryView"
            bg-color="accent"
            slider-color="secondary"
            align-tabs="center"
            show-arrows
          >
            <v-tab
              v-for="(view, index) in primaryViews"
              :key="index"
              :value="view.view"
              :prepend-icon="view.icon"
            >
              {{ view.title }}
            </v-tab>
          </v-tabs>
        </v-card>
      </v-col>
      <v-col v-show="activePrimaryView == 'all'" lg="8" md="12">
        <!-- The user has selected all quests, no need to filter by a sub-category -->
        <v-card>
          <v-tabs
            bg-color="accent"
            slider-color="secondary"
            align-tabs="center"
          >
            <v-tab value="all">
              {{ t("page.tasks.showing_all_sources") }}
            </v-tab>
          </v-tabs>
        </v-card>
      </v-col>
      <v-col v-show="activePrimaryView == 'maps'" lg="8" md="12">
        <!-- The user has selected quests by map -->
        <v-card>
          <v-tabs
            v-model="activeMapView"
            bg-color="accent"
            slider-color="secondary"
            align-tabs="center"
            show-arrows
          >
            <v-tab
              v-for="(map, index) in maps"
              :key="index"
              :value="map.id"
              prepend-icon="mdi-compass"
            >
              <template v-if="mapTaskTotals[map.id] > 0">
                <v-badge
                  color="secondary"
                  :content="mapTaskTotals[map.id]"
                  :label="String(mapTaskTotals[map.id])"
                  offset-y="-5"
                  offset-x="-10"
                >
                  {{ map.name }}
                </v-badge>
              </template>
              <template v-else>
                {{ map.name }}
              </template>
            </v-tab>
          </v-tabs>
        </v-card>
      </v-col>
      <v-col v-show="activePrimaryView == 'traders'" lg="8" md="12">
        <!-- The user has selected quests by trader -->
        <v-card>
          <v-tabs
            v-model="activeTraderView"
            bg-color="accent"
            slider-color="secondary"
            align-tabs="center"
            show-arrows
          >
            <v-tab
              v-for="(trader, index) in traders"
              :key="index"
              :value="trader.id"
            >
              <v-avatar color="primary" size="2em" class="mr-2">
                <v-img :src="traderAvatar(trader.id)" />
              </v-avatar>
              {{ trader.name }}
            </v-tab>
          </v-tabs>
        </v-card>
      </v-col>
    </v-row>
    <v-row dense>
      <v-col lg="6" md="6">
        <!-- Secondary views (available, locked, completed) -->
        <v-card>
          <v-tabs
            v-model="activeSecondaryView"
            bg-color="accent"
            slider-color="secondary"
            align-tabs="center"
            show-arrows
            density="comfortable"
          >
            <v-tab
              v-for="(view, index) in secondaryViews"
              :key="index"
              :value="view.view"
              :prepend-icon="view.icon"
            >
              {{ view.title }}
            </v-tab>
          </v-tabs>
        </v-card>
      </v-col>
      <v-col lg="6" md="6" class="d-flex align-center">
        <!-- User view -->
        <v-card width="100%">
          <v-tabs
            v-model="activeUserView"
            bg-color="accent"
            slider-color="secondary"
            align-tabs="center"
            density="comfortable"
          >
            <v-tab
              v-for="view in userViews"
              :key="view.view"
              :value="view.view"
              :disabled="
                view.view == 'all' && activeSecondaryView != 'available'
              "
            >
              {{ view.title }}
            </v-tab>
          </v-tabs>
        </v-card>
      </v-col>
    </v-row>
    <v-row justify="center">
      <v-col v-if="loadingTasks || reloadingTasks" cols="12" align="center">
        <!-- If we're still waiting on tasks from tarkov.dev API -->
        <v-progress-circular
          indeterminate
          color="secondary"
          class="mx-2"
        ></v-progress-circular>
        {{ t("page.tasks.loading") }}
        <refresh-button />
      </v-col>
    </v-row>
    <v-row v-if="!loadingTasks && !reloadingTasks && visibleTasks.length == 0">
      <v-col cols="12">
        <v-alert icon="mdi-clipboard-search">
          {{ t("page.tasks.notasksfound") }}</v-alert
        >
      </v-col>
    </v-row>
    <v-row v-show="!loadingTasks && !reloadingTasks" justify="center">
      <v-col
        v-if="activePrimaryView == 'maps' && visibleGPS.length > 0"
        cols="12"
        class="my-1"
      >
        <v-expansion-panels v-model="expandMap">
          <v-expansion-panel>
            <v-expansion-panel-title
              >Objective Locations<span
                v-show="activeMapView != '55f2d3fd4bdc2d5f408b4567'"
                >&nbsp;-&nbsp;{{ timeValue }}</span
              ></v-expansion-panel-title
            >
            <v-expansion-panel-text>
              <tarkov-map
                :map="maps.find((m) => m.id == activeMapView)"
                :marks="visibleGPS"
              />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-col>
      <v-col cols="12" class="my-1">
        <v-lazy
          v-for="(task, taskIndex) in visibleTasks"
          :key="taskIndex"
          :options="{
            threshold: 0.5,
          }"
          min-height="100"
        >
          <task-card :task="task" class="my-1" />
        </v-lazy>
      </v-col>
    </v-row>
  </v-container>
</template>
<script setup>
import {
  defineAsyncComponent,
  computed,
  watch,
  ref,
  shallowRef,
  watchEffect,
} from "vue";
import { useI18n } from "vue-i18n";
import { useUserStore } from "@/stores/user";
import { useTarkovData } from "@/composables/tarkovdata";
import { useProgressStore } from "@/stores/progress";
import { useTarkovStore } from "@/stores/tarkov";

const TrackerTip = defineAsyncComponent(() =>
  import("@/components/TrackerTip.vue")
);
const TaskCard = defineAsyncComponent(() =>
  import("@/components/tasks/TaskCard.vue")
);
const RefreshButton = defineAsyncComponent(() =>
  import("@/components/RefreshButton.vue")
);
const TarkovMap = defineAsyncComponent(() =>
  import("@/components/TarkovMap.vue")
);
const { t } = useI18n({ useScope: "global" });
const userStore = useUserStore();
const progressStore = useProgressStore();
const tarkovStore = useTarkovStore();

const primaryViews = [
  {
    title: t("page.tasks.primaryviews.all"),
    icon: "mdi-clipboard-check",
    view: "all",
  },
  {
    title: t("page.tasks.primaryviews.maps"),
    icon: "mdi-compass",
    view: "maps",
  },
  {
    title: t("page.tasks.primaryviews.traders"),
    icon: "mdi-account",
    view: "traders",
  },
];

const secondaryViews = [
  {
    title: t("page.tasks.secondaryviews.available"),
    icon: "mdi-clipboard-text",
    view: "available",
  },
  {
    title: t("page.tasks.secondaryviews.locked"),
    icon: "mdi-lock",
    view: "locked",
  },
  {
    title: t("page.tasks.secondaryviews.completed"),
    icon: "mdi-clipboard-check",
    view: "completed",
  },
];

const activePrimaryView = computed({
  get: () => userStore.getTaskPrimaryView,
  set: (value) => userStore.setTaskPrimaryView(value),
});

const activeMapView = computed({
  get: () => userStore.getTaskMapView,
  set: (value) => userStore.setTaskMapView(value),
});

const activeTraderView = computed({
  get: () => userStore.getTaskTraderView,
  set: (value) => userStore.setTaskTraderView(value),
});

const activeSecondaryView = computed({
  get: () => userStore.getTaskSecondaryView,
  set: (value) => {
    if (value != "available") {
      // If we're viewing locked or completed tasks, we need to make sure we're viewing an individual user
      if (activeUserView.value == "all") {
        activeUserView.value = "self";
      }
    }
    userStore.setTaskSecondaryView(value);
  },
});
const expandMap = ref([0]);
const hideGlobalTasks = computed({
  get: () => userStore.getHideGlobalTasks,
});
const hideNonKappaTasks = computed({
  get: () => userStore.getHideNonKappaTasks,
});
const activeUserView = computed({
  get: () => userStore.getTaskUserView,
  set: (value) => userStore.setTaskUserView(value),
});
const {
  tasks,
  maps,
  traders,
  loading: tasksLoading,
  disabledTasks,
} = useTarkovData();
const userViews = computed(() => {
  let views = [];
  views.push({ title: t("page.tasks.userviews.all"), view: "all" });
  if (tarkovStore.getDisplayName == null) {
    // We don't have a display name set, so use the default language name for yourself
    views.push({ title: t("page.tasks.userviews.yourself"), view: "self" });
  } else {
    // We have a display name set, so use that
    views.push({ title: tarkovStore.getDisplayName, view: "self" });
  }
  // For each progressStore visible team member (other than yourself), add a view
  for (const teamId of Object.keys(progressStore.visibleTeamStores)) {
    if (teamId != "self") {
      views.push({
        title: progressStore.teammemberNames[teamId],
        view: teamId,
      });
    }
  }
  return views;
});
const traderAvatar = (id) => {
  return `/img/traders/${id}.jpg`;
};
const timeValue = ref("");
setTimeout(() => {
  timeUpdate();
}, 500);
function timeUpdate() {
  var oneHour = 60 * 60 * 1000;
  var currentDate = new Date();
  // Tarkov's time runs at 7 times the speed ...
  var timeAtTarkovSpeed = (currentDate.getTime() * 7) % (24 * oneHour);
  // ... and it is offset by 3 hours from UTC (because that's Moscow's time zone)
  var tarkovTime = new Date(timeAtTarkovSpeed + 3 * oneHour);
  var tarkovHour = tarkovTime.getUTCHours();
  var tarkovMinute = tarkovTime.getUTCMinutes();
  var tarkovSecondHour = (tarkovHour + 12) % 24;
  timeValue.value =
    tarkovHour.toString().padStart(2, "0") +
    ":" +
    tarkovMinute.toString().padStart(2, "0") +
    " / " +
    tarkovSecondHour.toString().padStart(2, "0") +
    ":" +
    tarkovMinute.toString().padStart(2, "0");
  setTimeout(() => {
    timeUpdate();
  }, 3000);
}
const loadingTasks = computed(() => {
  return tasksLoading.value;
});
const reloadingTasks = ref(false);
const visibleTasks = shallowRef([]);
const visibleGPS = computed(() => {
  let visibleGPS = [];

  // Don't return GPS for views that can't really utilize it
  if (activePrimaryView.value != "maps") {
    return [];
  }
  if (activeSecondaryView.value != "available") {
    return [];
  }
  for (const task of visibleTasks.value) {
    let unlockedUsers = [];
    Object.entries(progressStore.unlockedTasks[task.id]).forEach(
      ([teamId, unlocked]) => {
        if (unlocked) {
          unlockedUsers.push(teamId);
        }
      }
    );
    // For each objective
    for (const objective of task.objectives) {
      // If the objective has a GPS location, and its not complete yet, add it to the list
      if (objectiveHasLocation(objective)) {
        // Only show the GPS location if the objective is not complete by the selected user view
        if (activeUserView.value == "all") {
          // Find the users that have the task unlocked
          var users = unlockedUsers.filter(
            (user) =>
              progressStore.objectiveCompletions[objective.id][user] == false
          );
          if (users) {
            // Were a valid, unlocked, uncompleted objective, so add it to the list
            visibleGPS.push({ ...objective, users: users });
          }
        } else {
          if (
            progressStore.objectiveCompletions[objective.id][
              activeUserView.value
            ] == false
          ) {
            // Were a valid, unlocked, uncompleted objective, so add it to the list
            visibleGPS.push({ ...objective, users: activeUserView.value });
          }
        }
      }
    }
  }
  return visibleGPS;
});
function objectiveHasLocation(objective) {
  if (
    objective?.possibleLocations?.length > 0 ||
    objective?.zones?.length > 0
  ) {
    return true;
  } else {
    return false;
  }
}
const mapTaskTotals = computed(() => {
  let mapTaskCounts = {};
  // Update the task count for each map
  for (const map of maps.value) {
    mapTaskCounts[map.id] = 0;
    for (const task of tasks.value) {
      if (disabledTasks.includes(task.id)) {
        continue;
      }
      if (hideGlobalTasks.value && task.map == null) {
        continue;
      }
      if (Array.isArray(task.locations) && task.locations.includes(map.id)) {
        if (
          (activeUserView.value == "all" &&
            Object.values(progressStore.unlockedTasks[task.id]).some(
              (unlocked) => unlocked
            )) ||
          progressStore.unlockedTasks[task.id][activeUserView.value]
        ) {
          let anyObjectiveLeft = false;
          for (const objective of task.objectives) {
            if (objective.maps.includes(map.id)) {
              if (
                progressStore.objectiveCompletions[objective.id].self !== true
              ) {
                anyObjectiveLeft = true;
                break;
              }
            }
          }
          if (anyObjectiveLeft) {
            mapTaskCounts[map.id]++;
          }
        }
      }
    }
  }
  return mapTaskCounts;
});
const updateVisibleTasks = async function () {
  // Guard clause: Wait until necessary data is loaded/available
  if (tasksLoading.value) {
    console.warn(
      "updateVisibleTasks: TarkovData (tasks) still loading, deferring update."
    );
    return; // Exit if core task data isn't loaded
  }
  // Guard clause: Ensure userStore getter is available (should always return boolean due to || false)
  // Accessing the computed ref here might trigger dependencies prematurely, check the source directly if possible.
  // We already define `hideNonKappaTasks = computed(...)`, let's trust it exists but check its value source's readiness indirectly
  // A simple check on tasks.value existing is a good proxy for data readiness post-loading
  if (!tasks.value) {
    console.warn(
      "updateVisibleTasks: tasks.value is not ready, deferring update."
    );
    return;
  }
  // Guard clause: Ensure disabledTasks ref exists AND its value is an array
  if (!disabledTasks || !Array.isArray(disabledTasks)) {
    console.warn(
      "updateVisibleTasks: disabledTasks ref or its value is not ready, deferring update."
    );
    return; // Exit if disabledTasks ref or its value isn't ready
  }
  // Guard clause: Check critical progressStore computed properties are ready
  // These depend on tasks.value and store state, which might have their own timings.
  if (
    !progressStore.unlockedTasks ||
    !progressStore.tasksCompletions ||
    !progressStore.playerFaction
  ) {
    console.warn(
      "updateVisibleTasks: Progress store computed values not ready, deferring update."
    );
    return; // Exit if progress store data isn't ready
  }
  reloadingTasks.value = true; // Indicate we are starting the actual processing
  let visibleTaskList = JSON.parse(JSON.stringify(tasks.value));
  console.log(`updateVisibleTasks: Start - ${visibleTaskList.length} tasks`); // LOG START
  // First, filter tasks by the primary view
  if (activePrimaryView.value == "maps") {
    visibleTaskList = visibleTaskList.filter((task) => {
      const primaryMapMatch = task.map?.id === activeMapView.value;
      const objectiveMapMatch = task.objectives?.some(obj =>
        obj.maps?.some(map => map.id === activeMapView.value)
      );
      return primaryMapMatch || objectiveMapMatch;
    });
  } else if (activePrimaryView.value == "traders") {
    visibleTaskList = visibleTaskList.filter(
      (task) => task.trader?.id == activeTraderView.value
    );
  }
  console.log(
    `updateVisibleTasks: After Primary Filter - ${visibleTaskList.length} tasks`
  ); // LOG AFTER PRIMARY
  if (activeUserView.value == "all") {
    // We want to show tasks by their availability to any team member
    if (activeSecondaryView.value == "available") {
      visibleTaskList = visibleTaskList.filter((task) =>
        Object.values(progressStore.unlockedTasks?.[task.id]).some(
          (v) => v === true
        )
      );
    } else {
      // In theory, we should never be in this situation (we don't show locked or completed tasks for all users)
      // But just in case, we'll do nothing here
      // Consider clearing the list or logging a warning if this state is reached unexpectedly
      console.warn(
        "updateVisibleTasks: 'all' user view combined with non-'available' secondary view - unexpected state."
      );
    }
  } else {
    // We want to show tasks by their availablity to a specific team member
    if (activeSecondaryView.value == "available") {
      visibleTaskList = visibleTaskList.filter(
        (task) =>
          progressStore.unlockedTasks?.[task.id]?.[activeUserView.value] ===
          true
      );
    } else if (activeSecondaryView.value == "locked") {
      visibleTaskList = visibleTaskList.filter(
        (task) =>
          progressStore.tasksCompletions?.[task.id]?.[activeUserView.value] !=
            true &&
          progressStore.unlockedTasks?.[task.id]?.[activeUserView.value] != true
      );
    } else if (activeSecondaryView.value == "completed") {
      visibleTaskList = visibleTaskList.filter((task) => {
        return (
          progressStore.tasksCompletions?.[task.id]?.[activeUserView.value] ==
          true
        );
      });
    }
    // Filter out tasks not for the faction of the specified user
    visibleTaskList = visibleTaskList.filter((task) => {
      return (
        task.factionName == "Any" ||
        task.factionName == progressStore.playerFaction[activeUserView.value]
      );
    });
  }
  console.log(
    `updateVisibleTasks: After Secondary/User Filter - ${visibleTaskList.length} tasks`
  ); // LOG AFTER SECONDARY/USER
  // Remove any disabled tasks from the view
  visibleTaskList = visibleTaskList.filter(
    (task) =>
      task &&
      typeof task.id === "string" &&
      // Simplified check: since watchEffect guarantees disabledTasks.value is an array,
      // we only need to check if the task ID is *not* included.
      !disabledTasks.includes(task.id)
  );
  console.log(
    `updateVisibleTasks: After Disabled Filter - ${visibleTaskList.length} tasks`
  ); // LOG AFTER DISABLED
  // Use optional chaining to safely access .value
  if (hideNonKappaTasks?.value) {
    visibleTaskList = visibleTaskList.filter(
      (task) => task.kappaRequired == true
    );
  }
  console.log(
    `updateVisibleTasks: After Kappa Filter - ${visibleTaskList.length} tasks`
  ); // LOG AFTER KAPPA
  // Finally, map the tasks to their IDs
  //visibleTaskList = visibleTaskList.map((task) => task.id)
  // Sort the tasks by their count of successors
  visibleTaskList.sort((a, b) => {
    return b.successors.length - a.successors.length;
  });
  reloadingTasks.value = false;
  visibleTasks.value = visibleTaskList;
};
// Watch for changes that affect visible tasks and update accordingly
watchEffect(async () => {
  // Explicitly check core readiness *before* calling the main function
  // These checks ensure that we don't run the potentially expensive
  // updateVisibleTasks function until all required async data is available.
  if (
    tasksLoading.value || // Check if tasks are still loading
    !tasks.value || // Check if tasks data structure exists
    !disabledTasks ||
    !Array.isArray(disabledTasks) || // Corrected: Check the array directly, not .value
    !progressStore.unlockedTasks || // Check progressStore readiness
    !progressStore.tasksCompletions ||
    !progressStore.playerFaction
  ) {
    // One of the core dependencies isn't ready yet.
    // watchEffect will re-run automatically when they change.
    // No need to log here, as the effect will just silently wait.
    return;
  }
  // All checks passed, now it's safe to run the full update.
  reloadingTasks.value = true;
  await updateVisibleTasks();
  // reloadingTasks.value = false; // This is handled inside updateVisibleTasks
});
// Watch for changes to all of the views, and update the visible tasks
watch(
  [
    activePrimaryView,
    activeMapView,
    activeTraderView,
    activeSecondaryView,
    activeUserView,
    tasks,
    hideGlobalTasks,
    hideNonKappaTasks,
    () => tarkovStore.playerLevel,
  ],
  async () => {
    await updateVisibleTasks();
  },
  { immediate: true }
);
watch(
  () => progressStore.tasksCompletions,
  async () => {
    reloadingTasks.value = true;
    await updateVisibleTasks();
  }
);
</script>
<style lang="scss" scoped></style>
