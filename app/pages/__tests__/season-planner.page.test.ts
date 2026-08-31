// @vitest-environment nuxt
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import SeasonPlannerPage from '@/pages/season-planner.vue';
import { useSeasonPlannerStore } from '@/stores/useSeasonPlanner';
const { seoMetaMock } = vi.hoisted(() => ({
  seoMetaMock: vi.fn(),
}));
mockNuxtImport('useSeoMeta', () => seoMetaMock);
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, values?: string | Record<string, unknown>, choice?: number) => {
      if (key === 'page.season_planner.points_needed' && typeof values === 'object') {
        const points = values.points;
        return `Add ${points} more ${choice === 1 ? 'point' : 'points'} to make this plan valid.`;
      }
      return typeof values === 'string' ? values : key;
    },
  }),
}));
describe('season planner page', () => {
  const globalConfig = {
    stubs: {
      ModifierCard: {
        props: ['modifier', 'selected', 'disabled'],
        template:
          '<div data-testid="modifier-card" :data-selected="selected" :data-disabled="disabled" :data-id="modifier.id">{{ modifier.name }}</div>',
      },
      UButton: {
        template: '<button @click="$emit(\'click\')"><slot /></button>',
      },
      UAlert: {
        props: ['title', 'description'],
        template: '<div data-testid="u-alert" :data-title="title">{{ description }}</div>',
      },
      UIcon: true,
    },
  };
  it('renders title, description, and modifier cards', async () => {
    const wrapper = await mountSuspended(SeasonPlannerPage, {
      global: globalConfig,
    });
    expect(wrapper.text()).toContain('Season Planner');
    expect(wrapper.text()).toContain(
      'Plan your Kord Breach seasonal character modifiers and balance your point budget.'
    );
    const cards = wrapper.findAll('[data-testid="modifier-card"]');
    expect(cards.length).toBeGreaterThan(0);
  });
  it('calls store reset when reset button clicked', async () => {
    const wrapper = await mountSuspended(SeasonPlannerPage, {
      global: globalConfig,
    });
    const store = useSeasonPlannerStore();
    store.selectedModifiers = ['marathon_runner'];
    // Find button that contains reset text or is the button element
    const buttons = wrapper.findAll('button');
    const resetButton = buttons.find((b) => b.text().includes('Reset Plan'));
    expect(resetButton).toBeDefined();
    await resetButton!.trigger('click');
    expect(store.selectedModifiers).toEqual([]);
  });
  it('displays validation alert when points are negative', async () => {
    const wrapper = await mountSuspended(SeasonPlannerPage, {
      global: globalConfig,
    });
    const store = useSeasonPlannerStore();
    // Select a positive modifier that costs 3 points (reducing totalPoints to -3)
    store.selectedModifiers = ['marathon_runner'];
    expect(store.totalPoints).toBe(-3);
    expect(store.isValid).toBe(false);
    await wrapper.vm.$nextTick();
    const alert = wrapper.find('[data-testid="u-alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.attributes('data-title')).toBe('Invalid Point Total');
  });
  it('uses the singular point label when one point is needed', async () => {
    const wrapper = await mountSuspended(SeasonPlannerPage, {
      global: globalConfig,
    });
    const store = useSeasonPlannerStore();
    store.selectedModifiers = ['street_tax'];
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="u-alert"]').text()).toContain(
      'Add 1 more point to make this plan valid.'
    );
  });
  it('disables incompatible modifiers when their counterpart is selected', async () => {
    const wrapper = await mountSuspended(SeasonPlannerPage, {
      global: globalConfig,
    });
    const store = useSeasonPlannerStore();
    store.selectedModifiers = ['sturdy_bones'];
    await wrapper.vm.$nextTick();
    const osteoporosisCard = wrapper.find('[data-id="osteoporosis"]');
    expect(osteoporosisCard.attributes('data-disabled')).toBe('true');
  });
  it('displays conflict alert when incompatible modifiers are persisted', async () => {
    const wrapper = await mountSuspended(SeasonPlannerPage, {
      global: globalConfig,
    });
    const store = useSeasonPlannerStore();
    store.$patch({ selectedModifiers: ['sturdy_bones', 'osteoporosis'] });
    await wrapper.vm.$nextTick();
    const alert = wrapper.find('[data-testid="u-alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.attributes('data-title')).toBe('Modifier Conflict');
  });
  it('sets SEO metadata', async () => {
    await mountSuspended(SeasonPlannerPage, {
      global: globalConfig,
    });
    expect(seoMetaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.any(Function),
        description: expect.any(Function),
      })
    );
  });
});
