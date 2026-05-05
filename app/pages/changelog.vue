<template>
  <UContainer class="px-4 py-8">
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <UIcon name="i-mdi-history" class="text-primary-400 h-6 w-6" />
          <h1 class="text-surface-100 text-2xl font-bold">{{ t('page.changelog.title') }}</h1>
        </div>
        <NuxtLink to="/" class="text-surface-400 hover:text-primary-400 transition-colors">
          <UIcon name="i-mdi-arrow-left" class="mr-1 inline h-4 w-4" />
          {{ t('page.changelog.back') }}
        </NuxtLink>
      </header>
      <div v-if="showInitialLoading" class="text-surface-400 py-12 text-center">
        <UIcon name="i-mdi-loading" class="mb-2 h-8 w-8 animate-spin" />
        <p>{{ t('page.changelog.loading') }}</p>
      </div>
      <div v-else-if="error && !groupedEntries.length" class="py-12 text-center">
        <UIcon name="i-mdi-alert-circle" class="text-error-400 mb-2 h-8 w-8" />
        <p class="text-surface-400 mb-4">{{ t('page.changelog.error') }}</p>
        <UButton color="primary" variant="soft" @click="retryLoadChangelog">
          {{ t('page.changelog.retry') }}
        </UButton>
      </div>
      <div v-else-if="!groupedEntries.length" class="text-surface-400 py-12 text-center">
        <UIcon name="i-mdi-playlist-remove" class="mb-2 h-8 w-8" />
        <p>{{ t('page.changelog.empty') }}</p>
      </div>
      <div v-else class="space-y-8">
        <section v-for="group in groupedEntries" :key="group.month" class="space-y-4">
          <h2 class="text-surface-400 text-sm font-semibold tracking-wide uppercase">
            {{ group.month }}
          </h2>
          <div class="space-y-3">
            <article
              v-for="(entry, index) in group.entries"
              :key="`${entry.date}-${index}`"
              class="bg-surface-900/60 rounded-xl border border-white/5 p-4"
            >
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <time class="text-surface-300 text-sm font-medium">
                  {{ formatDate(entry.date) }}
                </time>
                <span
                  v-if="entry.label"
                  class="bg-primary-500/20 text-primary-300 rounded px-2 py-0.5 text-xs font-medium"
                >
                  {{ entry.label }}
                </span>
                <span
                  v-if="entry.stats"
                  class="text-surface-500 ml-auto flex items-center gap-1.5 font-mono text-xs"
                >
                  <span class="text-success-400">+{{ formatNumber(entry.stats.additions) }}</span>
                  <span class="text-surface-600">/</span>
                  <span class="text-error-400">-{{ formatNumber(entry.stats.deletions) }}</span>
                </span>
              </div>
              <ul class="space-y-2">
                <li
                  v-for="(bullet, bulletIndex) in entry.bullets"
                  :key="bulletIndex"
                  class="flex items-start gap-2"
                >
                  <UBadge
                    :color="getBulletColor(getBulletText(bullet))"
                    variant="subtle"
                    size="xs"
                    class="mt-0.5 shrink-0"
                  >
                    {{ getBulletType(getBulletText(bullet)) }}
                  </UBadge>
                  <span class="text-surface-200 flex-1 text-sm">
                    {{ cleanBulletText(getBulletText(bullet)) }}
                  </span>
                  <span
                    v-if="getBulletStats(bullet)"
                    class="text-surface-500 shrink-0 font-mono text-[10px]"
                  >
                    <span class="text-success-500">+{{ getBulletStats(bullet)?.additions }}</span>
                    <span class="text-surface-600">/</span>
                    <span class="text-error-500">-{{ getBulletStats(bullet)?.deletions }}</span>
                  </span>
                </li>
              </ul>
            </article>
          </div>
        </section>
        <div v-if="hasMore" class="space-y-2 pt-4">
          <div class="flex justify-center">
            <UButton
              color="neutral"
              variant="soft"
              :loading="loadingMore"
              :disabled="loadingMore"
              @click="loadMore"
            >
              <UIcon name="i-mdi-plus" class="mr-1 h-4 w-4" />
              {{ t('page.changelog.load_more') }}
            </UButton>
          </div>
          <p v-if="loadMoreError" class="text-error-400 text-center text-xs">
            {{ t('page.changelog.error') }}
          </p>
        </div>
      </div>
    </div>
  </UContainer>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  import type {
    ChangelogBullet,
    ChangelogItem,
    ChangelogResponse,
    ChangelogStats,
  } from '@/types/changelog';
  const { locale, t } = useI18n({ useScope: 'global' });
  definePageMeta({
    layout: 'default',
  });
  useSeoMeta({
    title: computed(() => t('page.changelog.title')),
    description: computed(() => t('page.changelog.description')),
  });
  const entries = ref<ChangelogItem[]>([]);
  const error = ref(false);
  const loadMoreError = ref(false);
  const loadingMore = ref(false);
  const currentLimit = ref(20);
  const hasMore = ref(false);
  const {
    data: changelogData,
    pending,
    error: fetchError,
    refresh,
  } = useFetch<ChangelogResponse>(() => `/api/changelog?limit=${currentLimit.value}`, {
    immediate: true,
    key: 'changelog',
    watch: false,
  });
  watchEffect(() => {
    if (fetchError.value) {
      logger.error('Failed to fetch changelog entries', fetchError.value);
      error.value = true;
      if (!entries.value.length || !loadingMore.value) {
        entries.value = [];
        hasMore.value = false;
      }
      return;
    }
    if (changelogData.value?.error) {
      logger.error('Failed to fetch changelog entries', {
        error: changelogData.value.error,
      });
      error.value = true;
      if (!entries.value.length || !loadingMore.value) {
        entries.value = [];
        hasMore.value = false;
      }
      return;
    }
    error.value = false;
    entries.value = changelogData.value?.items ?? [];
    hasMore.value = changelogData.value?.hasMore ?? false;
  });
  const groupedEntries = computed(() => {
    const groups = new Map<string, ChangelogItem[]>();
    const dateFormatter = new Intl.DateTimeFormat(locale.value, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const sortedEntries = [...entries.value].sort((a, b) => b.date.localeCompare(a.date));
    for (const entry of sortedEntries) {
      const date = new Date(`${entry.date}T00:00:00Z`);
      const monthKey = dateFormatter.format(date);
      const existing = groups.get(monthKey) ?? [];
      existing.push(entry);
      groups.set(monthKey, existing);
    }
    return Array.from(groups.entries()).map(([month, items]) => ({
      month,
      entries: items,
    }));
  });
  const showInitialLoading = computed(() => pending.value && entries.value.length === 0);
  const formatDate = (date: string): string => {
    if (!date) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(locale.value, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };
  const formatNumber = (num: number): string => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return String(num);
  };
  const getBulletText = (bullet: ChangelogBullet): string => {
    return typeof bullet === 'string' ? bullet : bullet.text;
  };
  const getBulletStats = (bullet: ChangelogBullet): ChangelogStats | undefined => {
    return typeof bullet === 'string' ? undefined : bullet.stats;
  };
  const getBulletType = (text: string): string => {
    const lower = text.toLowerCase();
    if (lower.startsWith('added')) return t('page.changelog.types.added');
    if (lower.startsWith('fixed')) return t('page.changelog.types.fixed');
    if (lower.startsWith('improved')) return t('page.changelog.types.improved');
    if (lower.startsWith('updated')) return t('page.changelog.types.updated');
    return t('page.changelog.types.changed');
  };
  type BadgeColor = 'success' | 'error' | 'info' | 'warning' | 'neutral';
  const getBulletColor = (text: string): BadgeColor => {
    const lower = text.toLowerCase();
    if (lower.startsWith('added')) return 'success';
    if (lower.startsWith('fixed')) return 'error';
    if (lower.startsWith('improved')) return 'info';
    if (lower.startsWith('updated')) return 'warning';
    return 'neutral';
  };
  const cleanBulletText = (text: string): string => {
    return text.replace(/^(added|fixed|improved|updated)\s+/i, '').replace(/\.$/, '');
  };
  const loadChangelog = async (): Promise<boolean> => {
    error.value = false;
    try {
      await refresh();
      if (fetchError.value || changelogData.value?.error) {
        return false;
      }
      return true;
    } catch (err) {
      error.value = true;
      logger.error('Failed to load changelog', err);
      return false;
    }
  };
  const loadMore = async () => {
    loadingMore.value = true;
    loadMoreError.value = false;
    const previousLimit = currentLimit.value;
    const previousEntries = [...entries.value];
    currentLimit.value += 20;
    const loaded = await loadChangelog();
    if (!loaded) {
      currentLimit.value = previousLimit;
      entries.value = previousEntries;
      loadMoreError.value = true;
    }
    loadingMore.value = false;
  };
  const retryLoadChangelog = (): void => {
    void loadChangelog();
  };
</script>
