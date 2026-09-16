import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import type { StoryChapter } from '@/types/tarkov';
const CURRENT_ID = '68e2ecfeb88d405a420774f8';
const TICKET_CHAPTER: StoryChapter = {
  id: 'the-ticket',
  name: 'The Ticket',
  normalizedName: 'the-ticket',
  order: 9,
  wikiLink: 'https://example.com/the-ticket',
  objectives: {
    [CURRENT_ID]: {
      description: 'Obtain the "Ticket"',
      id: CURRENT_ID,
      order: 1,
      type: 'main',
    },
  },
};
const storedTicketProgress = () => ({
  'the-ticket': {
    objectives: {
      'the-ticket-main-10': { complete: true, timestamp: 1000 },
      'the-ticket-opt-9': { complete: true, timestamp: 1000 },
    },
  },
});
describe('useTarkovStore story objective id migration', () => {
  it('reconciles only the mode the loaded catalog belongs to', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const metadataStore = useMetadataStore();
    metadataStore.storyChapters = [TICKET_CHAPTER];
    metadataStore.currentGameMode = 'pvp';
    store.pvp.storyChapters = storedTicketProgress();
    store.pve.storyChapters = storedTicketProgress();
    store.seasonal.storyChapters = storedTicketProgress();
    expect(store.migrateStoryObjectiveIds()).toEqual({ migrated: 1, dropped: 1 });
    expect(store.pvp.storyChapters['the-ticket']?.objectives).toEqual({
      [CURRENT_ID]: { complete: true, timestamp: 1000 },
    });
    expect(store.pve.storyChapters).toEqual(storedTicketProgress());
    expect(store.seasonal.storyChapters).toEqual(storedTicketProgress());
  });
  it('reconciles another mode once that catalog is the loaded one', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const metadataStore = useMetadataStore();
    metadataStore.storyChapters = [TICKET_CHAPTER];
    metadataStore.currentGameMode = 'pve';
    store.pve.storyChapters = storedTicketProgress();
    expect(store.migrateStoryObjectiveIds()).toEqual({ migrated: 1, dropped: 1 });
    expect(store.pve.storyChapters['the-ticket']?.objectives).toEqual({
      [CURRENT_ID]: { complete: true, timestamp: 1000 },
    });
  });
  it('reconciles a mode a realtime merge changed, using the loaded catalog as evidence', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const metadataStore = useMetadataStore();
    metadataStore.storyChapters = [TICKET_CHAPTER];
    metadataStore.currentGameMode = 'pvp';
    store.pve.storyChapters = storedTicketProgress();
    expect(store.migrateStoryObjectiveIds('pve')).toEqual({ migrated: 1, dropped: 1 });
    expect(store.pve.storyChapters['the-ticket']?.objectives).toEqual({
      [CURRENT_ID]: { complete: true, timestamp: 1000 },
    });
  });
  it('leaves another mode alone while the loaded chapter still publishes curated ids', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const metadataStore = useMetadataStore();
    metadataStore.currentGameMode = 'pvp';
    metadataStore.storyChapters = [
      {
        ...TICKET_CHAPTER,
        objectives: {
          'the-ticket-main-10': {
            description: 'Retrieve the Ticket document from the case',
            id: 'the-ticket-main-10',
            order: 1,
            type: 'main',
          },
        },
      },
    ];
    store.pve.storyChapters = storedTicketProgress();
    expect(store.migrateStoryObjectiveIds('pve')).toEqual({ migrated: 0, dropped: 0 });
    expect(store.pve.storyChapters).toEqual(storedTicketProgress());
  });
  it('is a no-op without a chapter catalog', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const metadataStore = useMetadataStore();
    metadataStore.storyChapters = [];
    metadataStore.currentGameMode = 'pvp';
    store.pvp.storyChapters = storedTicketProgress();
    expect(store.migrateStoryObjectiveIds()).toEqual({ migrated: 0, dropped: 0 });
    expect(store.pvp.storyChapters).toEqual(storedTicketProgress());
  });
  it('is a no-op while the catalog still publishes curated ids', () => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    const metadataStore = useMetadataStore();
    metadataStore.currentGameMode = 'pvp';
    metadataStore.storyChapters = [
      {
        ...TICKET_CHAPTER,
        objectives: {
          'the-ticket-main-10': {
            description: 'Retrieve the Ticket document from the case',
            id: 'the-ticket-main-10',
            order: 1,
            type: 'main',
          },
        },
      },
    ];
    store.pvp.storyChapters = storedTicketProgress();
    expect(store.migrateStoryObjectiveIds()).toEqual({ migrated: 0, dropped: 0 });
    expect(store.pvp.storyChapters).toEqual(storedTicketProgress());
  });
});
