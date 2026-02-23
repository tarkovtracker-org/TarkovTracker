import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameMode } from '@/utils/constants';
import type { TarkovDevImportResult } from '@/utils/tarkovDevProfileParser';
const mockParseTarkovDevProfile = vi.fn();
const mockSetTotalSkillLevel = vi.fn();
const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};
const tarkovStore = {
  getCurrentGameMode: vi.fn<() => GameMode>(() => 'pvp'),
  setDisplayName: vi.fn(),
  setGameEdition: vi.fn(),
  setLevel: vi.fn(),
  setPMCFaction: vi.fn(),
  setPrestigeLevel: vi.fn(),
  setTarkovDevProfile: vi.fn(),
  setTarkovUid: vi.fn(),
  switchGameMode: vi.fn(),
};
const metadataStore = {
  playerLevels: [
    { exp: 0, level: 1 },
    { exp: 1000, level: 5 },
    { exp: 2500, level: 12 },
  ],
};
const preferencesStore = {
  setUseAutomaticLevelCalculation: vi.fn(),
};
vi.mock('@/composables/useSkillCalculation', () => ({
  useSkillCalculation: () => ({
    setTotalSkillLevel: mockSetTotalSkillLevel,
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataStore,
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => preferencesStore,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => tarkovStore,
}));
vi.mock('@/utils/logger', () => ({
  logger: mockLogger,
}));
vi.mock('@/utils/tarkovDevProfileParser', () => ({
  parseTarkovDevProfile: mockParseTarkovDevProfile,
}));
const createImportData = (
  overrides: Partial<TarkovDevImportResult> = {}
): TarkovDevImportResult => ({
  displayName: 'TestPlayer',
  gameEditionGuess: 4,
  pmcFaction: 'USEC',
  prestigeLevel: 2,
  rawProfile: {
    achievements: {},
    importedAt: 1,
    mastering: [],
    pmcStats: null,
    profileUpdatedAt: 2,
    scavStats: null,
  },
  skills: {
    Endurance: 10,
    Strength: 15,
  },
  tarkovUid: 1234567,
  totalXP: 3000,
  ...overrides,
});
const createFile = (text: string): File =>
  ({
    text: vi.fn().mockResolvedValue(text),
  }) as unknown as File;
const loadComposable = async () => {
  const module = await import('@/composables/useTarkovDevImport');
  return module.useTarkovDevImport();
};
describe('useTarkovDevImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    metadataStore.playerLevels = [
      { exp: 0, level: 1 },
      { exp: 1000, level: 5 },
      { exp: 2500, level: 12 },
    ];
  });
  it('sets preview state when file parses successfully', async () => {
    const parsedData = createImportData();
    mockParseTarkovDevProfile.mockReturnValue({
      data: parsedData,
      ok: true,
    });
    const composable = await loadComposable();
    await composable.parseFile(createFile('{"aid":123}'));
    expect(mockParseTarkovDevProfile).toHaveBeenCalledWith({ aid: 123 });
    expect(composable.importState.value).toBe('preview');
    expect(composable.previewData.value).toEqual(parsedData);
    expect(composable.importError.value).toBeNull();
  });
  it('sets error state when parser returns validation error', async () => {
    mockParseTarkovDevProfile.mockReturnValue({
      error: 'Invalid tarkov.dev profile format',
      ok: false,
    });
    const composable = await loadComposable();
    await composable.parseFile(createFile('{"foo":"bar"}'));
    expect(composable.importState.value).toBe('error');
    expect(composable.previewData.value).toBeNull();
    expect(composable.importError.value).toBe('Invalid tarkov.dev profile format');
  });
  it('sets error state when JSON parsing throws', async () => {
    const composable = await loadComposable();
    await composable.parseFile(createFile('{invalid-json'));
    expect(composable.importState.value).toBe('error');
    expect(composable.importError.value).toBe('Failed to read or parse JSON file');
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[TarkovDevImport] Parse error:',
      expect.any(Error)
    );
  });
  it('applies imported profile data and restores the original mode', async () => {
    const parsedData = createImportData({
      gameEditionGuess: 5,
      totalXP: 2600,
    });
    mockParseTarkovDevProfile.mockReturnValue({
      data: parsedData,
      ok: true,
    });
    tarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    const composable = await loadComposable();
    await composable.parseFile(createFile('{"aid":123}'));
    await composable.confirmImport('pve', 6);
    expect(tarkovStore.setTarkovUid).toHaveBeenCalledWith(parsedData.tarkovUid);
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(1, 'pve');
    expect(tarkovStore.setPMCFaction).toHaveBeenCalledWith(parsedData.pmcFaction);
    expect(tarkovStore.setDisplayName).toHaveBeenCalledWith(parsedData.displayName);
    expect(tarkovStore.setPrestigeLevel).toHaveBeenCalledWith(parsedData.prestigeLevel);
    expect(preferencesStore.setUseAutomaticLevelCalculation).toHaveBeenCalledWith(false);
    expect(tarkovStore.setLevel).toHaveBeenCalledWith(12);
    expect(mockSetTotalSkillLevel).toHaveBeenCalledWith('Endurance', 10);
    expect(mockSetTotalSkillLevel).toHaveBeenCalledWith('Strength', 15);
    expect(tarkovStore.setGameEdition).toHaveBeenCalledWith(6);
    expect(tarkovStore.setTarkovDevProfile).toHaveBeenCalledWith(parsedData.rawProfile);
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(2, 'pvp');
    expect(composable.importState.value).toBe('success');
    expect(composable.importError.value).toBeNull();
  });
  it('uses guessed edition when no override is provided', async () => {
    const parsedData = createImportData({ gameEditionGuess: 4 });
    mockParseTarkovDevProfile.mockReturnValue({
      data: parsedData,
      ok: true,
    });
    const composable = await loadComposable();
    await composable.parseFile(createFile('{"aid":123}'));
    await composable.confirmImport('pvp');
    expect(tarkovStore.setGameEdition).toHaveBeenCalledWith(4);
  });
  it('sets error state when applying import data throws', async () => {
    const parsedData = createImportData();
    mockParseTarkovDevProfile.mockReturnValue({
      data: parsedData,
      ok: true,
    });
    tarkovStore.setDisplayName.mockImplementationOnce(() => {
      throw new Error('write failure');
    });
    const composable = await loadComposable();
    await composable.parseFile(createFile('{"aid":123}'));
    await composable.confirmImport('pvp');
    expect(composable.importState.value).toBe('error');
    expect(composable.importError.value).toBe('Failed to apply import data');
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[TarkovDevImport] Import error:',
      expect.any(Error)
    );
  });
  it('restores original mode when import fails after switching mode', async () => {
    const parsedData = createImportData();
    mockParseTarkovDevProfile.mockReturnValue({
      data: parsedData,
      ok: true,
    });
    tarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    tarkovStore.setDisplayName.mockImplementationOnce(() => {
      throw new Error('write failure');
    });
    const composable = await loadComposable();
    await composable.parseFile(createFile('{"aid":123}'));
    await composable.confirmImport('pve');
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(1, 'pve');
    expect(tarkovStore.switchGameMode).toHaveBeenNthCalledWith(2, 'pvp');
    expect(composable.importState.value).toBe('error');
    expect(composable.importError.value).toBe('Failed to apply import data');
  });
  it('keeps success state when mode restoration fails', async () => {
    const parsedData = createImportData();
    mockParseTarkovDevProfile.mockReturnValue({
      data: parsedData,
      ok: true,
    });
    tarkovStore.getCurrentGameMode.mockReturnValue('pvp');
    tarkovStore.switchGameMode
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('restore failure'));
    const composable = await loadComposable();
    await composable.parseFile(createFile('{"aid":123}'));
    await composable.confirmImport('pve');
    expect(composable.importState.value).toBe('success');
    expect(composable.importError.value).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[TarkovDevImport] Failed to restore original game mode:',
      expect.any(Error)
    );
  });
  it('resets preview and errors back to idle', async () => {
    mockParseTarkovDevProfile.mockReturnValue({
      error: 'Invalid tarkov.dev profile format',
      ok: false,
    });
    const composable = await loadComposable();
    await composable.parseFile(createFile('{"foo":"bar"}'));
    expect(composable.importState.value).toBe('error');
    composable.reset();
    expect(composable.importState.value).toBe('idle');
    expect(composable.previewData.value).toBeNull();
    expect(composable.importError.value).toBeNull();
  });
});
