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
              id="progression"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.progression')"
            >
              <DisplayNameCard />
              <ExperienceCard />
              <SkillsCard />
              <ResetProgressCard />
            </section>
            <section
              v-if="visitedTabs.prestige"
              v-show="activeTab === 'prestige'"
              id="prestige"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.prestige')"
            >
              <PrestigeCard />
            </section>
            <section
              v-if="visitedTabs.preferences"
              v-show="activeTab === 'preferences'"
              id="preferences"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.preferences')"
            >
              <PrivacyCard />
              <TaskDisplayCard />
              <MapSettingsCard />
            </section>
            <section
              v-if="visitedTabs.account"
              v-show="activeTab === 'account'"
              id="account"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.account')"
            >
              <ProfileSharingCard />
              <AccountDeletionCard />
              <div v-if="isAdmin" class="flex justify-center pt-4">
                <NuxtLink
                  to="/admin"
                  class="hover:text-error-400 text-surface-500 flex items-center gap-1.5 text-xs transition-colors"
                >
                  <UIcon name="i-mdi-shield-crown" class="size-3.5" />
                  {{ $t('settings.general.admin_panel') }}
                </NuxtLink>
              </div>
            </section>
            <section
              v-if="visitedTabs.imports"
              v-show="activeTab === 'imports'"
              id="imports"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.imports')"
            >
              <DataManagementCard view="imports" />
            </section>
            <section
              v-if="visitedTabs['backup-restore']"
              v-show="activeTab === 'backup-restore'"
              id="backup-restore"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.backup_restore')"
            >
              <DataManagementCard view="backup" />
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
  import AccountDeletionCard from '@/features/settings/AccountDeletionCard.vue';
  import ApiTokensCard from '@/features/settings/ApiTokensCard.vue';
  import DataManagementCard from '@/features/settings/DataManagementCard.vue';
  import DisplayNameCard from '@/features/settings/DisplayNameCard.vue';
  import ExperienceCard from '@/features/settings/ExperienceCard.vue';
  import MapSettingsCard from '@/features/settings/MapSettingsCard.vue';
  import PrestigeCard from '@/features/settings/PrestigeCard.vue';
  import PrivacyCard from '@/features/settings/PrivacyCard.vue';
  import ProfileSharingCard from '@/features/settings/ProfileSharingCard.vue';
  import ResetProgressCard from '@/features/settings/ResetProgressCard.vue';
  import SkillsCard from '@/features/settings/SkillsCard.vue';
  import TaskDisplayCard from '@/features/settings/TaskDisplayCard.vue';
  import { useSystemStore, useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import type { TabsProps } from '@nuxt/ui';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const router = useRouter();
  const { hasInitiallyLoaded } = useSystemStoreWithSupabase();
  const systemStore = useSystemStore();
  type SettingsTabId =
    | 'progression'
    | 'prestige'
    | 'preferences'
    | 'account'
    | 'imports'
    | 'backup-restore'
    | 'api';
  const settingsTabIds = [
    'progression',
    'prestige',
    'preferences',
    'account',
    'imports',
    'backup-restore',
    'api',
  ] as const;
  const settingsTabRoutes: Record<SettingsTabId, { path: string; hash: string }> = {
    progression: { path: '/progression', hash: '' },
    prestige: { path: '/prestige', hash: '' },
    preferences: { path: '/preferences', hash: '' },
    account: { path: '/account', hash: '' },
    imports: { path: '/settings', hash: '#imports' },
    'backup-restore': { path: '/settings', hash: '#backup-restore' },
    api: { path: '/settings', hash: '#api' },
  };
  const settingsRouteTabs: Partial<Record<string, SettingsTabId>> = {
    '/progression': 'progression',
    '/prestige': 'prestige',
    '/preferences': 'preferences',
    '/account': 'account',
  };
  const settingsTabHashes: Record<SettingsTabId, string> = {
    progression: '#progression',
    prestige: '#prestige',
    preferences: '#preferences',
    account: '#account',
    imports: '#imports',
    'backup-restore': '#backup-restore',
    api: '#api',
  };
  const nestedTabHashes: Record<string, SettingsTabId> = {
    '#skills': 'progression',
  };
  const legacyTabHashes: Record<string, SettingsTabId> = {
    '#settings-progression': 'progression',
    '#settings-prestige': 'prestige',
    '#settings-preferences': 'preferences',
    '#settings-account': 'account',
    '#data-management': 'imports',
    '#settings-data-management': 'imports',
    '#settings-imports': 'imports',
    '#settings-backup-restore': 'backup-restore',
    '#settings-skills': 'progression',
  };
  const hashTargetIds: Record<string, string> = {
    '#settings-progression': 'progression',
    '#settings-prestige': 'prestige',
    '#settings-preferences': 'preferences',
    '#settings-account': 'account',
    '#data-management': 'imports',
    '#settings-data-management': 'imports',
    '#settings-imports': 'imports',
    '#settings-backup-restore': 'backup-restore',
    '#settings-skills': 'skills',
  };
  const isSettingsTabId = (value: unknown): value is SettingsTabId => {
    return typeof value === 'string' && settingsTabIds.includes(value as SettingsTabId);
  };
  const getDefaultTabFromPath = (path: string): SettingsTabId => {
    return settingsRouteTabs[path] ?? 'progression';
  };
  const resolveTabFromHash = (hash: string): SettingsTabId | null => {
    const topLevelMatch = Object.entries(settingsTabHashes).find(([, value]) => value === hash);
    if (topLevelMatch?.[0] && isSettingsTabId(topLevelMatch[0])) {
      return topLevelMatch[0];
    }
    return nestedTabHashes[hash] ?? legacyTabHashes[hash] ?? null;
  };
  const resolveTabFromRoute = (path: string, hash: string): SettingsTabId => {
    return settingsRouteTabs[path] ?? resolveTabFromHash(hash) ?? getDefaultTabFromPath(path);
  };
  const activeTab = ref<SettingsTabId>(resolveTabFromRoute(route.path, route.hash));
  const settingsTabSeo: Record<SettingsTabId, { title: string; description: string }> = {
    progression: {
      title: 'Progression Settings',
      description: 'Manage TarkovTracker progression, display names, experience, and skills.',
    },
    prestige: {
      title: 'Prestige Settings',
      description: 'Review and manage TarkovTracker prestige tracking.',
    },
    preferences: {
      title: 'Preferences',
      description: 'Customize TarkovTracker display, privacy, task, and map preferences.',
    },
    account: {
      title: 'Account',
      description:
        'Manage your TarkovTracker account options, sharing visibility, and data controls.',
    },
    imports: {
      title: 'Import Settings',
      description: 'Import TarkovTracker progress from Tarkov.dev profiles and EFT game logs.',
    },
    'backup-restore': {
      title: 'Backup & Restore',
      description: 'Export or restore TarkovTracker progress data and support snapshots.',
    },
    api: {
      title: 'API Settings',
      description: 'Manage TarkovTracker API tokens and account integrations.',
    },
  };
  const indexableSettingsTabs: SettingsTabId[] = ['progression', 'prestige', 'preferences'];
  const settingsSeo = computed(() => settingsTabSeo[activeTab.value]);
  const settingsRobots = computed(() => {
    return route.path !== '/settings' && indexableSettingsTabs.includes(activeTab.value)
      ? 'index, follow'
      : 'noindex, nofollow';
  });
  useSeoMeta({
    title: computed(() => settingsSeo.value.title),
    description: computed(() => settingsSeo.value.description),
    robots: settingsRobots,
  });
  const settingsTabItems = computed(() => [
    {
      value: 'progression',
      label: t('settings.tabs.progression'),
      icon: 'i-mdi-account-cog-outline',
    },
    {
      value: 'prestige',
      label: t('settings.tabs.prestige'),
      icon: 'i-mdi-medal-outline',
    },
    {
      value: 'preferences',
      label: t('settings.tabs.preferences'),
      icon: 'i-mdi-tune-variant',
    },
    {
      value: 'account',
      label: t('settings.tabs.account'),
      icon: 'i-mdi-account-circle-outline',
    },
    {
      value: 'imports',
      label: t('settings.tabs.imports'),
      icon: 'i-mdi-database-import-outline',
    },
    {
      value: 'backup-restore',
      label: t('settings.tabs.backup_restore'),
      icon: 'i-mdi-backup-restore',
    },
    {
      value: 'api',
      label: t('settings.tabs.api'),
      icon: 'i-mdi-api',
    },
  ]);
  const visitedTabs = reactive<Record<SettingsTabId, boolean>>({
    progression: false,
    prestige: false,
    preferences: false,
    account: false,
    imports: false,
    'backup-restore': false,
    api: false,
  });
  const isAdmin = computed(() => hasInitiallyLoaded.value && systemStore.isAdmin);
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
    const targetId = hashTargetIds[hash] ?? (hash.startsWith('#') ? hash.slice(1) : hash);
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
    const nextRoute = settingsTabRoutes[value];
    if (route.path === nextRoute.path && route.hash === nextRoute.hash) {
      return;
    }
    void router.replace({
      hash: nextRoute.hash,
      path: nextRoute.path,
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
    () => [route.path, route.hash] as const,
    async ([path, hash]) => {
      activeTab.value = resolveTabFromRoute(path, hash);
      if (hash) {
        await scrollToHashTarget(hash);
      }
    },
    { immediate: true }
  );
</script>
