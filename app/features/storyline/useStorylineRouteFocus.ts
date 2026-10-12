import { getQueryString } from '@/utils/routeHelpers';
import type { Ref } from '#imports';
const FOCUS_CLASSES = ['ring-2', 'ring-primary-500', 'ring-offset-2', 'ring-offset-surface-950'];
const FOCUS_DURATION_MS = 2500;
const objectiveElement = (chapterId: string, objectiveId: string | undefined) => {
  if (!objectiveId) return null;
  const input = document.getElementById(`storyline-objective-${chapterId}-${objectiveId}`);
  return input?.closest('label') ?? input?.parentElement ?? null;
};
const focusTarget = (chapterId: string, objectiveId: string | undefined) =>
  objectiveElement(chapterId, objectiveId) ??
  document.getElementById(`storyline-chapter-${chapterId}`);
const highlight = (element: HTMLElement) => {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element.classList.add(...FOCUS_CLASSES);
  return setTimeout(() => element.classList.remove(...FOCUS_CLASSES), FOCUS_DURATION_MS);
};
/**
 * Deep links such as `/storyline?chapter=tour&objective=<id>` (used by locked trader cards)
 * scroll to and briefly highlight the objective, then drop the query.
 */
export function useStorylineRouteFocus(chapterCount: Ref<number>) {
  const route = useRoute();
  const router = useRouter();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const clearFocus = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  };
  const focusFromRoute = async () => {
    const chapterId = getQueryString(route.query.chapter);
    if (!import.meta.client || !chapterId || chapterCount.value === 0) return;
    await nextTick();
    const target = focusTarget(chapterId, getQueryString(route.query.objective));
    if (!target) return;
    clearFocus();
    timeout = highlight(target);
    const nextQuery = { ...route.query };
    delete nextQuery.chapter;
    delete nextQuery.objective;
    router.replace({ hash: route.hash, path: route.path, query: nextQuery });
  };
  watch([() => route.query.chapter, chapterCount], focusFromRoute, { immediate: true });
  onBeforeUnmount(clearFocus);
}
