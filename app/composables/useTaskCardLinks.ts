import { useCopyToClipboard, writeToClipboard } from '@/composables/useCopyToClipboard';
import { useWikiLink } from '@/composables/useWikiLink';
import { openExternalUrl } from '@/utils/redirect';
import type { Task } from '@/types/tarkov';
interface UseTaskCardLinksOptions {
  task: () => Task;
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
  setSelectedItem: (item: SelectedTaskItem | null) => void;
  openItemOnTarkovDev: () => void;
  openItemOnWiki: () => void;
}
export function useTaskCardLinks(options: UseTaskCardLinksOptions): UseTaskCardLinksReturn {
  const { task } = options;
  const router = useRouter();
  const { toWikiUrl } = useWikiLink();
  const { copyToClipboard } = useCopyToClipboard();
  const selectedItem = ref<SelectedTaskItem | null>(null);
  const tarkovDevTaskUrl = computed(() => `https://tarkov.dev/task/${task().id}`);
  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    return writeToClipboard(text);
  };
  const copyTaskLink = async (): Promise<boolean> => {
    const href = router.resolve(`/tasks?task=${task().id}`).href;
    return copyToClipboard(`${window.location.origin}${href}`, { revealValue: false });
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
    setSelectedItem,
    openItemOnTarkovDev,
    openItemOnWiki,
  };
}
