# Kappa Projection Algorithm Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Kappa Timeline estimate realistic by adding critical path flooring, dampened pace, and span-aware confidence.

**Architecture:** All logic lives in `app/features/profile/ProfileProgression.vue`. We extract pure helper functions for the critical path and confidence calculations so they can be unit-tested independently. The `kappaProjection` computed is then updated to call these helpers.

**Tech Stack:** Vue 3, TypeScript, Vitest

---

### Task 1: Extract pure projection helpers into a testable utility

**Files:**

- Create: `app/features/profile/kappaProjectionHelpers.ts`
- Test: `app/features/profile/__tests__/kappaProjectionHelpers.test.ts`

This task creates the pure functions that Task 2's tests will validate. We scaffold them with stub implementations first, then fill in real logic in Task 3+.

**Step 1: Create `kappaProjectionHelpers.ts` with type and function signatures**

```typescript
import type { Task } from '@/types/tarkov';

export interface CriticalPathResult {
  floor: number;
  longestChainTaskId: string | null;
}

export const computeCriticalPathFloor = (
  remainingKappaTasks: Task[],
  allTasksById: Map<string, Task>,
  completedTaskIds: Set<string>,
  playerLevel: number
): CriticalPathResult => {
  return { floor: 0, longestChainTaskId: null };
};

export const computeConfidence = (
  sampleCount: number,
  sampleDays: number
): 'high' | 'low' | 'medium' | null => {
  if (sampleCount < 3) return null;
  return 'low';
};

export const dampenPace = (rawPacePerDay: number, sampleDays: number): number => {
  return rawPacePerDay;
};
```

**Step 2: Create the test file with all test cases (they will fail)**

