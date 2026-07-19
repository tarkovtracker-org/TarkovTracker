import { writeToClipboard } from '@/composables/useCopyToClipboard';
import { useWikiLink } from '@/composables/useWikiLink';
import { useTarkovStore } from '@/stores/useTarkov';
import { openExternalUrl } from '@/utils/redirect';
import type { Task, TaskObjective } from '@/types/tarkov';
interface UseTaskCardLinksOptions {
  task: () => Task;
  objectives: () => TaskObjective[];
}
type SelectedTaskItem = {
  id: string;
  name?: string;
  wikiLink?: string;
};
interface UseTaskCardLinksReturn {
  selectedItem: Ref<SelectedTaskItem | null>;
  tarkovDevTaskUrl: ComputedRef<string>;
  copyTextToClipboard: (text: string) => Promise<boolean>;
  copyTaskLink: () => Promise<boolean>;
  openTaskWiki: () => void;
  openTaskOnTarkovDev: () => void;
  getTaskDataIssueUrl: () => string;
  openTaskDataIssue: () => void;
  setSelectedItem: (item: SelectedTaskItem | null) => void;
  openItemOnTarkovDev: () => void;
  openItemOnWiki: () => void;
}
export function useTaskCardLinks(options: UseTaskCardLinksOptions): UseTaskCardLinksReturn {
  const { task, objectives } = options;
  const router = useRouter();
  const tarkovStore = useTarkovStore();
  const { toWikiUrl } = useWikiLink();
  const selectedItem = ref<SelectedTaskItem | null>(null);
  const tarkovDevTaskUrl = computed(() => `https://tarkov.dev/task/${task().id}`);
  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    return writeToClipboard(text);
  };
  const copyTaskLink = async (): Promise<boolean> => {
    const href = router.resolve(`/tasks?task=${task().id}`).href;
    return copyTextToClipboard(`${window.location.origin}${href}`);
  };
  const openTaskWiki = () => {
    const wikiLink = toWikiUrl(task().wikiLink);
    if (wikiLink) {
      openExternalUrl(wikiLink);
    }
  };
  const openTaskOnTarkovDev = () => {
    openExternalUrl(tarkovDevTaskUrl.value);
  };
  const getTaskDataIssueUrl = (): string => {
    const currentTask = task();
    const taskObjectives = objectives();
    const title = `${currentTask.name} (${currentTask.id})`;
    const objectiveIds = taskObjectives.map((objective) => objective.id).filter(Boolean);
    const minLevel = currentTask.minPlayerLevel ?? 0;
    const playerLevel = tarkovStore.playerLevel();
    const gameMode = tarkovStore.getCurrentGameMode().toUpperCase();
    const descriptionLines = [
      `Task Name: ${currentTask.name}`,
      `Task ID: ${currentTask.id}`,
      objectiveIds.length ? `Objective IDs: ${objectiveIds.join(', ')}` : '',
      minLevel > 0 ? `Task Req Level: ${minLevel}` : '',
      `Dev Link: https://tarkov.dev/task/${currentTask.id}`,
      playerLevel > 0 ? `\nUSER LEVEL: ${playerLevel}` : '',
      `USER MODE: ${gameMode}`,
    ].filter(Boolean);
    const description = `>--Describe issue here--<\n\n\n${descriptionLines.join('\n')}`;
    const params = new URLSearchParams({
      title,
      category: 'Overlay - Quests',
      description,
    });
    if (currentTask.wikiLink) {
      params.set('reference', currentTask.wikiLink);
    }
    return `https://trackerbot.nivmizz7.dev/data?${params.toString()}`;
  };
  const openTaskDataIssue = () => {
    openExternalUrl(getTaskDataIssueUrl());
  };
  const setSelectedItem = (item: SelectedTaskItem | null) => {
    selectedItem.value = item;
  };
  const openItemOnTarkovDev = () => {
    if (!selectedItem.value) return;
    openExternalUrl(`https://tarkov.dev/item/${selectedItem.value.id}`);
  };
  const openItemOnWiki = () => {
    if (!selectedItem.value) return;
    if (selectedItem.value.wikiLink) {
      const wikiLink = toWikiUrl(selectedItem.value.wikiLink);
      if (wikiLink) {
        openExternalUrl(wikiLink);
      }
      return;
    }
    const fallbackQuery = selectedItem.value.name?.trim() || selectedItem.value.id;
    const fallbackUrl = toWikiUrl(
      `https://escapefromtarkov.fandom.com/wiki/Special:Search?query=${encodeURIComponent(fallbackQuery)}`
    );
    if (fallbackUrl) {
      openExternalUrl(fallbackUrl);
    }
  };
  return {
    selectedItem,
    tarkovDevTaskUrl,
    copyTextToClipboard,
    copyTaskLink,
    openTaskWiki,
    openTaskOnTarkovDev,
    getTaskDataIssueUrl,
    openTaskDataIssue,
    setSelectedItem,
    openItemOnTarkovDev,
    openItemOnWiki,
  };
}
