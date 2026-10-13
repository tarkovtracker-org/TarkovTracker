import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
describe('tutorial completion store boundary', () => {
  it('retained lookup functions follow mode, catalog and recorded progress changes', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const metadata = useMetadataStore();
    metadata.storyChaptersGameMode = 'pvp';
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
        },
      },
    ];
    const lookup = store.isStoryObjectiveComplete;
    expect(lookup('tour', 'escape')).toBe(true);
    store.currentGameMode = 'pve';
    expect(lookup('tour', 'escape')).toBe(false);
    expect(store.getEffectiveStoryProgress()).toEqual({});
    metadata.storyChaptersGameMode = 'pve';
    expect(lookup('tour', 'escape')).toBe(true);
    metadata.storyChaptersGameMode = 'pvp';
    store.currentGameMode = 'pvp';
    metadata.storyChapters = [];
    expect(lookup('tour', 'escape')).toBe(false);
    store.pvp.storyChapters = { tour: { objectives: { escape: { complete: true } } } };
    expect(lookup('tour', 'escape')).toBe(true);
    store.currentGameMode = 'pve';
    expect(lookup('tour', 'escape')).toBe(false);
    store.setStoryObjectiveComplete('tour', 'escape');
    expect(lookup('tour', 'escape')).toBe(true);
    store.setStoryObjectiveUncomplete('tour', 'escape');
    expect(lookup('tour', 'escape')).toBe(false);
  });
  it('looks up a single objective without projecting unrelated chapter progress', () => {
    setActivePinia(createPinia());
    const metadata = useMetadataStore();
    metadata.storyChaptersGameMode = 'pvp';
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
        },
      },
      {
        id: 'unrelated',
        name: 'Other',
        normalizedName: 'other',
        wikiLink: '',
        order: 2,
        get objectives(): never {
          throw new Error('Unrelated chapter must not be projected for one lookup');
        },
      },
    ];
    const store = useTarkovStore();
    expect(store.isStoryObjectiveComplete('tour', 'escape')).toBe(true);
    expect(store.isStoryObjectiveComplete('tour', 'missing')).toBe(false);
  });
  it.each(['pvp', 'pve', 'seasonal'] as const)(
    'projects %s reads and rejects baseline edits without changing stored marks/history',
    (mode) => {
      setActivePinia(createPinia());
      const store = useTarkovStore();
      const metadata = useMetadataStore();
      metadata.storyChaptersGameMode = mode;
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
