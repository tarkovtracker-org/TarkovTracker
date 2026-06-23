import { defineEventHandler, getQuery, setResponseHeaders } from 'h3';
import { LRUCache } from 'lru-cache';
import { createLogger } from '@/server/utils/logger';
import {
  cleanText,
  extractReleaseBullets,
  normalizeCommitMessage,
  toSentence,
} from '@/utils/changelog';
import type {
  ChangelogBullet,
  ChangelogItem,
  ChangelogResponse,
  ChangelogStats,
} from '@/types/changelog';
type GitHubRelease = {
  name?: string | null;
  tag_name?: string | null;
  body?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  draft?: boolean | null;
};
type GitHubCommitListItem = {
  sha?: string | null;
  commit?: {
    message?: string | null;
    author?: { date?: string | null } | null;
    committer?: { date?: string | null } | null;
  } | null;
};
type GitHubCommitDetail = {
  sha?: string | null;
  commit?: {
    message?: string | null;
    author?: { date?: string | null } | null;
    committer?: { date?: string | null } | null;
  } | null;
  stats?: {
    additions?: number;
    deletions?: number;
    total?: number;
  } | null;
};
type GitHubCompareResponse = {
  ahead_by?: number;
  behind_by?: number;
  total_commits?: number;
  files?: Array<{
    additions?: number;
    deletions?: number;
    changes?: number;
  }>;
};
type StatsCacheEntry = { stats: ChangelogStats; timestamp: number };
type ResponseCacheEntry = { response: ChangelogResponse; timestamp: number };
type GitHubConfig = { owner: string; repo: string; baseUrl: string; timeoutMs: number };
const logger = createLogger('Changelog');
const changelogConfig = (() => {
  const MAX_STATS_CACHE_ENTRIES = 1000;
  const MAX_RESPONSE_CACHE_ENTRIES = 100;
  const STATS_CACHE_TTL_MS = 30 * 60 * 1000;
  const RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
  return {
    DEFAULT_OWNER: 'tarkovtracker-org',
    DEFAULT_REPO: 'TarkovTracker',
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 50,
    RELEASE_LIMIT: 3,
    MAX_BULLETS_PER_GROUP: 5,
    COMMIT_PAGE_SIZE: 100,
    MAX_COMMIT_PAGES: 15,
    DEFAULT_GITHUB_TIMEOUT_MS: 8000,
    MIN_GITHUB_TIMEOUT_MS: 1000,
    MAX_GITHUB_TIMEOUT_MS: 20000,
    STATS_CACHE_TTL_MS,
    RESPONSE_CACHE_TTL_MS,
    MAX_STATS_CACHE_ENTRIES,
    MAX_RESPONSE_CACHE_ENTRIES,
    SHARED_STATS_CACHE_PREFIX: 'changelog-stats',
    SHARED_RESPONSE_CACHE_PREFIX: 'changelog-response',
    MAX_KEY_LENGTH: 200, // Defensive bound for local/Cache API cache keys.
    STATS_EVICTION_BATCH_SIZE: Math.ceil(MAX_STATS_CACHE_ENTRIES * 0.1),
    RESPONSE_EVICTION_BATCH_SIZE: Math.ceil(MAX_RESPONSE_CACHE_ENTRIES * 0.1),
    FULL_EVICTION_INTERVAL_MS: 5 * 60 * 1000, // Local in-memory eviction cadence; not shared across instances.
    cache: {
      statsCache: new LRUCache<string, StatsCacheEntry>({ max: MAX_STATS_CACHE_ENTRIES }),
      responseCache: new LRUCache<string, ResponseCacheEntry>({ max: MAX_RESPONSE_CACHE_ENTRIES }),
      lastFullEviction: 0,
    },
  };
})();
const evictStaleEntries = (): number => {
  const now = Date.now();
  let evicted = 0;
  for (const [key, entry] of changelogConfig.cache.statsCache) {
    if (now - entry.timestamp >= changelogConfig.STATS_CACHE_TTL_MS) {
      changelogConfig.cache.statsCache.delete(key);
      evicted++;
    }
  }
  for (const [key, entry] of changelogConfig.cache.responseCache) {
    if (now - entry.timestamp >= changelogConfig.RESPONSE_CACHE_TTL_MS) {
      changelogConfig.cache.responseCache.delete(key);
      evicted++;
    }
  }
  return evicted;
};
const evictLRU = <T extends object>(cache: LRUCache<string, T>, count: number): void => {
  if (count <= 0) return;
  let evicted = 0;
  while (evicted < count) {
    const removed = cache.pop();
    if (!removed) break;
    evicted++;
  }
};
const maybeRunFullEviction = (): void => {
  const now = Date.now();
  if (now - changelogConfig.cache.lastFullEviction < changelogConfig.FULL_EVICTION_INTERVAL_MS) {
    return;
  }
  changelogConfig.cache.lastFullEviction = now;
  evictStaleEntries();
  if (changelogConfig.cache.statsCache.size > changelogConfig.MAX_STATS_CACHE_ENTRIES) {
    evictLRU(
      changelogConfig.cache.statsCache,
      changelogConfig.cache.statsCache.size -
        changelogConfig.MAX_STATS_CACHE_ENTRIES +
        changelogConfig.STATS_EVICTION_BATCH_SIZE
    );
  }
  if (changelogConfig.cache.responseCache.size > changelogConfig.MAX_RESPONSE_CACHE_ENTRIES) {
    evictLRU(
      changelogConfig.cache.responseCache,
      changelogConfig.cache.responseCache.size -
        changelogConfig.MAX_RESPONSE_CACHE_ENTRIES +
        changelogConfig.RESPONSE_EVICTION_BATCH_SIZE
    );
  }
};
const isValidCacheKey = (key: string): boolean => {
  return typeof key === 'string' && key.length > 0 && key.length <= changelogConfig.MAX_KEY_LENGTH;
};
const getLocalCacheEntry = (key: string): StatsCacheEntry | null => {
  const cached = changelogConfig.cache.statsCache.get(key);
  if (!cached) return null;
  const now = Date.now();
  if (now - cached.timestamp >= changelogConfig.STATS_CACHE_TTL_MS) {
    changelogConfig.cache.statsCache.delete(key);
    return null;
  }
  return cached;
};
const setLocalCacheEntry = (key: string, entry: StatsCacheEntry): void => {
  if (!isValidCacheKey(key)) return;
  maybeRunFullEviction();
  if (
    changelogConfig.cache.statsCache.size >= changelogConfig.MAX_STATS_CACHE_ENTRIES &&
    !changelogConfig.cache.statsCache.has(key)
  ) {
    evictLRU(changelogConfig.cache.statsCache, changelogConfig.STATS_EVICTION_BATCH_SIZE);
  }
  changelogConfig.cache.statsCache.set(key, entry);
};
const getLocalResponseCacheEntry = (key: string): ResponseCacheEntry | null => {
  const cached = changelogConfig.cache.responseCache.get(key);
  if (!cached) return null;
  const now = Date.now();
  if (now - cached.timestamp >= changelogConfig.RESPONSE_CACHE_TTL_MS) {
    changelogConfig.cache.responseCache.delete(key);
    return null;
  }
  return cached;
};
const setLocalResponseCacheEntry = (key: string, entry: ResponseCacheEntry): void => {
  if (!isValidCacheKey(key)) return;
  maybeRunFullEviction();
  if (
    changelogConfig.cache.responseCache.size >= changelogConfig.MAX_RESPONSE_CACHE_ENTRIES &&
    !changelogConfig.cache.responseCache.has(key)
  ) {
    evictLRU(changelogConfig.cache.responseCache, changelogConfig.RESPONSE_EVICTION_BATCH_SIZE);
  }
  changelogConfig.cache.responseCache.set(key, entry);
};
const getSharedCache = (): Cache | null => {
  const cacheStorage = (
    globalThis as typeof globalThis & { caches?: CacheStorage & { default?: Cache } }
  ).caches;
  return cacheStorage?.default ?? null;
};
const getSharedCacheOrigin = (): { host: string; protocol: string } => {
  const runtimeConfig = useRuntimeConfig();
  const appUrl = runtimeConfig?.public?.appUrl;
  if (!appUrl) {
    return { host: 'tarkovtracker.org', protocol: 'https:' };
  }
  try {
    const parsedAppUrl = new URL(appUrl);
    const hostname = parsedAppUrl.hostname;
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      /^127\./.test(hostname);
    if (isLocalhost) {
      return { host: 'tarkovtracker.org', protocol: 'https:' };
    }
    return { host: parsedAppUrl.host, protocol: parsedAppUrl.protocol || 'https:' };
  } catch {
    return { host: 'tarkovtracker.org', protocol: 'https:' };
  }
};
const buildSharedCacheRequest = (key: string): Request => {
  const { host, protocol } = getSharedCacheOrigin();
  const encodedKey = encodeURIComponent(key);
  const cacheUrl = new URL(
    `${protocol}//${host}/__edge-cache/${changelogConfig.SHARED_STATS_CACHE_PREFIX}/${encodedKey}`
  );
  return new Request(cacheUrl.toString());
};
const getSharedCacheEntry = async (key: string): Promise<StatsCacheEntry | null> => {
  const cache = getSharedCache();
  if (!cache) return null;
  try {
    const cachedResponse = await cache.match(buildSharedCacheRequest(key));
    if (!cachedResponse) return null;
    const payload = (await cachedResponse.json()) as StatsCacheEntry | null;
    if (!payload?.stats || typeof payload.timestamp !== 'number') return null;
    if (Date.now() - payload.timestamp >= changelogConfig.STATS_CACHE_TTL_MS) return null;
    return payload;
  } catch (error) {
    logger.warn('[Changelog] Failed to read shared cache.', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};
const setSharedCacheEntry = async (key: string, entry: StatsCacheEntry): Promise<void> => {
  const cache = getSharedCache();
  if (!cache) return;
  const ttlSeconds = Math.max(1, Math.floor(changelogConfig.STATS_CACHE_TTL_MS / 1000));
  try {
    const response = new Response(JSON.stringify(entry), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
      },
    });
    await cache.put(buildSharedCacheRequest(key), response);
  } catch (error) {
    logger.warn('[Changelog] Failed to write shared cache.', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
const buildSharedResponseCacheRequest = (key: string): Request => {
  const { host, protocol } = getSharedCacheOrigin();
  const encodedKey = encodeURIComponent(key);
  const cacheUrl = new URL(
    `${protocol}//${host}/__edge-cache/${changelogConfig.SHARED_RESPONSE_CACHE_PREFIX}/${encodedKey}`
  );
  return new Request(cacheUrl.toString());
};
const getSharedResponseCacheEntry = async (key: string): Promise<ResponseCacheEntry | null> => {
  const cache = getSharedCache();
  if (!cache) return null;
  try {
    const cachedResponse = await cache.match(buildSharedResponseCacheRequest(key));
    if (!cachedResponse) return null;
    const payload = (await cachedResponse.json()) as ResponseCacheEntry | null;
    if (!payload?.response || typeof payload.timestamp !== 'number') return null;
    if (Date.now() - payload.timestamp >= changelogConfig.RESPONSE_CACHE_TTL_MS) return null;
    return payload;
  } catch (error) {
    logger.warn('[Changelog] Failed to read shared response cache.', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};
const setSharedResponseCacheEntry = async (
  key: string,
  entry: ResponseCacheEntry
): Promise<void> => {
  const cache = getSharedCache();
  if (!cache) return;
  const ttlSeconds = Math.max(1, Math.floor(changelogConfig.RESPONSE_CACHE_TTL_MS / 1000));
  try {
    const response = new Response(JSON.stringify(entry), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
      },
    });
    await cache.put(buildSharedResponseCacheRequest(key), response);
  } catch (error) {
    logger.warn('[Changelog] Failed to write shared response cache.', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
const parseNumber = (value: unknown, fallback: number): number => {
  if (Array.isArray(value)) return parseNumber(value[0], fallback);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};
const getGitHubConfig = (runtimeConfig: ReturnType<typeof useRuntimeConfig>): GitHubConfig => {
  const owner =
    (typeof runtimeConfig.public.githubOwner === 'string' &&
      runtimeConfig.public.githubOwner.trim()) ||
    changelogConfig.DEFAULT_OWNER;
  const repo =
    (typeof runtimeConfig.public.githubRepo === 'string' &&
      runtimeConfig.public.githubRepo.trim()) ||
    changelogConfig.DEFAULT_REPO;
  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const timeoutMs = clamp(
    parseNumber(runtimeConfig.githubTimeoutMs, changelogConfig.DEFAULT_GITHUB_TIMEOUT_MS),
    changelogConfig.MIN_GITHUB_TIMEOUT_MS,
    changelogConfig.MAX_GITHUB_TIMEOUT_MS
  );
  return { owner, repo, baseUrl, timeoutMs };
};
const fetchGithub = async <T>(
  url: string,
  githubToken?: string,
  timeoutMs: number = changelogConfig.DEFAULT_GITHUB_TIMEOUT_MS
): Promise<T | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let response: Response;
  try {
    const trimmedToken = typeof githubToken === 'string' ? githubToken.trim() : '';
    response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(trimmedToken ? { Authorization: `token ${trimmedToken}` } : {}),
        'User-Agent': 'TarkovTracker',
      },
      signal: controller.signal,
    });
  } catch (error) {
    const isAbortError =
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError');
    logger.error(
      isAbortError
        ? '[Changelog] GitHub request timed out.'
        : '[Changelog] Network error fetching GitHub data.',
      {
        url,
        timeoutMs,
        aborted: isAbortError,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
  const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
  const rateLimitReset = response.headers.get('x-ratelimit-reset');
  if (response.status === 403 || response.status === 429 || rateLimitRemaining === '0') {
    logger.warn('[Changelog] GitHub rate limit reached.', {
      url,
      status: response.status,
      rateLimitRemaining,
      rateLimitReset: rateLimitReset ? new Date(Number(rateLimitReset) * 1000).toISOString() : null,
    });
    return null;
  }
  if (!response.ok) {
    let bodySnippet: string;
    try {
      bodySnippet = await response.text();
      if (bodySnippet.length > 200) {
        bodySnippet = bodySnippet.slice(0, 200) + '...';
      }
    } catch {
      bodySnippet = '[unable to read response body]';
    }
    logger.warn('[Changelog] Non-OK response from GitHub.', {
      url,
      status: response.status,
      body: bodySnippet,
    });
    return null;
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    logger.error('[Changelog] Failed to parse GitHub response.', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};
const fetchCommitStats = async (
  sha: string,
  baseUrl: string,
  githubToken?: string,
  timeoutMs: number = changelogConfig.DEFAULT_GITHUB_TIMEOUT_MS
): Promise<ChangelogStats | null> => {
  const cacheKey = `commit:${sha}`;
  const cached = getLocalCacheEntry(cacheKey);
  if (cached) return cached.stats;
  const sharedCached = await getSharedCacheEntry(cacheKey);
  if (sharedCached) {
    setLocalCacheEntry(cacheKey, sharedCached);
    return sharedCached.stats;
  }
  const detail = await fetchGithub<GitHubCommitDetail>(
    `${baseUrl}/commits/${sha}`,
    githubToken,
    timeoutMs
  );
  if (!detail?.stats) return null;
  const stats: ChangelogStats = {
    additions: detail.stats.additions ?? 0,
    deletions: detail.stats.deletions ?? 0,
  };
  const entry = { stats, timestamp: Date.now() };
  setLocalCacheEntry(cacheKey, entry);
  await setSharedCacheEntry(cacheKey, entry);
  return stats;
};
const fetchReleaseStats = async (
  tagName: string,
  prevTagName: string | undefined,
  baseUrl: string,
  githubToken?: string,
  timeoutMs: number = changelogConfig.DEFAULT_GITHUB_TIMEOUT_MS
): Promise<ChangelogStats | null> => {
  const cacheKey = `release:${tagName}:${prevTagName || 'initial'}`;
  const cached = getLocalCacheEntry(cacheKey);
  if (cached) return cached.stats;
  const sharedCached = await getSharedCacheEntry(cacheKey);
  if (sharedCached) {
    setLocalCacheEntry(cacheKey, sharedCached);
    return sharedCached.stats;
  }
  if (!prevTagName) return null;
  const compareUrl = `${baseUrl}/compare/${prevTagName}...${tagName}`;
  const compare = await fetchGithub<GitHubCompareResponse>(compareUrl, githubToken, timeoutMs);
  if (!compare?.files) return null;
  const stats: ChangelogStats = {
    additions: compare.files.reduce((sum, f) => sum + (f.additions ?? 0), 0),
    deletions: compare.files.reduce((sum, f) => sum + (f.deletions ?? 0), 0),
  };
  const entry = { stats, timestamp: Date.now() };
  setLocalCacheEntry(cacheKey, entry);
  await setSharedCacheEntry(cacheKey, entry);
  return stats;
};
const buildReleaseItems = async (
  releases: GitHubRelease[],
  limit: number = changelogConfig.RELEASE_LIMIT,
  baseUrl: string,
  githubToken?: string,
  timeoutMs: number = changelogConfig.DEFAULT_GITHUB_TIMEOUT_MS
): Promise<ChangelogItem[]> => {
  const validReleases = releases.filter((release) => !release.draft).slice(0, limit);
  type ReleaseItemData = {
    date: string;
    label: string;
    bullets: ChangelogBullet[];
    tagName: string | undefined;
    prevTagName: string | undefined;
  };
  const releaseData: ReleaseItemData[] = [];
  for (let i = 0; i < validReleases.length; i++) {
    const release = validReleases[i];
    if (!release) continue;
    const date = (release.published_at || release.created_at || '').slice(0, 10);
    const label = cleanText(release.name || release.tag_name || '');
    const rawBullets = extractReleaseBullets(release.body);
    const bullets: ChangelogBullet[] = rawBullets
      .map((b) => ({ text: toSentence(b) }))
      .filter((b) => b.text)
      .slice(0, changelogConfig.MAX_BULLETS_PER_GROUP);
    if (!bullets.length && label) {
      bullets.push({ text: toSentence(label) });
    }
    const tagName = release.tag_name ?? undefined;
    const prevRelease = validReleases[i + 1];
    const prevTagName = prevRelease?.tag_name ?? undefined;
    if (date && bullets.length) {
      releaseData.push({ date, label, bullets, tagName, prevTagName });
    }
  }
  const statsPromises = releaseData.map((data) =>
    data.tagName && data.prevTagName
      ? fetchReleaseStats(data.tagName, data.prevTagName, baseUrl, githubToken, timeoutMs)
      : Promise.resolve(null)
  );
  const statsResults = await Promise.all(statsPromises);
  return sortByDateDesc(
    releaseData.map((data, i) => ({
      date: data.date,
      label: data.label || undefined,
      bullets: data.bullets,
      stats: statsResults[i] ?? undefined,
    }))
  );
};
type ProcessedCommit = {
  sha: string;
  date: string;
  bullet: string;
};
type CommitBullet = {
  sha: string;
  text: string;
};
type GroupedCommitItem = {
  date: string;
  bullets: CommitBullet[];
};
const sortByDateDesc = <T extends { date: string }>(items: T[]): T[] => {
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
};
const toProcessedCommit = (commit: GitHubCommitListItem): ProcessedCommit | null => {
  const bullet = normalizeCommitMessage(commit.commit?.message ?? '');
  if (!bullet) return null;
  const date = commit.commit?.author?.date || commit.commit?.committer?.date || '';
  const day = date.slice(0, 10);
  const sha = commit.sha;
  if (!day || !sha) return null;
  return { sha, date: day, bullet };
};
const fetchCommitCandidates = async (
  dayLimit: number,
  baseUrl: string,
  githubToken?: string,
  timeoutMs: number = changelogConfig.DEFAULT_GITHUB_TIMEOUT_MS
): Promise<ProcessedCommit[]> => {
  const processed: ProcessedCommit[] = [];
  const uniqueDays = new Set<string>();
  for (let page = 1; page <= changelogConfig.MAX_COMMIT_PAGES; page++) {
    if (uniqueDays.size > dayLimit) break;
    const commitUrl = `${baseUrl}/commits?per_page=${changelogConfig.COMMIT_PAGE_SIZE}&page=${page}`;
    const commits = await fetchGithub<GitHubCommitListItem[]>(commitUrl, githubToken, timeoutMs);
    if (!Array.isArray(commits) || !commits.length) break;
    for (const commit of commits) {
      const processedCommit = toProcessedCommit(commit);
      if (!processedCommit) continue;
      processed.push(processedCommit);
      uniqueDays.add(processedCommit.date);
      if (uniqueDays.size > dayLimit) break;
    }
    if (commits.length < changelogConfig.COMMIT_PAGE_SIZE) break;
  }
  return processed;
};
const buildCommitItems = async (
  commits: ProcessedCommit[],
  dayLimit: number,
  baseUrl: string,
  githubToken?: string,
  timeoutMs: number = changelogConfig.DEFAULT_GITHUB_TIMEOUT_MS
): Promise<ChangelogItem[]> => {
  const grouped = new Map<string, GroupedCommitItem>();
  for (const { sha, date, bullet } of commits) {
    let existing = grouped.get(date);
    if (!existing) {
      if (grouped.size >= dayLimit) break;
      existing = { date, bullets: [] };
      grouped.set(date, existing);
    }
    if (existing.bullets.length >= changelogConfig.MAX_BULLETS_PER_GROUP) continue;
    existing.bullets.push({ sha, text: bullet });
  }
  const groupedItems = sortByDateDesc(Array.from(grouped.values()));
  const statsToFetch = groupedItems.flatMap((item) => item.bullets);
  const statsMap = new Map<string, ChangelogStats>();
  const settledResults = await Promise.allSettled(
    statsToFetch.map(async ({ sha }) => {
      const stats = await fetchCommitStats(sha, baseUrl, githubToken, timeoutMs);
      return { sha, stats };
    })
  );
  for (const result of settledResults) {
    if (result.status === 'fulfilled' && result.value.stats) {
      statsMap.set(result.value.sha, result.value.stats);
    }
  }
  return groupedItems.map((item) => {
    let additions = 0;
    let deletions = 0;
    const bullets = item.bullets.map((bullet) => {
      const commitStats = statsMap.get(bullet.sha);
      if (commitStats) {
        additions += commitStats.additions;
        deletions += commitStats.deletions;
      }
      return {
        text: bullet.text,
        stats: commitStats,
      };
    });
    return {
      date: item.date,
      bullets,
      stats: additions || deletions ? { additions, deletions } : undefined,
    };
  });
};
export default defineEventHandler(async (event): Promise<ChangelogResponse> => {
  setResponseHeaders(event, { 'Cache-Control': 'public, max-age=300, s-maxage=300' });
  try {
    const runtimeConfig = useRuntimeConfig(event);
    const githubToken = runtimeConfig.githubToken;
    const { baseUrl, timeoutMs } = getGitHubConfig(runtimeConfig);
    const query = getQuery(event);
    const limit = clamp(
      parseNumber(query.limit, changelogConfig.DEFAULT_LIMIT),
      1,
      changelogConfig.MAX_LIMIT
    );
    const releaseLimit = clamp(parseNumber(query.releases, changelogConfig.RELEASE_LIMIT), 1, 10);
    const responseCacheKey = `${baseUrl}:limit=${limit}:releases=${releaseLimit}`;
    const localCachedResponse = getLocalResponseCacheEntry(responseCacheKey);
    if (localCachedResponse) {
      return localCachedResponse.response;
    }
    const sharedCachedResponse = await getSharedResponseCacheEntry(responseCacheKey);
    if (sharedCachedResponse) {
      setLocalResponseCacheEntry(responseCacheKey, sharedCachedResponse);
      return sharedCachedResponse.response;
    }
    const releaseUrl = `${baseUrl}/releases?per_page=${releaseLimit}`;
    const releases = await fetchGithub<GitHubRelease[]>(releaseUrl, githubToken, timeoutMs);
    const releaseFetchFailed = !Array.isArray(releases);
    const releaseItems = Array.isArray(releases)
      ? await buildReleaseItems(releases, releaseLimit, baseUrl, githubToken, timeoutMs)
      : [];
    const commitLimit = Math.max(limit - releaseItems.length, 0);
    const fetchLimit = commitLimit + 1;
    const commits =
      commitLimit > 0
        ? await fetchCommitCandidates(fetchLimit, baseUrl, githubToken, timeoutMs)
        : [];
    if (releaseFetchFailed && !releaseItems.length && !commits.length) {
      return { source: 'commits', items: [], hasMore: false, error: 'Failed to fetch changelog' };
    }
    const commitItems =
      commitLimit > 0
        ? await buildCommitItems(commits, fetchLimit, baseUrl, githubToken, timeoutMs)
        : [];
    const mergedItems = sortByDateDesc([...releaseItems, ...commitItems]);
    const hasMore = mergedItems.length > limit;
    const items = hasMore ? mergedItems.slice(0, limit) : mergedItems;
    const response: ChangelogResponse = {
      source: releaseItems.length ? 'releases' : 'commits',
      items,
      hasMore,
    };
    const entry = { response, timestamp: Date.now() };
    setLocalResponseCacheEntry(responseCacheKey, entry);
    await setSharedResponseCacheEntry(responseCacheKey, entry);
    return response;
  } catch (error) {
    logger.error('[Changelog] Failed to build changelog.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { source: 'commits', items: [], hasMore: false, error: 'Failed to fetch changelog' };
  }
});
