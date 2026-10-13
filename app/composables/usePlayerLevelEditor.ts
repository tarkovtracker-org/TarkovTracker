import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
export type PlayerLevelError = 'required' | 'whole_number' | 'out_of_range';
export type PlayerLevelParseResult =
  { ok: true; level: number } | { ok: false; error: PlayerLevelError };
type PlayerLevelBounds = { min: number; max: number };
const WHOLE_NUMBER_PATTERN = /^-?\d+$/;
const isWithinBounds = (level: number, { min, max }: PlayerLevelBounds): boolean =>
  level >= min && level <= max;
/**
 * Validates a typed level against the supported range without clamping, so editors can explain
 * why a value was rejected instead of silently saving a different one.
 */
export function parsePlayerLevel(
  raw: string | number | null | undefined,
  bounds: PlayerLevelBounds
): PlayerLevelParseResult {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'required' };
  if (!WHOLE_NUMBER_PATTERN.test(text)) return { ok: false, error: 'whole_number' };
  const level = Number(text);
  return isWithinBounds(level, bounds) ? { ok: true, level } : { ok: false, error: 'out_of_range' };
}
interface PlayerLevelEditorOptions {
  /** Called after the active mode or saved level changes and the draft is reset to match it. */
  onDraftReset?: () => void;
}
/** Supported level range; the metadata getters fall back to the default range while absent. */
function usePlayerLevelBounds() {
  const metadataStore = useMetadataStore();
  const minLevel = computed<number>(() => metadataStore.minPlayerLevel);
  const maxLevel = computed<number>(() => metadataStore.maxPlayerLevel);
  const bounds = computed<PlayerLevelBounds>(() => ({ min: minLevel.value, max: maxLevel.value }));
  const hasLevelMetadata = computed<boolean>(() => metadataStore.playerLevels.length > 0);
  return { bounds, hasLevelMetadata, maxLevel, minLevel };
}
/** Text draft that accepts the number or empty string a native number input hands v-model. */
function useLevelDraft(initial: number) {
  const draftText = ref<string>(String(initial));
  const draft = computed<string, string | number | null | undefined>({
    get: () => draftText.value,
    set: (value) => {
      draftText.value = String(value ?? '');
    },
  });
  return { draft, draftText };
}
/**
 * Shared draft, validation, and save path for every player-level editor. Each caller owns its
 * draft; all of them read and write the active mode's saved level through `tarkovStore.setLevel`.
 */
export function usePlayerLevelEditor(options: PlayerLevelEditorOptions = {}) {
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const { bounds, hasLevelMetadata, maxLevel, minLevel } = usePlayerLevelBounds();
  const savedLevel = computed<number>(() => tarkovStore.playerLevel());
  const { draft, draftText } = useLevelDraft(savedLevel.value);
  const parsed = computed(() => parsePlayerLevel(draft.value, bounds.value));
  const errorMessage = computed<string | undefined>(() => {
    const result = parsed.value;
    if (result.ok) return undefined;
    return t(`settings.player_level.errors.${result.error}`, bounds.value);
  });
  const canApply = computed<boolean>(
    () => parsed.value.ok && parsed.value.level !== savedLevel.value
  );
  function resetDraft(): void {
    draftText.value = String(savedLevel.value);
  }
  // Synchronous so a mode switch or hydration can never leave a draft aimed at the previous mode.
  watch(
    [() => tarkovStore.getCurrentGameMode(), savedLevel],
    () => {
      resetDraft();
      options.onDraftReset?.();
    },
    { flush: 'sync' }
  );
  /** Saves a valid draft to the active mode. Returns false when the draft is invalid. */
  function applyDraft(): boolean {
    const result = parsed.value;
    if (!result.ok) return false;
    if (result.level !== savedLevel.value) tarkovStore.setLevel(result.level);
    return true;
  }
  /** Moves the saved level by one step, staying inside the supported range. */
  function stepLevel(delta: 1 | -1): void {
    const next = savedLevel.value + delta;
    if (isWithinBounds(next, bounds.value)) tarkovStore.setLevel(next);
  }
  return {
    applyDraft,
    canApply,
    draft,
    errorMessage,
    hasLevelMetadata,
    maxLevel,
    minLevel,
    resetDraft,
    savedLevel,
    stepLevel,
  };
}
