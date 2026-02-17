// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { ImportState } from '@/composables/useTarkovDevImport';
import type { TarkovDevImportResult } from '@/utils/tarkovDevProfileParser';
const mockImportState = ref<ImportState>('idle');
const mockPreviewData = ref<TarkovDevImportResult | null>(null);
const mockImportError = ref<string | null>(null);
const mockParseFile = vi.fn();
const mockConfirmImport = vi.fn();
const mockReset = vi.fn();
const mockGetCurrentGameMode = vi.fn(() => 'pvp');
const mockGetTarkovUid = vi.fn(() => null);
vi.mock('@/composables/useTarkovDevImport', () => ({
  useTarkovDevImport: () => ({
    confirmImport: mockConfirmImport,
    importError: mockImportError,
    importState: mockImportState,
    parseFile: mockParseFile,
    previewData: mockPreviewData,
    reset: mockReset,
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    editions: [
      { title: 'Edge of Darkness', value: 4 },
      { title: 'Unheard', value: 6 },
    ],
    playerLevels: [
      { exp: 0, level: 1 },
      { exp: 1000, level: 5 },
    ],
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: mockGetCurrentGameMode,
    getTarkovUid: mockGetTarkovUid,
  }),
}));
vi.mock('virtual:public?/img/tarkov-dev-save-profile.png', () => ({
  default: '/img/tarkov-dev-save-profile.png',
}));
vi.mock('virtual:public?%2Fimg%2Ftarkov-dev-save-profile.png', () => ({
  default: '/img/tarkov-dev-save-profile.png',
}));
const createWrapper = async () => {
  const { default: TarkovDevImportCard } =
    await import('@/features/settings/TarkovDevImportCard.vue');
  return mount(TarkovDevImportCard, {
    global: {
      stubs: {
        GameModeToggle: true,
        GenericCard: { template: '<div><slot name="content" /></div>' },
        NuxtLink: { template: '<a><slot /></a>' },
        UAlert: {
          props: ['description', 'title'],
          template: '<div><span>{{ title }}</span><span>{{ description }}</span></div>',
        },
        UButton: {
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
        UIcon: true,
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
};
const createPreview = (): TarkovDevImportResult => ({
  displayName: 'Tester',
  gameEditionGuess: 4,
  pmcFaction: 'USEC',
  prestigeLevel: 1,
  rawProfile: {
    achievements: {},
    importedAt: 1,
    mastering: [],
    pmcStats: null,
    profileUpdatedAt: 2,
    scavStats: null,
  },
  skills: {
    Endurance: 3,
  },
  tarkovUid: 123,
  totalXP: 1000,
});
describe('TarkovDevImportCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportState.value = 'idle';
    mockPreviewData.value = null;
    mockImportError.value = null;
    mockGetCurrentGameMode.mockReturnValue('pvp');
    mockGetTarkovUid.mockReturnValue(null);
  });
  it('announces success messages via polite status region', async () => {
    mockImportState.value = 'success';
    const wrapper = await createWrapper();
    const region = wrapper.find('[role="status"]');
    expect(region.exists()).toBe(true);
    expect(region.attributes('aria-live')).toBe('polite');
    expect(region.text()).toContain('settings.tarkov_dev_import.success_title');
  });
  it('announces errors via assertive alert region', async () => {
    mockImportState.value = 'error';
    mockImportError.value = 'Bad file';
    const wrapper = await createWrapper();
    const region = wrapper.find('[role="alert"]');
    expect(region.exists()).toBe(true);
    expect(region.attributes('aria-live')).toBe('assertive');
    expect(region.text()).toContain('Bad file');
  });
  it('passes selected file to parseFile when upload input changes', async () => {
    const wrapper = await createWrapper();
    const input = wrapper.get('input[type="file"]');
    const file = new File(['{}'], 'profile.json', { type: 'application/json' });
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    });
    await input.trigger('change');
    expect(mockParseFile).toHaveBeenCalledWith(file);
  });
  it('confirms preview imports using the currently selected mode', async () => {
    mockImportState.value = 'preview';
    mockPreviewData.value = createPreview();
    const wrapper = await createWrapper();
    const confirmButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('settings.tarkov_dev_import.confirm'));
    expect(confirmButton).toBeDefined();
    if (!confirmButton) return;
    await confirmButton.trigger('click');
    expect(mockConfirmImport).toHaveBeenCalledWith('pvp');
  });
});
