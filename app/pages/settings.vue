<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-[1400px]">
      <div class="mx-auto max-w-[1160px] space-y-4 lg:space-y-0">
        <UTabs
          :items="settingsTabItems"
          :model-value="activeTab"
          :content="false"
          color="neutral"
          variant="link"
          class="lg:hidden"
          :ui="mobileTabsUi"
          @update:model-value="onTabChange"
        />
        <div
          class="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-5 xl:grid-cols-[13.5rem_minmax(0,1fr)] xl:gap-6"
        >
          <aside class="hidden lg:block">
            <div class="sticky top-24">
              <UTabs
                :items="settingsTabItems"
                :model-value="activeTab"
                :content="false"
                color="neutral"
                variant="link"
                orientation="vertical"
                :ui="desktopTabsUi"
                @update:model-value="onTabChange"
              />
            </div>
          </aside>
          <div class="min-w-0">
            <section
              v-if="visitedTabs.progression"
              v-show="activeTab === 'progression'"
              id="settings-progression"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.progression')"
            >
              <DisplayNameCard />
              <PrestigeCard />
              <ExperienceCard />
              <SkillsCard />
            </section>
            <section
              v-if="visitedTabs.preferences"
              v-show="activeTab === 'preferences'"
              id="settings-preferences"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.preferences')"
            >
              <TaskDisplayCard />
              <MapSettingsCard />
            </section>
            <section
              v-if="visitedTabs['data-management']"
              v-show="activeTab === 'data-management'"
              id="settings-data-management"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.data_management')"
            >
              <DataManagementCard />
            </section>
            <section
              v-if="visitedTabs.api"
              v-show="activeTab === 'api'"
              id="api"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.api')"
            >
              <ApiTokensCard />
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import ApiTokensCard from '@/features/settings/ApiTokensCard.vue';
  import DataManagementCard from '@/features/settings/DataManagementCard.vue';
  import DisplayNameCard from '@/features/settings/DisplayNameCard.vue';
  import ExperienceCard from '@/features/settings/ExperienceCard.vue';
  import MapSettingsCard from '@/features/settings/MapSettingsCard.vue';
  import PrestigeCard from '@/features/settings/PrestigeCard.vue';
  import SkillsCard from '@/features/settings/SkillsCard.vue';
  import TaskDisplayCard from '@/features/settings/TaskDisplayCard.vue';
  import type { TabsProps } from '@nuxt/ui';
  useSeoMeta({
    title: 'Settings',
    description:
      'Customize your TarkovTracker experience. Manage preferences and gameplay settings.',
    robots: 'noindex, nofollow',
  });
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const router = useRouter();
  type SettingsTabId = 'progression' | 'preferences' | 'data-management' | 'api';
  const settingsTabIds = ['progression', 'preferences', 'data-management', 'api'] as const;
  const settingsTabHashes: Record<SettingsTabId, string> = {
    progression: '#settings-progression',
    preferences: '#settings-preferences',
    'data-management': '#settings-data-management',
    api: '#api',
  };
  const nestedTabHashes: Record<string, SettingsTabId> = {
    '#settings-skills': 'progression',
  };
  const isSettingsTabId = (value: unknown): value is SettingsTabId => {
    return typeof value === 'string' && settingsTabIds.includes(value as SettingsTabId);
  };
  const resolveTabFromHash = (hash: string): SettingsTabId | null => {
    const topLevelMatch = Object.entries(settingsTabHashes).find(([, value]) => value === hash);
    if (topLevelMatch?.[0] && isSettingsTabId(topLevelMatch[0])) {
      return topLevelMatch[0];
    }
    return nestedTabHashes[hash] ?? null;
  };
  const activeTab = ref<SettingsTabId>(resolveTabFromHash(route.hash) ?? 'progression');
  const settingsTabItems = computed(() => [
    {
      value: 'progression',
      label: t('settings.tabs.progression'),
      icon: 'i-mdi-account-cog-outline',
    },
    {
      value: 'preferences',
      label: t('settings.tabs.preferences'),
      icon: 'i-mdi-tune-variant',
    },
    {
      value: 'data-management',
      label: t('settings.tabs.data_management'),
      icon: 'i-mdi-database-cog-outline',
    },
    {
      value: 'api',
      label: t('settings.tabs.api'),
      icon: 'i-mdi-api',
    },
  ]);
  const visitedTabs = reactive<Record<SettingsTabId, boolean>>({
    progression: false,
    preferences: false,
    'data-management': false,
    api: false,
  });
  const mobileTabsUi: TabsProps['ui'] = {
    root: 'w-full',
    list: 'bg-surface-900 flex w-full gap-1 overflow-x-auto rounded-xl border border-white/10 p-2 shadow-sm',
    indicator: 'hidden',
    trigger:
      'text-surface-300 data-[state=active]:bg-surface-800 data-[state=active]:text-white flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
    leadingIcon: 'h-4 w-4',
  };
  const desktopTabsUi: TabsProps['ui'] = {
    root: 'w-full',
    list: 'bg-surface-900/85 flex w-full flex-col gap-1.5 rounded-xl border border-white/8 p-1.5 shadow-sm',
    indicator: 'hidden',
    trigger:
      'text-surface-300 hover:bg-surface-800/80 hover:text-surface-100 data-[state=active]:bg-surface-800 data-[state=active]:text-white data-[state=active]:ring-white/10 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors data-[state=active]:shadow-sm data-[state=active]:ring-1',
    leadingIcon: 'h-4 w-4 shrink-0',
    label: 'truncate',
  };
  const scrollToHashTarget = async (hash: string) => {
    if (!import.meta.client || !hash) {
      return;
    }
    await nextTick();
    const targetId = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!targetId) {
      return;
    }
    const targetElement = document.getElementById(targetId);
    if (!targetElement || typeof targetElement.scrollIntoView !== 'function') {
      return;
    }
    targetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };
  const onTabChange = (value: string | number) => {
    if (!isSettingsTabId(value)) {
      return;
    }
    activeTab.value = value;
    const nextHash = settingsTabHashes[value];
    if (route.hash === nextHash) {
      return;
    }
    void router.replace({
      hash: nextHash,
      path: route.path,
      query: route.query,
    });
  };
  watch(
    activeTab,
    (tab) => {
      visitedTabs[tab] = true;
    },
    { immediate: true }
  );
  watch(
    () => route.hash,
    async (hash) => {
      const nextTab = resolveTabFromHash(hash);
      if (nextTab) {
        activeTab.value = nextTab;
      }
      if (hash) {
        await scrollToHashTarget(hash);
      }
    },
    { immediate: true }
  );
</script>
