<template>
  <UContainer class="px-4 py-6 sm:px-6">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-10">
      <PageHeader
        :title="t('common.credits')"
        :description="`${t('page.credits.notes.alphabetical')} ${t('page.credits.notes.contributors')}`"
      />
      <div class="grid items-start gap-6 md:grid-cols-2">
        <section
          v-for="section in staticCreditSections"
          :key="section.key"
          :class="sectionClasses(section)"
        >
          <h2 class="text-primary-300/80 text-xs font-semibold tracking-widest uppercase">
            {{ t(`page.credits.sections.${section.key}`) }}
          </h2>
          <CreditMemberList
            :members="section.members"
            :variant="section.compact ? 'grid' : 'row'"
            class="mt-4"
          />
        </section>
        <ClientOnly>
          <ContributorsList />
        </ClientOnly>
      </div>
      <p class="text-center">
        <NuxtLink to="/about" :class="teamLinkClasses">
          <UIcon name="i-mdi-account-group-outline" aria-hidden="true" class="h-4 w-4" />
          {{ t('page.credits.team_link') }}
        </NuxtLink>
      </p>
    </div>
  </UContainer>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import ContributorsList from '@/features/credits/ContributorsList.vue';
  import CreditMemberList from '@/features/credits/CreditMemberList.vue';
  import { staticCreditSections, type CreditSection } from '@/features/credits/creditSections';
  const { t } = useI18n({ useScope: 'global' });
  const teamLinkClasses =
    'text-info-400 hover:text-info-300 focus-visible:ring-primary-500 inline-flex min-h-11 items-center gap-1.5 rounded text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none';
  const SECTION_CLASSES = 'bg-surface-900/80 rounded-lg border border-white/10 p-5 sm:p-6';
  const sectionClasses = (section: CreditSection) => [
    SECTION_CLASSES,
    section.fullWidth ? 'md:col-span-2' : '',
  ];
</script>
