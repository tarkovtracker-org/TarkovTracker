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
              <nav
                class="bg-surface-900/85 w-full rounded-xl border border-white/8 p-1.5 shadow-sm"
                :aria-label="$t('settings.title')"
              >
                <div
                  v-for="(group, groupIndex) in settingsTabGroups"
                  :key="group.label"
                  :class="groupIndex > 0 ? 'border-surface-700/70 mt-2 border-t pt-2' : ''"
                >
                  <p class="text-surface-500 px-3 py-1.5 text-xs font-semibold uppercase">
                    {{ group.label }}
                  </p>
                  <div class="space-y-1">
                    <button
                      v-for="item in group.items"
                      :key="item.value"
                      type="button"
                      :data-testid="`desktop-tab-${item.value}`"
                      class="focus-visible:ring-primary-500/60 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      :class="
                        activeTab === item.value
                          ? 'bg-surface-800 text-white shadow-sm ring-1 ring-white/10'
                          : 'text-surface-300 hover:bg-surface-800/80 hover:text-surface-100'
                      "
                      :aria-current="activeTab === item.value ? 'page' : undefined"
                      @click="onTabChange(item.value)"
                    >
                      <UIcon :name="item.icon" class="h-4 w-4 shrink-0" />
                      <span class="truncate">{{ item.label }}</span>
                    </button>
                  </div>
                </div>
              </nav>
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
              <KeybindsCard />
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
              <DebugStateCard />
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
              <DataManagementCard view="imports" :session="dataManagementSession" />
            </section>
            <section
              v-if="visitedTabs['backup-restore']"
              v-show="activeTab === 'backup-restore'"
              id="backup-restore"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.backup_restore')"
            >
              <DataManagementCard view="backup" :session="dataManagementSession" />
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
            <section
              v-if="visitedTabs['streamer-tools']"
              v-show="activeTab === 'streamer-tools'"
              id="streamer-tools"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('settings.tabs.streamer_tools')"
            >
              <StreamerToolsPanel />
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
  import DebugStateCard from '@/features/settings/DebugStateCard.vue';
  import DisplayNameCard from '@/features/settings/DisplayNameCard.vue';
  import ExperienceCard from '@/features/settings/ExperienceCard.vue';
  import KeybindsCard from '@/features/settings/KeybindsCard.vue';
  import MapSettingsCard from '@/features/settings/MapSettingsCard.vue';
  import PrestigeCard from '@/features/settings/PrestigeCard.vue';
  import PrivacyCard from '@/features/settings/PrivacyCard.vue';
  import ProfileSharingCard from '@/features/settings/ProfileSharingCard.vue';
  import ResetProgressCard from '@/features/settings/ResetProgressCard.vue';
  import SkillsCard from '@/features/settings/SkillsCard.vue';
  import TaskDisplayCard from '@/features/settings/TaskDisplayCard.vue';
  import { useDataManagementSession } from '@/features/settings/useDataManagementSession';
  import StreamerToolsPanel from '@/features/streamer-tools/StreamerToolsPanel.vue';
  import { useSystemStore, useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import type { TabsProps } from '@nuxt/ui';
  definePageMeta({
    alias: ['/progression', '/prestige', '/preferences'],
  });
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
    | 'api'
    | 'streamer-tools';
  const settingsTabIds = [
    'progression',
    'preferences',
    'imports',
    'prestige',
    'account',
    'backup-restore',
    'api',
    'streamer-tools',
  ] as const;
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
    'streamer-tools': '#streamer-tools',
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
  const legacyAccountHashes = new Set(['#settings-account']);
  const settingsSeoKeys: Record<SettingsTabId, string> = {
    progression: 'progression',
    prestige: 'prestige',
    preferences: 'preferences',
    account: 'account',
    imports: 'imports',
    'backup-restore': 'backup_restore',
    api: 'api',
    'streamer-tools': 'streamer_tools',
  };
  const dataManagementSession = useDataManagementSession();
  const isSettingsTabId = (value: unknown): value is SettingsTabId => {
    return typeof value === 'string' && settingsTabIds.includes(value as SettingsTabId);
  };
  const shouldRedirectLegacyAccountHash = (path: string, hash: string): boolean => {
    return path === '/settings' && legacyAccountHashes.has(hash);
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
    if (shouldRedirectLegacyAccountHash(path, hash)) {
      return getDefaultTabFromPath(path);
    }
    return resolveTabFromHash(hash) ?? settingsRouteTabs[path] ?? getDefaultTabFromPath(path);
  };
  const activeTab = ref<SettingsTabId>(resolveTabFromRoute(route.path, route.hash));
  const settingsSeo = computed(() => {
    const seoKey = settingsSeoKeys[activeTab.value];
    return {
      title: t(`settings.tab_seo.${seoKey}.title`),
      description: t(`settings.tab_seo.${seoKey}.description`),
    };
  });
  useSeoMeta({
    title: computed(() => settingsSeo.value.title),
    description: computed(() => settingsSeo.value.description),
    robots: 'noindex, nofollow',
  });
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
      value: 'imports',
      label: t('settings.tabs.imports'),
      icon: 'i-mdi-database-import-outline',
    },
    {
      value: 'prestige',
      label: t('settings.tabs.prestige'),
      icon: 'i-mdi-medal-outline',
    },
    {
      value: 'account',
      label: t('settings.tabs.account'),
      icon: 'i-mdi-account-circle-outline',
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
    {
      value: 'streamer-tools',
      label: t('settings.tabs.streamer_tools'),
      icon: 'i-heroicons-video-camera',
    },
  ]);
  const settingsTabGroups = computed(() => [
    {
      label: t('settings.tab_groups.game'),
      items: settingsTabItems.value.filter((item) =>
        ['progression', 'preferences', 'imports', 'prestige'].includes(item.value)
      ),
    },
    {
      label: t('settings.tab_groups.account_advanced'),
      items: settingsTabItems.value.filter((item) =>
        ['account', 'backup-restore', 'api', 'streamer-tools'].includes(item.value)
      ),
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
    'streamer-tools': false,
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
    const nextHash = settingsTabHashes[value];
    if (route.hash === nextHash) {
      return;
    }
    void router.replace({
      hash: nextHash,
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
      if (shouldRedirectLegacyAccountHash(path, hash)) {
        await router.replace({
          hash: '',
          path: '/account',
          query: route.query,
        });
        return;
      }
      activeTab.value = resolveTabFromRoute(path, hash);
      if (hash) {
        await scrollToHashTarget(hash);
      }
    },
    { immediate: true }
  );
</script>
