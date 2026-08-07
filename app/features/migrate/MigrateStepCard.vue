<template>
  <li
    class="bg-surface-900/60 flex flex-col items-start gap-4 rounded-2xl border border-white/10 p-6"
  >
    <span
      class="bg-primary-500/20 text-primary-300 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-semibold"
    >
      {{ step.number }}
    </span>
    <div class="min-w-0 flex-1 space-y-2.5">
      <div>
        <h3 class="text-surface-100 text-base font-semibold sm:text-lg">
          {{ t(step.titleKey) }}
        </h3>
        <p class="text-surface-300 mt-1 text-sm leading-relaxed sm:text-base">
          {{ t(step.descriptionKey) }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <UButton
          v-if="step.ctaKey"
          size="sm"
          :color="buttonColor"
          :variant="buttonVariant"
          :icon="step.icon"
          :to="step.to"
          :href="step.href"
          :target="buttonTarget"
          :rel="buttonRel"
          trailing-icon="i-mdi-arrow-right"
        >
          {{ t(step.ctaKey) }}
        </UButton>
        <UButton
          v-if="step.secondaryCtaKey"
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-mdi-book-open-variant"
          :to="step.secondaryTo"
        >
          {{ t(step.secondaryCtaKey) }}
        </UButton>
      </div>
    </div>
  </li>
</template>
<script setup lang="ts">
  interface MigrateStep {
    number: number;
    titleKey: string;
    descriptionKey: string;
    ctaKey: string;
    icon: string;
    to?: string;
    href?: string;
    external?: boolean;
    primary?: boolean;
    secondaryCtaKey?: string;
    secondaryTo?: string;
  }
  const props = defineProps<{ step: MigrateStep }>();
  const { t } = useI18n({ useScope: 'global' });
  const buttonColor = computed(() => (props.step.primary ? 'primary' : 'neutral'));
  const buttonVariant = computed(() => (props.step.primary ? 'solid' : 'soft'));
  const buttonTarget = computed(() => (props.step.external ? '_blank' : undefined));
  const buttonRel = computed(() => (props.step.external ? 'noopener noreferrer' : undefined));
</script>