```typescript
import { describe, it, expect } from 'vitest';
import type { Task } from '@/types/tarkov';
import { computeCriticalPathFloor, computeConfidence, dampenPace } from '../kappaProjectionHelpers';

const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  kappaRequired: true,
  ...overrides,
});

describe('kappaProjectionHelpers', () => {
  describe('computeConfidence', () => {
    it('returns null when sampleCount < 3', () => {
      expect(computeConfidence(2, 10)).toBeNull();
    });
    it('returns low when count >= 3 but days < 3', () => {
      expect(computeConfidence(37, 1)).toBe('low');
    });
    it('returns low when count >= 7 but days < 3', () => {
      expect(computeConfidence(10, 2)).toBe('low');
    });
    it('returns medium when count >= 7 and days >= 3', () => {
      expect(computeConfidence(7, 3)).toBe('medium');
    });
    it('returns medium when count >= 7 and days >= 3 but count < 15', () => {
      expect(computeConfidence(14, 5)).toBe('medium');
    });
    it('returns medium when count >= 15 but days < 7', () => {
      expect(computeConfidence(20, 5)).toBe('medium');
    });
    it('returns high when count >= 15 and days >= 7', () => {
      expect(computeConfidence(15, 7)).toBe('high');
    });
    it('returns high with large values', () => {
      expect(computeConfidence(100, 30)).toBe('high');
    });
    it('returns low when count is 3 and days is 1', () => {
      expect(computeConfidence(3, 1)).toBe('low');
    });
  });

  describe('dampenPace', () => {
    it('returns raw pace when sampleDays >= 3', () => {
      expect(dampenPace(5, 3)).toBe(5);
      expect(dampenPace(10, 10)).toBe(10);
    });
    it('dampens to 1/3 for 1-day sample', () => {
      expect(dampenPace(30, 1)).toBeCloseTo(10, 5);
    });
    it('dampens to 2/3 for 2-day sample', () => {
      expect(dampenPace(30, 2)).toBeCloseTo(20, 5);
    });
    it('returns 0 when raw pace is 0', () => {
      expect(dampenPace(0, 1)).toBe(0);
    });
  });

  describe('computeCriticalPathFloor', () => {
    it('returns 0 when no remaining kappa tasks', () => {
      const result = computeCriticalPathFloor([], new Map(), new Set(), 50);
      expect(result.floor).toBe(0);
    });

    it('returns 1 for a single task with no predecessors', () => {
      const task = makeTask('a');
      const allTasks = new Map([['a', task]]);
      const result = computeCriticalPathFloor([task], allTasks, new Set(), 50);
      expect(result.floor).toBe(1);
    });

    it('counts chain of incomplete predecessors', () => {
      const a = makeTask('a');
      const b = makeTask('b', { predecessors: ['a'] });
      const c = makeTask('c', { predecessors: ['b'] });
      const allTasks = new Map([
        ['a', a],
        ['b', b],
        ['c', c],
      ]);
      const result = computeCriticalPathFloor([a, b, c], allTasks, new Set(), 50);
      // c depends on b depends on a: chain depth = 3
      expect(result.floor).toBe(3);
      expect(result.longestChainTaskId).toBe('c');
    });

    it('does not count completed predecessors in chain', () => {
      const a = makeTask('a');
      const b = makeTask('b', { predecessors: ['a'] });
      const c = makeTask('c', { predecessors: ['b'] });
      const allTasks = new Map([
        ['a', a],
        ['b', b],
        ['c', c],
      ]);
      // a is completed, b and c remain
      const completed = new Set(['a']);
      const result = computeCriticalPathFloor([b, c], allTasks, completed, 50);
      // c depends on b (incomplete): chain = 2
      expect(result.floor).toBe(2);
      expect(result.longestChainTaskId).toBe('c');
    });

    it('adds level gap penalty', () => {
      const task = makeTask('a', { minPlayerLevel: 40 });
      const allTasks = new Map([['a', task]]);
      // Player is level 20, gap = 20, so floor = 1 (task itself) + 20 (level gap)
      const result = computeCriticalPathFloor([task], allTasks, new Set(), 20);
      expect(result.floor).toBe(21);
    });

    it('does not add level gap when player meets requirement', () => {
      const task = makeTask('a', { minPlayerLevel: 15 });
      const allTasks = new Map([['a', task]]);
      const result = computeCriticalPathFloor([task], allTasks, new Set(), 20);
      expect(result.floor).toBe(1);
    });

    it('picks the longest chain across multiple branches', () => {
      // Branch 1: a -> b (length 2)
      // Branch 2: c -> d -> e (length 3)
      const a = makeTask('a');
      const b = makeTask('b', { predecessors: ['a'] });
      const c = makeTask('c');
      const d = makeTask('d', { predecessors: ['c'] });
      const e = makeTask('e', { predecessors: ['d'] });
      const allTasks = new Map([
        ['a', a],
        ['b', b],
        ['c', c],
        ['d', d],
        ['e', e],
      ]);
      const result = computeCriticalPathFloor([a, b, c, d, e], allTasks, new Set(), 50);
      expect(result.floor).toBe(3);
      expect(result.longestChainTaskId).toBe('e');
    });

    it('handles non-kappa predecessors in chain', () => {
      // prereq is NOT kappa but still incomplete — it blocks the kappa task
      const prereq = makeTask('prereq', { kappaRequired: false });
      const kappaTask = makeTask('kt', { predecessors: ['prereq'] });
      const allTasks = new Map([
        ['prereq', prereq],
        ['kt', kappaTask],
      ]);
      const result = computeCriticalPathFloor([kappaTask], allTasks, new Set(), 50);
      // prereq is incomplete and blocks kt: chain = 2
      expect(result.floor).toBe(2);
    });

    it('level gap applies to deepest task and adds to chain', () => {
      const a = makeTask('a');
      const b = makeTask('b', { predecessors: ['a'], minPlayerLevel: 45 });
      const allTasks = new Map([
        ['a', a],
        ['b', b],
      ]);
      // chain depth of b = 2 (a + b), level gap = 45 - 10 = 35
      // floor = max across tasks: b has depth 2 + levelGap 35 = 37
      const result = computeCriticalPathFloor([a, b], allTasks, new Set(), 10);
      expect(result.floor).toBe(37);
    });
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run app/features/profile/__tests__/kappaProjectionHelpers.test.ts`
Expected: Multiple failures (stubs return wrong values)

