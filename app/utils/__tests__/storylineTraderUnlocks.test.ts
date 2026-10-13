import { describe, expect, it } from 'vitest';
import { isStorylineTraderUnlocked, storylineTraderUnlocks } from '@/utils/storylineTraderUnlocks';
import type { StoryObjective, StoryObjectiveUnlock } from '@/types/tarkov';
import type { TraderUnlockChapter } from '@/utils/storylineTraderUnlocks';
const objective = (
  id: string,
  unlocks: StoryObjectiveUnlock[],
  completionPolicy?: 'tutorial'
): StoryObjective => ({
  id,
  order: 1,
  type: 'main',
  description: `Objective ${id}`,
  unlocks,
  completionPolicy,
});
const traderUnlock = (id: string): StoryObjectiveUnlock => ({ type: 'trader', id, name: id });
const tour = (objectives: StoryObjective[]): TraderUnlockChapter => ({
  id: 'tour',
  name: 'Tour',
  objectives: Object.fromEntries(objectives.map((entry) => [entry.id, entry])),
});
describe('storyline trader unlock catalog', () => {
  const traders = ['prapor', 'skier', 'mechanic', 'peacekeeper', 'therapist', 'ragman'];
  it.each(traders)('uses the explicit objective for %s independently of tasks', (trader) => {
    const gate = storylineTraderUnlocks([
      tour(traders.map((id) => objective(`open-${id}`, [traderUnlock(id)]))),
    ]).get(trader)!;
    expect(gate.objective.id).toBe(`open-${trader}`);
    expect(isStorylineTraderUnlocked(gate, false)).toBe(false);
    expect(isStorylineTraderUnlocked(gate, true)).toBe(true);
  });
  it('supports one objective unlocking multiple tutorial traders', () => {
    const gates = storylineTraderUnlocks([
      tour([objective('escape', [traderUnlock('therapist'), traderUnlock('ragman')], 'tutorial')]),
    ]);
    expect([...gates.keys()]).toEqual(['therapist', 'ragman']);
    for (const gate of gates.values()) expect(isStorylineTraderUnlocked(gate, false)).toBe(true);
  });
  it('resolves missing IDs only through unique explicit chapter references', () => {
    const chapter = {
      ...tour([objective('open', [{ type: 'trader', name: ' Prapor ' }])]),
      traderUnlocks: [{ id: 'prapor', name: 'Prapor' }],
    };
    expect(storylineTraderUnlocks([chapter]).get('prapor')?.objective.id).toBe('open');
    expect(storylineTraderUnlocks([{ ...chapter, traderUnlocks: [] }]).size).toBe(0);
    expect(
      storylineTraderUnlocks([
        { ...chapter, traderUnlocks: [...chapter.traderUnlocks, { id: 'other', name: 'Prapor' }] },
      ]).size
    ).toBe(0);
  });
  it('prefers an explicit ID over a conflicting display name', () => {
    const chapter = {
      ...tour([objective('open', [{ type: 'trader', id: 'prapor', name: 'Different' }])]),
      traderUnlocks: [{ id: 'other', name: 'Different' }],
    };
    expect([...storylineTraderUnlocks([chapter]).keys()]).toEqual(['prapor']);
  });
  it('does not infer gates from chapter summaries, objective wording or non-trader unlocks', () => {
    const chapter = {
      ...tour([objective('Talk to Prapor', [{ type: 'quest', id: 'prapor', name: 'Prapor' }])]),
      traderUnlocks: [{ id: 'prapor', name: 'Prapor' }],
    };
    expect(storylineTraderUnlocks([chapter]).size).toBe(0);
  });
  it('does not collapse distinct ID pairs containing delimiters', () => {
    const first = { ...tour([objective('third', [traderUnlock('prapor')])]), id: 'first:second' };
    const second = { ...tour([objective('second:third', [traderUnlock('prapor')])]), id: 'first' };
    expect(storylineTraderUnlocks([first, second]).has('prapor')).toBe(false);
  });
  it('deduplicates a placement but does not invent semantics for multiple objective placements', () => {
    const chapter = tour([objective('open', [traderUnlock('prapor'), traderUnlock('prapor')])]);
    expect(storylineTraderUnlocks([chapter]).size).toBe(1);
    expect(
      storylineTraderUnlocks([chapter, tour([objective('another', [traderUnlock('prapor')])])]).size
    ).toBe(0);
    expect(storylineTraderUnlocks([chapter, { ...chapter, id: 'other-chapter' }]).size).toBe(0);
  });
});
