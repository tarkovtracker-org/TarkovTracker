<template>
  <UContainer class="px-4 py-10 sm:px-6 sm:py-14">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-10">
      <header class="border-surface-700/60 mx-auto w-full max-w-2xl border-b pb-8 text-center">
        <h1 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {{ t('page.about.title') }}
        </h1>
        <p class="text-surface-400 mt-3 text-sm leading-relaxed">
          {{ t('page.about.intro') }}
        </p>
      </header>
      <section
        v-if="coreMembers.length || supportMembers.length"
        id="team"
        aria-labelledby="about-team-heading"
      >
        <h2 id="about-team-heading" class="text-xl font-semibold text-white">
          {{ t('page.about.team.heading') }}
        </h2>
        <p class="text-surface-400 mt-2 max-w-2xl text-sm leading-relaxed">
          {{ t('page.about.team.summary') }}
        </p>
        <div class="mt-6 flex flex-col gap-8">
          <AboutMembersGroup
            v-if="coreMembers.length"
            label-key="page.about.team.core_heading"
            :members="coreMembers"
          />
          <AboutMembersGroup
            v-if="supportMembers.length"
            label-key="page.about.team.support_heading"
            :members="supportMembers"
          />
        </div>
      </section>
      <section v-if="partnerMembers.length" id="partners" aria-labelledby="about-partners-heading">
        <h2 id="about-partners-heading" class="text-xl font-semibold text-white">
          {{ t('page.about.partners.heading') }}
        </h2>
        <p class="text-surface-400 mt-2 max-w-2xl text-sm leading-relaxed">
          {{ t('page.about.partners.summary') }}
        </p>
        <ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AboutMemberCard v-for="member in partnerMembers" :key="member.id" :member="member" />
        </ul>
      </section>
      <section id="help" aria-labelledby="about-help-heading">
        <h2 id="about-help-heading" class="text-xl font-semibold text-white">
          {{ t('page.about.help.heading') }}
        </h2>
        <p class="text-surface-400 mt-2 max-w-2xl text-sm leading-relaxed">
          {{ t('page.about.help.routing') }}
        </p>
        <AboutHelpLinks class="mt-4" />
      </section>
    </div>
  </UContainer>
</template>
<script setup lang="ts">
  import AboutHelpLinks from '@/features/about/AboutHelpLinks.vue';
  import AboutMemberCard from '@/features/about/AboutMemberCard.vue';
  import AboutMembersGroup from '@/features/about/AboutMembersGroup.vue';
  import { membersByGroup } from '@/features/about/teamMembers';
  import { resolveCanonicalSiteUrl } from '@/utils/runtimeConfig';
  const { t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
  const siteUrl = resolveCanonicalSiteUrl(runtimeConfig.public.appUrl);
  const coreMembers = computed(() => membersByGroup('core'));
  const supportMembers = computed(() => membersByGroup('support'));
  const partnerMembers = computed(() => membersByGroup('partner'));
  const seoTitle = computed(() => t('page.about.title'));
  const seoDescription = computed(() => t('page.about.description'));
  useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    twitterTitle: seoTitle,
    twitterDescription: seoDescription,
  });
  const organizationJsonLd = computed(() => ({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'TarkovTracker',
    url: siteUrl,
    logo: `${siteUrl}/img/logos/tarkovtrackerlogo-light.webp`,
    sameAs: ['https://github.com/tarkovtracker-org/TarkovTracker'],
    member: [...coreMembers.value, ...supportMembers.value].map((member) => ({
      '@type': 'Person',
      name: member.displayName,
    })),
  }));
  useHead(() => ({
    script: [
      {
        key: 'about-organization-jsonld',
        type: 'application/ld+json',
        innerHTML: JSON.stringify(organizationJsonLd.value),
      },
    ],
  }));
</script>
