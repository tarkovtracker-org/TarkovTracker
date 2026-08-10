import type { CreditMember } from '@/features/credits/types';
import type { ContributorApiItem, ContributorsResponse } from '@/types/contributors';
const mapContributorToMember = (item: ContributorApiItem): CreditMember => ({
  avatar: item.avatar,
  contributions: item.contributions,
  link: item.url,
  name: item.login,
});
export const useContributors = () => {
  const runtimeConfig = useRuntimeConfig();
  const cacheVersion =
    import.meta.env.VITE_CONTRIBUTORS_CACHE_VERSION?.trim() ||
    String(runtimeConfig.public.appVersion ?? '').trim() ||
    '0.0.0-dev';
  const request = useFetch<ContributorsResponse>(`/api/contributors?v=${cacheVersion}`, {
    key: `credits-contributors-${cacheVersion}`,
    default: () => ({ items: [] }),
    server: false,
  });
  const contributors = computed<CreditMember[]>(() =>
    (request.data.value?.items ?? []).map(mapContributorToMember)
  );
  const showError = computed(
    () => Boolean(request.error.value) || Boolean(request.data.value?.error)
  );
  return { contributors, pending: request.pending, refresh: request.refresh, showError };
};
