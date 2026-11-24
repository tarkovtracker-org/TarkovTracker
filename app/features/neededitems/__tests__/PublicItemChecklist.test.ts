import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { expect, it } from 'vitest';
import { ref } from 'vue';
import PublicItemChecklist from '@/features/neededitems/PublicItemChecklist.vue';
mockNuxtImport('useLazyFetch', () => () => ({
  data: ref({
    tasks: ['USEC', 'BEAR'].map((faction) => ({
      id: faction,
      source: 'Quest',
      prestige: 2,
      faction,
      rows: [],
    })),
    hideout: [],
  }),
  error: ref(null),
}));
it('distinguishes same-name prestige quests by faction', async () => {
  const wrapper = await mountSuspended(PublicItemChecklist);
  expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual([
    'Quest · USEC · Prestige 2',
    'Quest · BEAR · Prestige 2',
  ]);
});
