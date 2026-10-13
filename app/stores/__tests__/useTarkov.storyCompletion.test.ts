import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
describe('tutorial completion store boundary', () => {
  it.each(['pvp', 'pve', 'seasonal'] as const)(
    'projects %s reads and rejects baseline edits without changing stored marks/history',
    (mode) => {
      setActivePinia(createPinia());
      const store = useTarkovStore();
      const metadata = useMetadataStore();
      metadata.storyChapters = [
        {
          id: 'tour',
          name: 'Tour',
          normalizedName: 'tour',
          wikiLink: '',
          order: 1,
          objectives: {
            escape: {
              id: 'escape',
              order: 1,
              type: 'main',
              description: 'Escape',
              completionPolicy: 'tutorial',
            },
            therapist: { id: 'therapist', order: 2, type: 'main', description: 'Talk' },
          },
        },
      ];
      store.currentGameMode = mode;
      store[mode].storyChapters = {
        tour: { objectives: { escape: { complete: false, timestamp: 9 } } },
      };
      const before = JSON.stringify(store.$state);
      expect(store.isStoryObjectiveComplete('tour', 'escape')).toBe(true);
      expect(store.getEffectiveStoryProgress().tour?.objectives?.escape).toEqual({
        complete: true,
      });
      expect(store.isStoryChapterComplete('tour')).toBe(false);
      expect(store.isStoryObjectiveComplete('tour', 'therapist')).toBe(false);
      store.setStoryObjectiveComplete('tour', 'escape');
      store.setStoryObjectiveUncomplete('tour', 'escape');
      store.toggleStoryObjectiveComplete('tour', 'escape');
      expect(JSON.stringify(store.$state)).toBe(before);
      store.setStoryObjectiveComplete('tour', 'therapist');
      expect(store.isStoryObjectiveComplete('tour', 'therapist')).toBe(true);
      metadata.storyChapters = [];
      expect(store.isStoryObjectiveComplete('tour', 'escape')).toBe(false);
      expect(store[mode].storyChapters.tour?.objectives?.escape).toEqual({
        complete: false,
        timestamp: 9,
      });
    }
  );
});
