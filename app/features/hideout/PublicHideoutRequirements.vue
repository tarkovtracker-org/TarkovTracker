<template>
  <details v-if="stations" class="mt-1 max-w-3xl text-sm">
    <summary
      class="text-surface-300 hover:text-surface-100 w-fit cursor-pointer py-2 underline underline-offset-2"
    >
      {{ t('page.hideout.public_requirements') }}
    </summary>
    <details v-for="station in stations" :key="station.anchor" class="border-surface-700 border-b">
      <summary :id="station.anchor" class="text-surface-200 cursor-pointer scroll-mt-16 py-3">
        <h2 class="inline font-semibold">{{ station.name }}</h2>
      </summary>
      <HideoutRequirementLevel
        v-for="level in station.levels"
        :key="level.level"
        :level="level"
        :station-name="station.name"
      />
    </details>
  </details>
</template>
<script setup lang="ts">
  import HideoutRequirementLevel from '@/features/hideout/HideoutRequirementLevel.vue';
  const { t } = useI18n({ useScope: 'global' });
  prerenderRoutes('/data/hideout-requirements-pvp.json');
  const { data: stations, error } = await useLazyFetch('/data/hideout-requirements-pvp.json');
  if (import.meta.prerender && error.value) throw createError(error.value);
  const route = useRoute();
  function revealLinkedRequirement() {
    if (!window.location.hash.startsWith('#requirements-')) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (!target) return;
    expandAncestors(target);
    target.scrollIntoView({ block: 'start' });
  }
  function expandAncestors(target: HTMLElement) {
    let details = target.closest('details');
    while (details) {
      details.open = true;
      details = details.parentElement?.closest('details') ?? null;
    }
  }
  watch([stations, () => route.hash], revealLinkedRequirement, { flush: 'post' });
  onMounted(() => {
    onNuxtReady(revealLinkedRequirement);
    window.addEventListener('hashchange', revealLinkedRequirement);
  });
  onUnmounted(() => window.removeEventListener('hashchange', revealLinkedRequirement));
</script>
