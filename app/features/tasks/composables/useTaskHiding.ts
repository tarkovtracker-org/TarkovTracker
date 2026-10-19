import { usePreferencesStore } from '@/stores/usePreferences';
import type { Task } from '@/types/tarkov';
/**
 * Hide / unhide a task in task lists. Only the `hiddenTaskIds` preference changes: progress,
 * unlocks and successors are never touched, so any hide can be undone without side effects.
 */
export function useTaskHiding(task: () => Pick<Task, 'id' | 'name'>) {
  const preferencesStore = usePreferencesStore();
  const toast = useToast();
  const { t } = useI18n({ useScope: 'global' });
  const isHidden = computed(() => preferencesStore.getHiddenTaskIds.includes(task().id));
  const toggleHidden = () => {
    const { id, name } = task();
    const hiding = !isHidden.value;
    preferencesStore.toggleHiddenTask(id);
    toast.add({
      title: t(
        hiding ? 'page.tasks.hidden_tasks.hidden_toast' : 'page.tasks.hidden_tasks.unhidden_toast',
        { name }
      ),
      icon: hiding ? 'i-mdi-eye-off-outline' : 'i-mdi-eye-outline',
      actions: [
        {
          label: t('page.tasks.questcard.undo'),
          color: 'neutral',
          variant: 'outline',
          onClick: () => {
            if (preferencesStore.getHiddenTaskIds.includes(id) === hiding) {
              preferencesStore.toggleHiddenTask(id);
            }
          },
        },
      ],
    });
  };
  return { isHidden, toggleHidden };
}
