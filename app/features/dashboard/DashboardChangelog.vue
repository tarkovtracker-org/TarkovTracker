<template>
  <div class="mb-3">
    <div class="panel px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-sm font-semibold text-white">
          <UIcon name="i-mdi-history" class="text-primary-400 h-4 w-4" />
          {{ t('page.dashboard.changelog.title') }}
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink
            to="/changelog"
            class="text-primary-400 hover:text-primary-300 text-xs transition-colors"
          >
            {{ t('page.dashboard.changelog.view_all') }}
          </NuxtLink>
          <span class="text-surface-600">|</span>
          <UButton
            size="xs"
            color="neutral"
            variant="link"
            :aria-controls="PANEL_ID"
            :aria-expanded="isOpen"
            @click="toggleOpen"
          >
            {{ isOpen ? t('page.dashboard.changelog.hide') : t('page.dashboard.changelog.show') }}
          </UButton>
        </div>
      </div>
      <div v-if="isOpen" :id="PANEL_ID" class="mt-2 space-y-3 text-xs sm:text-sm">
        <div v-if="pending" class="text-surface-400 text-xs">
          {{ t('page.dashboard.changelog.loading') }}
        </div>
        <div v-else-if="error" class="text-surface-400 flex items-center gap-2 text-xs">
          <span>{{ t('page.dashboard.changelog.error') }}</span>
          <UButton size="xs" color="neutral" variant="link" @click="retry">
            {{ t('page.dashboard.changelog.retry') }}
          </UButton>
        </div>
        <div v-else-if="showEmpty" class="text-surface-400 text-xs">
          {{ t('page.dashboard.changelog.empty') }}
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(entry, entryIndex) in entries"
            :key="`${entry.date}-${entryIndex}`"
            class="space-y-1"
          >
            <div class="text-surface-300 text-[11px] font-semibold tracking-wide uppercase">
              <span>{{ formatDate(entry.date) }}</span>
              <span v-if="entry.label" class="text-surface-400">· {{ entry.label }}</span>
            </div>
            <ul class="text-surface-200 list-disc space-y-1 pl-4">
              <li v-for="(bullet, index) in entry.bullets" :key="index">
                {{ getBulletText(bullet) }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    cleanText,
    extractReleaseBullets,
    normalizeCommitMessage,
    toSentence,
  } from '@/utils/changelog';
  import { logger } from '@/utils/logger';
  import type { ChangelogBullet, ChangelogItem, ChangelogResponse } from '@/types/changelog';
  const PANEL_ID = 'dashboard-changelog-panel';
  const SERVER_CHANGELOG_KEY = 'dashboard-changelog-server';
  const SERVER_CHANGELOG_URL = '/api/changelog';
  const GITHUB_RELEASES_KEY = 'dashboard-changelog-github-releases';
  const GITHUB_COMMITS_KEY = 'dashboard-changelog-github-commits';
  const GITHUB_CACHE_KEY_PREFIX = 'dashboard-changelog-cache';
  const GITHUB_CACHE_TTL_MS = 15 * 60 * 1000;
  const GITHUB_RATE_LIMIT_LOW_THRESHOLD = 2;
  const ENABLE_CLIENT_GITHUB_FALLBACK = false;
  const runtimeConfig = useRuntimeConfig();
  const githubOwner = runtimeConfig.public.githubOwner || 'tarkovtracker-org';
  const githubRepo = runtimeConfig.public.githubRepo || 'TarkovTracker';
  const GITHUB_RELEASES_URL = `https://api.github.com/repos/${githubOwner}/${githubRepo}/releases`;
  const GITHUB_COMMITS_URL = `https://api.github.com/repos/${githubOwner}/${githubRepo}/commits`;
  const { locale, t } = useI18n({ useScope: 'global' });
  const isOpen = ref(false);
  const hasRequested = ref(false);
  const entries = ref<ChangelogItem[]>([]);
  const pending = ref(false);
  const error = ref(false);
  const showEmpty = computed(() => !pending.value && !error.value && entries.value.length === 0);
  const sortByDateDesc = (items: ChangelogItem[]): ChangelogItem[] => {
    return [...items].sort((a, b) => b.date.localeCompare(a.date));
  };
  type GitHubPayload = Array<Record<string, unknown>>;
  type GitHubRateLimitState = {
    remaining: number | null;
    resetEpoch: number | null;
    status: number | null;
  };
  type GitHubCacheEntry = {
    timestamp: number;
    data: GitHubPayload;
  };
  const createGitHubRateLimitState = (): GitHubRateLimitState => ({
    remaining: null,
    resetEpoch: null,
    status: null,
  });
  const githubReleaseRateLimit = ref<GitHubRateLimitState>(createGitHubRateLimitState());
  const githubCommitRateLimit = ref<GitHubRateLimitState>(createGitHubRateLimitState());
  const githubMemoryCache = new Map<string, GitHubCacheEntry>();
  const getBulletText = (bullet: ChangelogBullet): string => {
    return typeof bullet === 'string' ? bullet : bullet.text;
  };
  const parseHeaderValue = (headers: unknown, key: string): string | null => {
    if (!headers) return null;
    const lowerKey = key.toLowerCase();
    if (
      typeof headers === 'object' &&
      headers !== null &&
      'get' in headers &&
      typeof (headers as Headers).get === 'function'
    ) {
      return (headers as Headers).get(key);
    }
    if (typeof headers === 'object' && headers !== null) {
      const record = headers as Record<string, string | string[] | undefined>;
      const matchedKey = Object.keys(record).find(
        (headerKey) => headerKey.toLowerCase() === lowerKey
      );
      if (!matchedKey) return null;
      const value = record[matchedKey];
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    }
    return null;
  };
  const formatResetAt = (resetEpoch: number | null): string | null => {
    if (resetEpoch === null) return null;
    const parsed = new Date(resetEpoch * 1000);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  };
  const updateRateLimitState = (
    target: globalThis.Ref<GitHubRateLimitState>,
    response: { status?: number; headers?: unknown } | undefined
  ) => {
    if (!response) return;
    const remainingHeader = parseHeaderValue(response.headers, 'x-ratelimit-remaining');
    const resetHeader = parseHeaderValue(response.headers, 'x-ratelimit-reset');
    const parsedRemaining = Number(remainingHeader);
    const parsedReset = Number(resetHeader);
    target.value = {
      remaining: Number.isFinite(parsedRemaining) ? parsedRemaining : null,
      resetEpoch: Number.isFinite(parsedReset) ? parsedReset : null,
      status: response.status ?? null,
    };
  };
  const getGitHubCacheKey = (url: string) => `${GITHUB_CACHE_KEY_PREFIX}:${url}`;
  const getCachedGithubData = (url: string): GitHubPayload | null => {
    const now = Date.now();
    const memoryEntry = githubMemoryCache.get(url);
    if (memoryEntry) {
      if (now - memoryEntry.timestamp < GITHUB_CACHE_TTL_MS) {
        return memoryEntry.data;
      }
      githubMemoryCache.delete(url);
    }
    if (!import.meta.client) return null;
    try {
      const raw = localStorage.getItem(getGitHubCacheKey(url));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GitHubCacheEntry;
      if (!parsed || !Array.isArray(parsed.data) || typeof parsed.timestamp !== 'number') {
        localStorage.removeItem(getGitHubCacheKey(url));
        return null;
      }
      if (now - parsed.timestamp >= GITHUB_CACHE_TTL_MS) {
        localStorage.removeItem(getGitHubCacheKey(url));
        return null;
      }
      githubMemoryCache.set(url, parsed);
      return parsed.data;
    } catch (err) {
      logger.warn('[DashboardChangelog] Failed to read changelog cache entry.', { url, err });
      return null;
    }
  };
  const setCachedGithubData = (url: string, data: GitHubPayload): void => {
    const entry: GitHubCacheEntry = {
      timestamp: Date.now(),
      data,
    };
    githubMemoryCache.set(url, entry);
    if (!import.meta.client) return;
    try {
      localStorage.setItem(getGitHubCacheKey(url), JSON.stringify(entry));
    } catch (err) {
      logger.warn('[DashboardChangelog] Failed to persist changelog cache entry.', { url, err });
    }
  };
  const shouldPreferCachedData = (remaining: number | null): boolean => {
    return remaining !== null && remaining >= 0 && remaining <= GITHUB_RATE_LIMIT_LOW_THRESHOLD;
  };
  const withRateLimitDetails = (
    state: globalThis.Ref<GitHubRateLimitState>,
    extra: Record<string, unknown>
  ): Record<string, unknown> => ({
    ...extra,
    status: state.value.status,
    remaining: state.value.remaining,
    resetEpoch: state.value.resetEpoch,
    resetAt: formatResetAt(state.value.resetEpoch),
  });
  const logGithubResponseError = (
    source: 'releases' | 'commits',
    url: string,
    response: { status?: number; url?: string } | undefined,
    rateLimitState: globalThis.Ref<GitHubRateLimitState>
  ) => {
    const details = withRateLimitDetails(rateLimitState, {
      url: response?.url ?? url,
      hasCachedData: Boolean(getCachedGithubData(url)),
    });
    if (response?.status === 403) {
      logger.error(`[DashboardChangelog] fetchGithubItems ${source} rate-limited.`, details);
      return;
    }
    logger.error(`[DashboardChangelog] fetchGithubItems ${source} failed.`, details);
  };
  const buildReleaseItems = (releases: Array<Record<string, unknown>>): ChangelogItem[] => {
    const items = releases
      .filter((release) => release && release.draft !== true)
      .slice(0, 3)
      .map((release) => {
        const date = String(release.published_at || release.created_at || '').slice(0, 10);
        const label = cleanText(String(release.name || release.tag_name || ''));
        const rawBullets = extractReleaseBullets(release.body as string | null | undefined);
        const bullets = rawBullets.map(toSentence).filter(Boolean).slice(0, 5);
        if (!bullets.length && label) {
          bullets.push(toSentence(label));
        }
        return { date, label: label || undefined, bullets };
      })
      .filter((item) => item.date && item.bullets.length);
    return items;
  };
  const buildCommitItems = (commits: Array<Record<string, unknown>>): ChangelogItem[] => {
    const grouped = new Map<string, ChangelogItem>();
    let total = 0;
    for (const commit of commits) {
      if (total >= 10) break;
      const commitData = (commit?.commit as Record<string, unknown> | undefined) ?? {};
      const bullet = normalizeCommitMessage(commitData.message as string | null | undefined);
      if (!bullet) continue;
      const date =
        (commitData.author as Record<string, unknown> | undefined)?.date ||
        (commitData.committer as Record<string, unknown> | undefined)?.date ||
        '';
      const day = String(date).slice(0, 10);
      if (!day) continue;
      const existing = grouped.get(day) ?? { date: day, bullets: [] };
      if (existing.bullets.length < 5) {
        existing.bullets.push(bullet);
        grouped.set(day, existing);
        total += 1;
      }
    }
    return Array.from(grouped.values());
  };
  const logError = (message: string, err: unknown, context: Record<string, unknown> = {}) => {
    if (err instanceof Error) {
      logger.error(message, { ...context, message: err.message, stack: err.stack });
      return;
    }
    logger.error(message, { ...context, err });
  };
  const serverRequest = useFetch<ChangelogResponse>(SERVER_CHANGELOG_URL, {
    key: SERVER_CHANGELOG_KEY,
    query: { limit: 10 },
    headers: { Accept: 'application/json' },
    immediate: false,
    server: false,
    onResponseError({ response }) {
      logger.error('[DashboardChangelog] fetchServerItems failed.', {
        status: response?.status,
        url: response?.url ?? SERVER_CHANGELOG_URL,
      });
    },
    onRequestError({ error }) {
      logError('[DashboardChangelog] fetchServerItems error.', error);
    },
  });
  const githubReleaseRequest = useFetch<Array<Record<string, unknown>>>(GITHUB_RELEASES_URL, {
    key: GITHUB_RELEASES_KEY,
    query: { per_page: 3 },
    headers: { Accept: 'application/vnd.github+json' },
    immediate: false,
    server: false,
    onResponse({ response }) {
      updateRateLimitState(githubReleaseRateLimit, response);
      const payload = response._data;
      if (Array.isArray(payload)) {
        setCachedGithubData(GITHUB_RELEASES_URL, payload);
      }
    },
    onResponseError({ response }) {
      updateRateLimitState(githubReleaseRateLimit, response);
      logGithubResponseError('releases', GITHUB_RELEASES_URL, response, githubReleaseRateLimit);
    },
    onRequestError({ error }) {
      logError(
        '[DashboardChangelog] fetchGithubItems releases error.',
        error,
        withRateLimitDetails(githubReleaseRateLimit, {
          url: GITHUB_RELEASES_URL,
          hasCachedData: Boolean(getCachedGithubData(GITHUB_RELEASES_URL)),
        })
      );
    },
  });
  const githubCommitRequest = useFetch<Array<Record<string, unknown>>>(GITHUB_COMMITS_URL, {
    key: GITHUB_COMMITS_KEY,
    query: { per_page: 40 },
    headers: { Accept: 'application/vnd.github+json' },
    immediate: false,
    server: false,
    onResponse({ response }) {
      updateRateLimitState(githubCommitRateLimit, response);
      const payload = response._data;
      if (Array.isArray(payload)) {
        setCachedGithubData(GITHUB_COMMITS_URL, payload);
      }
    },
    onResponseError({ response }) {
      updateRateLimitState(githubCommitRateLimit, response);
      logGithubResponseError('commits', GITHUB_COMMITS_URL, response, githubCommitRateLimit);
    },
    onRequestError({ error }) {
      logError(
        '[DashboardChangelog] fetchGithubItems commits error.',
        error,
        withRateLimitDetails(githubCommitRateLimit, {
          url: GITHUB_COMMITS_URL,
          hasCachedData: Boolean(getCachedGithubData(GITHUB_COMMITS_URL)),
        })
      );
    },
  });
  const fetchServerItems = async (): Promise<ChangelogItem[] | null> => {
    try {
      await serverRequest.refresh();
      if (serverRequest.error.value) {
        return null;
      }
      const data = serverRequest.data.value;
      if (!data || !Array.isArray(data.items)) {
        logger.error('[DashboardChangelog] fetchServerItems invalid response shape.', {
          data,
          url: SERVER_CHANGELOG_URL,
        });
        return null;
      }
      if (data.error) {
        logger.error('[DashboardChangelog] fetchServerItems response error.', {
          error: data.error,
          url: SERVER_CHANGELOG_URL,
        });
        return null;
      }
      return data.items;
    } catch (err) {
      logError('[DashboardChangelog] fetchServerItems error.', err);
      return null;
    }
  };
  const fetchGithubItems = async (): Promise<ChangelogItem[] | null> => {
    try {
      await githubReleaseRequest.refresh();
      const cachedReleases = getCachedGithubData(GITHUB_RELEASES_URL);
      const releaseRequestFailed = Boolean(githubReleaseRequest.error.value);
      const shouldUseCachedReleases =
        releaseRequestFailed || shouldPreferCachedData(githubReleaseRateLimit.value.remaining);
      const releases = shouldUseCachedReleases
        ? cachedReleases
        : (githubReleaseRequest.data.value as GitHubPayload | null);
      if (releaseRequestFailed && !releases) {
        logger.error('[DashboardChangelog] fetchGithubItems releases failed without cache.', {
          ...withRateLimitDetails(githubReleaseRateLimit, { url: GITHUB_RELEASES_URL }),
        });
      } else if (shouldUseCachedReleases && releases) {
        logger.warn('[DashboardChangelog] Using cached GitHub releases data.', {
          ...withRateLimitDetails(githubReleaseRateLimit, { url: GITHUB_RELEASES_URL }),
        });
      }
      if (Array.isArray(releases)) {
        const releaseItems = buildReleaseItems(releases);
        if (releaseItems.length) return releaseItems;
      }
      await githubCommitRequest.refresh();
      const cachedCommits = getCachedGithubData(GITHUB_COMMITS_URL);
      const commitRequestFailed = Boolean(githubCommitRequest.error.value);
      const shouldUseCachedCommits =
        commitRequestFailed || shouldPreferCachedData(githubCommitRateLimit.value.remaining);
      const commits = shouldUseCachedCommits
        ? cachedCommits
        : (githubCommitRequest.data.value as GitHubPayload | null);
      if (commitRequestFailed && !commits) {
        logger.error('[DashboardChangelog] fetchGithubItems commits failed without cache.', {
          ...withRateLimitDetails(githubCommitRateLimit, { url: GITHUB_COMMITS_URL }),
        });
        return null;
      }
      if (shouldUseCachedCommits && commits) {
        logger.warn('[DashboardChangelog] Using cached GitHub commits data.', {
          ...withRateLimitDetails(githubCommitRateLimit, { url: GITHUB_COMMITS_URL }),
        });
      }
      if (!Array.isArray(commits)) return null;
      return buildCommitItems(commits);
    } catch (err) {
      logError('[DashboardChangelog] fetchGithubItems error.', err);
      return null;
    }
  };
  const loadChangelog = async (force = false) => {
    if (pending.value) return;
    if (hasRequested.value && !force) return;
    pending.value = true;
    error.value = false;
    hasRequested.value = true;
    let newEntries = await fetchServerItems();
    if (newEntries?.length) {
      entries.value = sortByDateDesc(newEntries);
      pending.value = false;
      return;
    }
    if (ENABLE_CLIENT_GITHUB_FALLBACK) {
      newEntries = await fetchGithubItems();
      if (newEntries?.length) {
        entries.value = sortByDateDesc(newEntries);
        pending.value = false;
        return;
      }
    }
    entries.value = [];
    error.value = true;
    pending.value = false;
  };
  const toggleOpen = () => {
    isOpen.value = !isOpen.value;
  };
  const retry = async () => {
    hasRequested.value = false;
    await loadChangelog(true);
  };
  watch(isOpen, async (open) => {
    if (open) {
      await loadChangelog();
    }
  });
  const formatDate = (date: string): string => {
    if (!date) return '';
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(locale.value, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };
</script>