**Step 4: Commit**

```bash
git add app/features/profile/kappaProjectionHelpers.ts app/features/profile/__tests__/kappaProjectionHelpers.test.ts
git commit -m "test: add failing tests for kappa projection helpers"
```

---

### Task 2: Implement `computeConfidence` and `dampenPace`

**Files:**

- Modify: `app/features/profile/kappaProjectionHelpers.ts:19-31` (the two stub functions)

**Step 1: Implement `computeConfidence`**

Replace the stub with:

```typescript
export const computeConfidence = (
  sampleCount: number,
  sampleDays: number
): 'high' | 'low' | 'medium' | null => {
  if (sampleCount < 3) return null;
  if (sampleCount >= 15 && sampleDays >= 7) return 'high';
  if (sampleCount >= 7 && sampleDays >= 3) return 'medium';
  return 'low';
};
```

**Step 2: Implement `dampenPace`**

Replace the stub with:

```typescript
const DAMPEN_THRESHOLD_DAYS = 3;

export const dampenPace = (rawPacePerDay: number, sampleDays: number): number => {
  if (sampleDays >= DAMPEN_THRESHOLD_DAYS) return rawPacePerDay;
  return rawPacePerDay * (sampleDays / DAMPEN_THRESHOLD_DAYS);
};
```

**Step 3: Run the confidence and dampenPace tests**

Run: `npx vitest run app/features/profile/__tests__/kappaProjectionHelpers.test.ts`
Expected: `computeConfidence` and `dampenPace` suites PASS; `computeCriticalPathFloor` still fails

**Step 4: Commit**

```bash
git add app/features/profile/kappaProjectionHelpers.ts
git commit -m "feat: implement confidence rating and pace dampening helpers"
```

---

### Task 3: Implement `computeCriticalPathFloor`

**Files:**

- Modify: `app/features/profile/kappaProjectionHelpers.ts:8-17` (the stub function)

**Step 1: Implement the critical path calculation**

Replace the stub with:

```typescript
export const computeCriticalPathFloor = (
  remainingKappaTasks: Task[],
  allTasksById: Map<string, Task>,
  completedTaskIds: Set<string>,
  playerLevel: number
): CriticalPathResult => {
  if (remainingKappaTasks.length === 0) {
    return { floor: 0, longestChainTaskId: null };
  }
  const memo = new Map<string, number>();
  const getChainDepth = (taskId: string): number => {
    if (completedTaskIds.has(taskId)) return 0;
    const cached = memo.get(taskId);
    if (cached !== undefined) return cached;
    const task = allTasksById.get(taskId);
    if (!task) {
      memo.set(taskId, 1);
      return 1;
    }
    let maxPredecessorDepth = 0;
    for (const predId of task.predecessors ?? []) {
      maxPredecessorDepth = Math.max(maxPredecessorDepth, getChainDepth(predId));
    }
    const depth = maxPredecessorDepth + 1;
    memo.set(taskId, depth);
    return depth;
  };
  let maxFloor = 0;
  let longestChainTaskId: string | null = null;
  for (const task of remainingKappaTasks) {
    const chainDepth = getChainDepth(task.id);
    let levelGap = 0;
    if (task.minPlayerLevel && task.minPlayerLevel > playerLevel) {
      levelGap = task.minPlayerLevel - playerLevel;
    }
    const taskFloor = chainDepth + levelGap;
    if (taskFloor > maxFloor) {
      maxFloor = taskFloor;
      longestChainTaskId = task.id;
    }
  }
  return { floor: maxFloor, longestChainTaskId };
};
```

**Step 2: Run all tests**

Run: `npx vitest run app/features/profile/__tests__/kappaProjectionHelpers.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add app/features/profile/kappaProjectionHelpers.ts
git commit -m "feat: implement critical path floor calculation for kappa tasks"
```

---

### Task 4: Wire helpers into `kappaProjection` computed

**Files:**

