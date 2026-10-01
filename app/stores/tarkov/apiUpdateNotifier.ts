import { countApiTaskUpdates } from '@shared/utils/apiTaskUpdates';
import {
  normalizeApiTaskUpdates,
  normalizeApiUpdateMetaEntry,
} from '@/stores/tarkov/progressMerge';
import { GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { ToastTranslate, useToastI18n } from '@/composables/useToastI18n';
import type { ApiTaskUpdate, ApiUpdateMeta, UserProgressData } from '@/stores/progressState';
import type { useMetadataStore } from '@/stores/useMetadata';
const API_UPDATE_FRESHNESS_MS = 30000;
const lastApiUpdateIds: Record<GameMode, string | null> = {
  pvp: null,
  pve: null,
  seasonal: null,
};
const FALLBACK_TOAST_COPY: Record<string, string> = {
  'toast.api_updated.label.single': 'Task updated',
  'toast.api_updated.label.plural': 'Tasks updated',
  'toast.api_updated.state.active': 'active',
  'toast.api_updated.state.completed': 'completed',
  'toast.api_updated.state.failed': 'failed',
  'toast.api_updated.state.uncompleted': 'uncompleted',
  'toast.api_updated.description_fallback': 'Your progress was updated via API.',
};
const getToastTranslator = (): ToastTranslate => {
  try {
    const { $i18n } = useNuxtApp();
    if (typeof $i18n?.t === 'function') {
      return $i18n.t.bind($i18n) as ToastTranslate;
    }
  } catch (e) {
    logger.warn('[TarkovStore] Could not resolve i18n translator for API update toast:', e);
  }
  return (key: string, params?: Record<string, unknown>) => {
    if (key === 'toast.api_updated.more' && typeof params?.count === 'number') {
      return `, +${params.count} more`;
    }
    return FALLBACK_TOAST_COPY[key] ?? key;
  };
};
const formatApiUpdateDescription = (
  updates: ApiTaskUpdate[],
  total: number,
  metadataStore: ReturnType<typeof useMetadataStore>,
  translate: ToastTranslate
): string => {
  if (!updates.length) return translate('toast.api_updated.description_fallback');
  const previewLimit = 3;
  const label = translate(
    total === 1 ? 'toast.api_updated.label.single' : 'toast.api_updated.label.plural'
  );
  const formatted = updates.slice(0, previewLimit).map((update) => {
    const taskName = metadataStore.getTaskById(update.id)?.name ?? update.id;
    const state = translate(`toast.api_updated.state.${update.state}`);
    return `${taskName} -> ${state}`;
  });
  const remaining = total - formatted.length;
  const suffix = remaining > 0 ? translate('toast.api_updated.more', { count: remaining }) : '';
  return `${label}: ${formatted.join(', ')}${suffix}.`;
};
const getApiUpdateMeta = (data: UserProgressData | undefined): ApiUpdateMeta | null => {
  return normalizeApiUpdateMetaEntry(data?.lastApiUpdate);
};
export const maybeNotifyApiUpdate = (
  mode: GameMode,
  data: UserProgressData | undefined,
  metadataStore: ReturnType<typeof useMetadataStore>,
  updateTime: number,
  toastI18n: ReturnType<typeof useToastI18n>
): boolean => {
  const meta = getApiUpdateMeta(data);
  if (!meta || lastApiUpdateIds[mode] === meta.id) return false;
  if (Math.abs(updateTime - meta.at) > API_UPDATE_FRESHNESS_MS) return false;
  lastApiUpdateIds[mode] = meta.id;
  const translate = getToastTranslator();
  const description = formatApiUpdateDescription(
    normalizeApiTaskUpdates(meta.tasks),
    countApiTaskUpdates(meta),
    metadataStore,
    translate
  );
  toastI18n.showApiUpdated(description);
  return true;
};
export const runApiUpdateHandlers = (handlers: Array<() => boolean>): boolean => {
  let handled = false;
  for (const handler of handlers) {
    handled = handler() || handled;
  }
  return handled;
};
export const resetApiUpdateState = (): void => {
  for (const mode of GAME_MODE_VALUES) lastApiUpdateIds[mode] = null;
};
