// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import ContributorsList from '@/features/credits/ContributorsList.vue';
const contributors = ref<{ name: string }[]>([]);
const pending = ref(false);
const showError = ref(false);
const refresh = vi.fn();
vi.mock('@/features/credits/useContributors', () => ({
  useContributors: () => ({ contributors, pending, refresh, showError }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.count == null ? key : `${params.count} contributors`,
  }),
}));
const mountList = () =>
  mount(ContributorsList, {
    global: {
      stubs: {
        CreditMemberList: {
          props: ['members'],
          template:
            '<ol><li v-for="member in members" :key="member.name">{{ member.name }}</li></ol>',
        },
        UButton: {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
      },
    },
  });
describe('ContributorsList', () => {
  beforeEach(() => {
    contributors.value = [];
    pending.value = false;
    showError.value = false;
    refresh.mockReset();
  });
  it('renders loading, error, and retry states', async () => {
    pending.value = true;
    const wrapper = mountList();
    expect(wrapper.text()).toContain('page.credits.contributors.loading');
    pending.value = false;
    showError.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('page.credits.contributors.error');
    await wrapper.get('button').trigger('click');
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('renders empty and populated contributor states', async () => {
    const wrapper = mountList();
    expect(wrapper.text()).toContain('page.credits.contributors.empty');
    contributors.value = [{ name: 'One' }, { name: 'Two' }];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('2 contributors');
    expect(wrapper.findAll('li')).toHaveLength(2);
  });
});