- Modify: `app/features/profile/ProfileProgression.vue:1169-1276` (the `kappaProjection` computed and `kappaConfidence*` computeds)

**Step 1: Add import at the top of the `<script setup>` block**

After the existing imports (around line 382), add:

```typescript
import {
  computeConfidence,
  computeCriticalPathFloor,
  dampenPace,
} from '@/features/profile/kappaProjectionHelpers';
```

**Step 2: Add `allTasksById` computed (place it near `relevantTasks`, around line 839)**

After the `relevantTasks` computed:

```typescript
const allTasksById = computed(() => {
  const lookup = new Map<string, Task>();
  for (const task of metadataStore.tasks ?? []) {
    if (task?.id) {
      lookup.set(task.id, task);
    }
  }
  return lookup;
});
```

**Step 3: Add `completedTaskIdSet` computed (place near `completedKappaTasks`, around line 981)**

```typescript
const completedTaskIdSet = computed(() => {
  const ids = new Set<string>();
  for (const task of relevantTasks.value) {
    if (isTaskSuccessful(task.id)) {
      ids.add(task.id);
    }
  }
  return ids;
});
```

**Step 4: Rewrite the `kappaProjection` computed (lines 1169–1276)**

Replace the projection section (starting from `const pacePerDay` through the final return) with the new logic. The completed/unknown early returns stay the same. Replace lines 1216-1276 (the pacePerDay calculation through the final projected return):

```typescript
const rawPacePerDay = sampleCount / sampleDays;
if (!Number.isFinite(rawPacePerDay) || rawPacePerDay <= 0) {
  return {
    confidence: null,
    daysRemaining: null,
    detail: t(
      'page.profile.kappa_pace_unavailable',
      'Not enough pace data to estimate completion.'
    ),
    etaTimestamp: null,
    headline: t('page.profile.kappa_insufficient', 'Kappa ETA needs more history'),
    state: 'unknown',
  };
}
const pacePerDay = dampenPace(rawPacePerDay, sampleDays);
const paceBasedDays = Math.max(1, Math.ceil(remaining / pacePerDay));
const remainingKappaTasks = relevantTasks.value.filter(
  (task) => task.kappaRequired === true && !isTaskSuccessful(task.id)
);
const { floor: criticalPathFloor } = computeCriticalPathFloor(
  remainingKappaTasks,
  allTasksById.value,
  completedTaskIdSet.value,
  profileLevel.value
);
const floorActive = criticalPathFloor > paceBasedDays;
const daysRemaining = Math.max(paceBasedDays, criticalPathFloor);
const etaTimestamp = Date.now() + daysRemaining * DAY_MS;
const confidence = computeConfidence(sampleCount, sampleDays);
let detail = t(
  'page.profile.kappa_projected_detail',
  `Based on ${formatNumber(sampleCount)} timestamped completions across ${formatNumber(sampleDays)} days.`
);
if (floorActive) {
  detail +=
    ' ' +
    t(
      'page.profile.kappa_floor_note',
      `Estimate raised to account for ${formatNumber(criticalPathFloor)} sequential prerequisites and level gates.`
    );
}
return {
  confidence,
  daysRemaining,
  detail,
  etaTimestamp,
  headline: t(
    'page.profile.kappa_projected_headline',
    `Estimated Kappa in about ${formatNumber(daysRemaining)} days.`
  ),
  state: 'projected',
};
```

**Step 5: Run the full test suite to make sure nothing is broken**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add app/features/profile/ProfileProgression.vue
git commit -m "feat: wire critical path floor, dampening, and confidence into kappa projection"
```

---

### Task 5: Manual smoke test and final cleanup

**Step 1: Run `npm run format` to ensure lint/prettier compliance**

Run: `npm run format`

**Step 2: Run `npm run build` to verify no type errors**

Run: `npm run build`

**Step 3: Verify dev server loads the profile page**

Run: `npm run dev` and check `/profile` in browser — confirm the Kappa Timeline card renders with updated logic.

**Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "chore: format kappa projection changes"
```
