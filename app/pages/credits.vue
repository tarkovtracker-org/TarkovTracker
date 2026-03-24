<template>
  <UContainer class="px-4 py-8">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header class="text-center">
        <h1 class="sr-only">{{ t('page.credits.title') }}</h1>
        <p class="text-xs text-white/55">
          {{ t('page.credits.notes.alphabetical') }}
        </p>
        <p class="text-xs text-white/45">
          {{ t('page.credits.notes.contributors') }}
        </p>
      </header>
      <div class="grid gap-6 md:grid-cols-2">
        <section
          v-for="section in staticCreditSections"
          :key="section.key"
          :class="[
            'bg-surface-900/80 rounded-2xl border border-white/10 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.35)]',
            section.fullWidth ? 'md:col-span-2' : '',
          ]"
        >
          <div class="mb-4">
            <p class="text-primary-300/80 text-xs font-semibold tracking-[0.3em] uppercase">
              {{ section.pretitle }}
            </p>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              {{ t(`page.credits.sections.${section.key}`) }}
            </h2>
          </div>
          <ul class="space-y-3">
            <li
              v-for="member in section.members"
              :key="member.name"
              class="rounded-xl bg-white/5 px-4 py-3 text-lg font-medium text-white"
            >
              <component
                :is="member.link ? 'a' : 'div'"
                v-bind="
                  member.link
                    ? { href: member.link, target: '_blank', rel: 'noopener noreferrer' }
                    : {}
                "
                class="flex items-center gap-3"
                :class="{ 'hover:text-primary-200 transition-colors': member.link }"
              >
                <NuxtImg
                  v-if="member.avatar"
                  :src="member.avatar"
                  :alt="member.name"
                  class="h-12 w-12 rounded-full border border-white/20 object-cover"
                  width="48"
                  height="48"
                  loading="lazy"
                />
                <span>{{ member.name }}</span>
              </component>
            </li>
          </ul>
        </section>
        <section
          class="bg-surface-900/80 rounded-2xl border border-white/10 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.35)] md:col-span-2"
        >
          <div class="mb-4">
            <p class="text-primary-300/80 text-xs font-semibold tracking-[0.3em] uppercase">
              {{ t('page.credits.labels.contributors') }}
            </p>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              {{ t('page.credits.sections.contributors') }}
            </h2>
          </div>
          <div v-if="contributorsPending" class="text-surface-300 flex items-center gap-2 text-sm">
            <UIcon name="i-mdi-loading" class="h-4 w-4 animate-spin" />
            <span>{{ t('page.credits.contributors.loading') }}</span>
          </div>
          <div v-else-if="showContributorsError" class="space-y-3">
            <p class="text-error-300 text-sm">
              {{ t('page.credits.contributors.error') }}
            </p>
            <UButton size="sm" color="neutral" variant="soft" @click="() => refreshContributors()">
              {{ t('page.credits.contributors.retry') }}
            </UButton>
          </div>
          <p v-else-if="!contributors.length" class="text-surface-300 text-sm">
            {{ t('page.credits.contributors.empty') }}
          </p>
          <ul v-else class="space-y-3">
            <li
              v-for="contributor in contributors"
              :key="contributor.name"
              class="rounded-xl bg-white/5 px-4 py-3 text-lg font-medium text-white"
            >
              <component
                :is="contributor.link ? 'a' : 'div'"
                :href="contributor.link || undefined"
                :target="contributor.link ? '_blank' : undefined"
                :rel="contributor.link ? 'noopener noreferrer' : undefined"
                class="flex items-center gap-3"
                :class="{ 'hover:text-primary-200 transition-colors': contributor.link }"
              >
                <NuxtImg
                  v-if="contributor.avatar"
                  :src="contributor.avatar"
                  :alt="contributor.name"
                  class="h-12 w-12 rounded-full border border-white/20 object-cover"
                  width="48"
                  height="48"
                  loading="lazy"
                />
                <span>{{ contributor.name }}</span>
                <span class="text-surface-400 ml-auto text-xs font-semibold">
                  {{
                    t('page.credits.contributors.contributions', {
                      count: contributor.contributions,
                    })
                  }}
                </span>
              </component>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </UContainer>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { ContributorApiItem, ContributorsResponse } from '@/types/contributors';
  const { t } = useI18n({ useScope: 'global' });
  useSeoMeta({
    title: computed(() => t('page.credits.title')),
  });
  interface CreditMember {
    contributions?: number;
    name: string;
    avatar?: string;
    link?: string;
  }
  interface CreditSection {
    key: string;
    pretitle: string;
    members: CreditMember[];
    fullWidth?: boolean;
  }
  const githubAvatar = (username: string) => `https://github.com/${username}.png?size=120`;
  const githubProfile = (username: string) => `https://github.com/${username}`;
  const runtimeConfig = useRuntimeConfig();
  const CONTRIBUTORS_CACHE_VERSION =
    import.meta.env.VITE_CONTRIBUTORS_CACHE_VERSION?.trim() ||
    String(runtimeConfig.public.appVersion ?? '').trim() ||
    '0.0.0-dev';
  const sortMembers = (members: CreditMember[]) =>
    [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const {
    data: contributorsData,
    error: contributorsError,
    pending: contributorsPending,
    refresh: refreshContributors,
  } = useFetch<ContributorsResponse>(`/api/contributors?v=${CONTRIBUTORS_CACHE_VERSION}`, {
    key: `credits-contributors-${CONTRIBUTORS_CACHE_VERSION}`,
    default: () => ({ items: [] }),
    server: false,
  });
  const showContributorsError = computed(() => {
    return Boolean(contributorsError.value) || Boolean(contributorsData.value?.error);
  });
  const mapContributorToMember = (item: ContributorApiItem): CreditMember => ({
    avatar: item.avatar,
    contributions: item.contributions,
    link: item.url,
    name: item.login,
  });
  const contributors = computed<CreditMember[]>(() => {
    const items = contributorsData.value?.items ?? [];
    return items.map(mapContributorToMember);
  });
  const staticCreditSections = computed<CreditSection[]>(() => [
    {
      key: 'original_creator',
      pretitle: t('page.credits.labels.creators'),
      members: sortMembers([
        {
          name: 'Thaddeus',
          avatar: githubAvatar('thaddeus'),
          link: githubProfile('thaddeus'),
        },
      ]),
    },
    {
      key: 'staff',
      pretitle: t('page.credits.labels.staff'),
      members: sortMembers([
        { name: 'DysektAI', avatar: githubAvatar('dysektai'), link: githubProfile('dysektai') },
        { name: 'Niv', avatar: githubAvatar('nivmizz7'), link: githubProfile('nivmizz7') },
        { name: 'Chica999', avatar: githubAvatar('chica999'), link: githubProfile('chica999') },
      ]),
    },
    {
      key: 'support_members',
      pretitle: t('page.credits.labels.support'),
      members: sortMembers([
        {
          name: 'Adealia',
          avatar: githubAvatar('adealia'),
          link: githubProfile('adealia'),
        },
        {
          name: 'Dio',
        },
        {
          name: 'MrBreachie',
        },
      ]),
      fullWidth: true,
    },
    {
      key: 'beta_testers',
      pretitle: t('page.credits.labels.testers'),
      members: sortMembers([
        { name: 'Adealia', avatar: githubAvatar('adealia'), link: githubProfile('adealia') },
        { name: 'Dio' },
        { name: 'GanjaManNL' },
        { name: 'Giribaldi_TTV' },
        { name: 'LS4Tonio' },
        { name: 'Medivha' },
        { name: 'MrBreachie' },
        { name: 'mike' },
        { name: 'RuiApostolo' },
      ]),
      fullWidth: true,
    },
  ]);
</script>
