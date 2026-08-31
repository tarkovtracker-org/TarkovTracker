<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-350">
      <div class="mx-auto max-w-290 space-y-4 lg:space-y-0">
        <div class="flex items-center justify-between pb-4">
          <div>
            <h1 class="text-surface-100 text-xl font-bold">
              {{ $t('common.settings', 'Settings') }}
            </h1>
            <p class="text-surface-400 mt-1 text-sm">
              {{
                $t(
                  'settings.page_description',
                  'Manage your account, game progression, and application preferences.'
                )
              }}
            </p>
          </div>
        </div>
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
                :aria-label="$t('common.settings')"
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
              v-if="visitedTabs.prestige && showPrestigeTab"
              v-show="activeTab === 'prestige'"
              id="prestige"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('common.prestige')"
            >
              <PrestigeCard />
            </section>
            <section
              v-if="visitedTabs.preferences"
              v-show="activeTab === 'preferences'"
              id="preferences"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('common.preferences')"
            >
              <GeneralPreferencesCard />
              <TaskDisplayCard />
              <MapSettingsCard />
              <div id="keybinds" class="scroll-mt-24">
                <KeybindsCard />
              </div>
            </section>
            <section
              v-if="visitedTabs.account"
              v-show="activeTab === 'account'"
              id="account"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('common.account')"
            >
              <ProfileSharingCard />
              <DiscordLinkCard />
              <AccountDeletionCard />
              <div v-if="isAdmin" class="flex justify-center pt-4">
                <NuxtLink
                  to="/admin"
                  class="hover:text-error-400 text-surface-500 flex items-center gap-1.5 text-xs transition-colors"
                >
                  <UIcon name="i-mdi-shield-crown" class="size-3.5" />
                  {{ $t('common.admin_panel') }}
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
              :aria-label="$t('common.backup_restore')"
            >
              <DataManagementCard view="backup" :session="dataManagementSession" />
              <DebugStateCard />
            </section>
            <section
              v-if="visitedTabs.api"
              v-show="activeTab === 'api'"
              id="api"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('common.api')"
            >
              <ApiTokensCard />
            </section>
            <section
              v-if="visitedTabs['streamer-tools']"
              v-show="activeTab === 'streamer-tools'"
              id="streamer-tools"
              class="scroll-mt-24 space-y-4"
              role="tabpanel"
              :aria-label="$t('common.streamer_tools')"
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
  import DiscordLinkCard from '@/features/settings/DiscordLinkCard.vue';
  import DisplayNameCard from '@/features/settings/DisplayNameCard.vue';
  import ExperienceCard from '@/features/settings/ExperienceCard.vue';
  import GeneralPreferencesCard from '@/features/settings/GeneralPreferencesCard.vue';
  import KeybindsCard from '@/features/settings/KeybindsCard.vue';
  import MapSettingsCard from '@/features/settings/MapSettingsCard.vue';
  import PrestigeCard from '@/features/settings/PrestigeCard.vue';
  import ProfileSharingCard from '@/features/settings/ProfileSharingCard.vue';
  import ResetProgressCard from '@/features/settings/ResetProgressCard.vue';
  import SkillsCard from '@/features/settings/SkillsCard.vue';
  import TaskDisplayCard from '@/features/settings/TaskDisplayCard.vue';
  import { useDataManagementSession } from '@/features/settings/useDataManagementSession';
  import StreamerToolsPanel from '@/features/streamer-tools/StreamerToolsPanel.vue';
  import { useSystemStore, useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES } from '@/utils/constants';
  import type { TabsProps } from '@nuxt/ui';
  definePageMeta({
    alias: ['/progression', '/prestige', '/preferences'],
  });
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const router = useRouter();
  const { hasInitiallyLoaded } = useSystemStoreWithSupabase();
  const systemStore = useSystemStore();
  const tarkovStore = useTarkovStore();
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
    'prestige',
    'preferences',
    'imports',
    'backup-restore',
    'account',
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
    '#keybinds': 'preferences',
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
  const showPrestigeTab = computed(() => tarkovStore.currentGameMode !== GAME_MODES.SEASONAL);
  const canonicalizeTab = (tab: SettingsTabId): SettingsTabId =>
    tab === 'prestige' && !showPrestigeTab.value ? 'progression' : tab;
  const resolveTabFromRoute = (path: string, hash: string): SettingsTabId => {
    if (shouldRedirectLegacyAccountHash(path, hash)) {
      return getDefaultTabFromPath(path);
    }
    const resolved =
      resolveTabFromHash(hash) ?? settingsRouteTabs[path] ?? getDefaultTabFromPath(path);
    return canonicalizeTab(resolved);
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
  const settingsTabLabels = computed<Record<SettingsTabId, string>>(() => ({
    progression: t('settings.tabs.progression'),
    prestige: t('common.prestige'),
    preferences: t('common.preferences'),
    imports: t('settings.tabs.imports'),
    'backup-restore': t('common.backup_restore'),
    account: t('common.account'),
    api: t('common.api'),
    'streamer-tools': t('common.streamer_tools'),
  }));
  const settingsTabIcons: Record<SettingsTabId, string> = {
    progression: 'i-mdi-account-cog-outline',
    prestige: 'i-mdi-medal-outline',
    preferences: 'i-mdi-tune-variant',
    imports: 'i-mdi-database-import-outline',
    'backup-restore': 'i-mdi-backup-restore',
    account: 'i-mdi-account-circle-outline',
    api: 'i-mdi-api',
    'streamer-tools': 'i-heroicons-video-camera',
  };
  const settingsTabItems = computed(() =>
    settingsTabIds
      .filter((value) => value !== 'prestige' || showPrestigeTab.value)
      .map((value) => ({
        value,
        label: settingsTabLabels.value[value],
        icon: settingsTabIcons[value],
      }))
  );
  const settingsTabGroupDefinitions = [
    ['game_progress', ['progression', 'prestige']],
    ['app', ['preferences']],
    ['data', ['imports', 'backup-restore']],
    ['account', ['account']],
    ['tools_integrations', ['api', 'streamer-tools']],
  ] as const;
  const settingsTabGroups = computed(() =>
    settingsTabGroupDefinitions.map(([group, values]) => ({
      label: t(`settings.tab_groups.${group}`),
      items: settingsTabItems.value.filter((item) =>
        (values as readonly string[]).includes(item.value)
      ),
    }))
  );
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
  const hiddenPrestigeTarget = (
    path: string,
    hash: string
  ): { path?: string; hash?: string } | null => {
    if (showPrestigeTab.value) {
      return null;
    }
    if (path === '/prestige') {
      return { path: '/progression', hash };
    }
    if (hash === settingsTabHashes.prestige) {
      return { hash: settingsTabHashes.progression };
    }
    return null;
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
    showPrestigeTab,
    (visible) => {
      if (!visible && activeTab.value === 'prestige') {
        onTabChange('progression');
      }
    },
    { immediate: true }
  );
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
      const hiddenTarget = hiddenPrestigeTarget(path, hash);
      if (hiddenTarget) {
        await router.replace({
          ...hiddenTarget,
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
