# Storyline Chapter Objectives Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-chapter objectives (main + optional) and metadata to the overlay, then consume them in TarkovTracker for individual objective progress tracking.

**Architecture:** Extend the existing `StoryChapter` type in the overlay with `objectives`, `description`, `notes`, and `rewards` fields. Update the JSON schema to validate these fields. In TarkovTracker, extend the progress state to track per-objective completion, and update the storyline tab UI to render objective checklists with progress bars.

**Tech Stack:** JSON5 (overlay data), JSON Schema / AJV (validation), TypeScript (types), Vue 3 `<script setup>` + Tailwind v4 (UI), Pinia (state), Vitest (tests)

---

## Part 1: Overlay (`tarkov-data-overlay`)

### Task 1: Extend the StoryChapter type with objective fields

**Files:**

- Modify: `/home/lab/tarkov-data-overlay/src/lib/types.ts:222-233`

**Step 1: Add StoryObjective interface and extend StoryChapter**

After line 221 (`/** Story chapter structure for additions */`), replace the `StoryChapter` interface:

```typescript
/** Individual objective within a story chapter */
export interface StoryObjective {
  id: string;
  order: number;
  type: 'main' | 'optional';
  description: string;
  notes?: string;
  mutuallyExclusiveWith?: string[];
}

/** Reward summary for a story chapter */
export interface StoryRewards {
  description: string;
}

/** Story chapter structure for additions */
export interface StoryChapter {
  id: string;
  name: string;
  normalizedName: string;
  wikiLink: string;
  order: number;
  autoStart?: boolean;
  chapterRequirements?: Array<{ id: string; name: string }>;
  mapUnlocks?: Array<{ id: string; name: string }>;
  traderUnlocks?: Array<{ id: string; name: string }>;
  description?: string;
  notes?: string;
  objectives?: { [objectiveId: string]: StoryObjective };
  rewards?: StoryRewards | null;
}
```

**Step 2: Commit**

```bash
cd /home/lab/tarkov-data-overlay
git add src/lib/types.ts
git commit -m "feat: add StoryObjective type and extend StoryChapter"
```

---

### Task 2: Update the JSON schema for story chapters

**Files:**

- Modify: `/home/lab/tarkov-data-overlay/src/schemas/story-chapter.schema.json`

**Step 1: Add description, notes, objectives, and rewards to schema properties**

Replace the full schema file with:

```json
{
  "$id": "story-chapter.schema.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Story Chapter",
  "description": "Schema for story chapter data in tarkov-data-overlay",
  "type": "object",
  "additionalProperties": {
    "type": "object",
    "required": ["id", "name", "normalizedName", "wikiLink", "order"],
    "properties": {
      "id": {
        "description": "Unique identifier for the story chapter",
        "type": "string"
      },
      "name": {
        "description": "Display name of the story chapter",
        "type": "string"
      },
      "normalizedName": {
        "description": "URL-friendly normalized name",
        "type": "string"
      },
      "wikiLink": {
        "description": "Link to the official wiki page",
        "type": "string"
      },
      "order": {
        "description": "Sequential display order (1-based)",
        "type": "integer",
        "minimum": 1
      },
      "autoStart": {
        "description": "Whether the chapter starts automatically (true) or must be discovered in-world (false)",
        "type": "boolean"
      },
      "chapterRequirements": {
        "description": "Story chapters that must be completed before this one becomes available",
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "name"],
          "properties": {
            "id": { "type": "string" },
            "name": { "type": "string" }
          },
          "additionalProperties": false
        }
      },
      "mapUnlocks": {
        "description": "Maps unlocked by completing this chapter (tarkov.dev map IDs)",
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "name"],
          "properties": {
            "id": { "type": "string" },
            "name": { "type": "string" }
          },
          "additionalProperties": false
        }
      },
      "traderUnlocks": {
        "description": "Traders unlocked by progressing through this chapter (tarkov.dev trader IDs)",
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "name"],
          "properties": {
            "id": { "type": "string" },
            "name": { "type": "string" }
          },
          "additionalProperties": false
        }
      },
      "description": {
        "description": "Brief description or guidance for the chapter",
        "type": ["string", "null"]
      },
      "notes": {
        "description": "Additional notes (reputation consequences, tips, etc.)",
        "type": ["string", "null"]
      },
      "objectives": {
        "description": "Ordered list of chapter objectives",
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "type", "description"],
          "properties": {
            "id": {
              "description": "Globally unique objective ID ({chapter}-{main|opt}-{n})",
              "type": "string"
            },
            "type": {
              "description": "Whether the objective is required or bonus",
              "type": "string",
              "enum": ["main", "optional"]
            },
            "description": {
              "description": "Human-readable objective text",
              "type": "string"
            },
            "notes": {
              "description": "Optional guidance or tips for this objective",
              "type": "string"
            }
          },
          "additionalProperties": false
        }
      },
      "rewards": {
        "description": "Reward summary for completing the chapter",
        "type": ["object", "null"],
        "properties": {
          "description": {
            "description": "Human-readable reward description",
            "type": "string"
          }
        },
        "required": ["description"],
        "additionalProperties": false
      }
    },
    "additionalProperties": false
  }
}
```

Note: `additionalProperties` at the chapter level changes from `true` to `false` since we now explicitly define all fields. This catches typos in the data file.

**Step 2: Run validation to confirm schema loads**

```bash
cd /home/lab/tarkov-data-overlay
npx vitest run
```

Expected: Tests pass (existing data still validates since new fields are optional).

**Step 3: Commit**

```bash
git add src/schemas/story-chapter.schema.json
git commit -m "feat: add objectives, description, notes, rewards to story chapter schema"
```

---

### Task 3: Add objective data to all 9 chapters

**Files:**

- Modify: `/home/lab/tarkov-data-overlay/src/additions/storyChapters.json5`

**Step 1: Add objectives and metadata to each chapter**

For each of the 9 chapters, add `description`, `notes`, `objectives`, and `rewards` fields. The data comes from the community source at `https://github.com/Wilsman/task-tracker/blob/master/src/data/storylineQuests.ts`.

Here is the complete updated file content. Objectives are ordered main-first, then optional, matching the community source:

```json5
{
  // Tour
  // The introductory story chapter, automatically available on game start.
  // Source: https://escapefromtarkov.fandom.com/wiki/Tour
  // Objectives: https://github.com/Wilsman/task-tracker/blob/master/src/data/storylineQuests.ts
  tour: {
    id: 'tour',
    name: 'Tour',
    normalizedName: 'tour',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Tour',
    order: 1,
    autoStart: true,
    chapterRequirements: [],
    description: 'Starting quest - automatically unlocked at the beginning of the storyline',
    notes: null,
    objectives: [
      { id: 'tour-main-1', type: 'main', description: 'Escape Ground Zero' },
      { id: 'tour-main-2', type: 'main', description: 'Talk to Therapist' },
      { id: 'tour-main-3', type: 'main', description: 'Ensure access to the Streets of Tarkov' },
      { id: 'tour-main-4', type: 'main', description: 'Hand over the cash to Therapist' },
      { id: 'tour-main-5', type: 'main', description: 'Talk to Ragman' },
      { id: 'tour-main-6', type: 'main', description: 'Survive and extract from Interchange' },
      {
        id: 'tour-main-7',
        type: 'main',
        description: 'Tell Ragman what you found during the recon',
      },
      { id: 'tour-main-8', type: 'main', description: 'Talk to Skier' },
      { id: 'tour-main-9', type: 'main', description: 'Survive and extract from Customs' },
      {
        id: 'tour-main-10',
        type: 'main',
        description: 'Hand over any 5 found in raid Building materials items to Skier',
      },
      { id: 'tour-main-11', type: 'main', description: 'Talk to Mechanic' },
      { id: 'tour-main-12', type: 'main', description: 'Survive and extract from Factory' },
      {
        id: 'tour-main-13',
        type: 'main',
        description: 'Hand over any 2 found in raid weapons to Mechanic',
      },
      { id: 'tour-main-14', type: 'main', description: 'Talk to Skier' },
      { id: 'tour-main-15', type: 'main', description: 'Eliminate any 3 targets on Woods' },
      { id: 'tour-main-16', type: 'main', description: 'Survive and extract from Woods' },
      { id: 'tour-main-17', type: 'main', description: 'Locate the entrance to the port Terminal' },
      {
        id: 'tour-main-18',
        type: 'main',
        description: 'Find a way to contact the soldiers at the Terminal',
      },
      {
        id: 'tour-main-19',
        type: 'main',
        description: 'Use the intercom to contact the port garrison',
      },
      { id: 'tour-main-20', type: 'main', description: 'Learn how to escape Tarkov' },
      { id: 'tour-main-21', type: 'main', description: 'Ensure access to Lighthouse' },
      { id: 'tour-main-22', type: 'main', description: 'Hand over 20,000 Dollars to Mechanic' },
      { id: 'tour-main-23', type: 'main', description: 'Ensure access to Reserve' },
      { id: 'tour-main-24', type: 'main', description: 'Hand over 5 PMC dogtags to Prapor' },
      { id: 'tour-main-25', type: 'main', description: 'Survive and extract from Shoreline' },
      { id: 'tour-main-26', type: 'main', description: 'Ensure access to The Lab' },
      { id: 'tour-main-27', type: 'main', description: 'Access the secret TerraGroup facility' },
      {
        id: 'tour-main-28',
        type: 'main',
        description: 'Locate the escape path through the drainage system in The Lab',
      },
      { id: 'tour-main-29', type: 'main', description: 'Search the server room in The Lab' },
      {
        id: 'tour-main-30',
        type: 'main',
        description: 'Search the top management offices in The Lab',
      },
      { id: 'tour-opt-1', type: 'optional', description: 'Collect the required 250,000 Roubles' },
      {
        id: 'tour-opt-2',
        type: 'optional',
        description: 'Find any 5 items in raid from the Building materials category',
      },
      { id: 'tour-opt-3', type: 'optional', description: 'Find any 2 weapons in raid' },
      { id: 'tour-opt-4', type: 'optional', description: 'Collect the required 20,000 Dollars' },
      { id: 'tour-opt-5', type: 'optional', description: 'Find 5 PMC dogtags in raid' },
      {
        id: 'tour-opt-6',
        type: 'optional',
        description: 'Locate the entrance to the facility on Factory',
      },
      {
        id: 'tour-opt-7',
        type: 'optional',
        description: 'Locate the entrance to the facility on Streets of Tarkov',
      },
      {
        id: 'tour-opt-8',
        type: 'optional',
        description: 'Obtain a keycard or access codes to enter the facility',
      },
    ],
    rewards: {
      description: 'Unlocks achievement Pathfinder, traders (Skier, Mechanic, Prapor, Peacekeeper), and direct access to all locations',
    },
    mapUnlocks: [
      { id: '5714dc692459777137212e12', name: 'Streets of Tarkov' },
      { id: '5714dbc024597771384a510d', name: 'Interchange' },
      { id: '56f40101d2720b2a4d8b45d6', name: 'Customs' },
      { id: '55f2d3fd4bdc2d5f408b4567', name: 'Factory' },
      { id: '5704e3c2d2720bac5b8b4567', name: 'Woods' },
      { id: '5704e554d2720bac5b8b456e', name: 'Shoreline' },
      { id: '5704e5fad2720bc05b8b4567', name: 'Reserve' },
      { id: '5b0fc42d86f7744a585f9105', name: 'The Lab' },
      { id: '5704e4dad2720bb55b8b4567', name: 'Lighthouse' },
    ],
    traderUnlocks: [
      { id: '5ac3b934156ae10c4430e83c', name: 'Ragman' },
      { id: '58330581ace78e27b8b10cee', name: 'Skier' },
      { id: '54cb50c76803fa8b248b4571', name: 'Prapor' },
      { id: '5a7c2eca46aef81a7ca2145d', name: 'Mechanic' },
      { id: '5935c25fb3acc3127c3d8cd9', name: 'Peacekeeper' },
    ],
  },

  // Falling Skies
  // Source: https://escapefromtarkov.fandom.com/wiki/Falling_Skies
  'falling-skies': {
    id: 'falling-skies',
    name: 'Falling Skies',
    normalizedName: 'falling-skies',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Falling_Skies',
    order: 2,
    autoStart: false,
    chapterRequirements: [{ id: 'tour', name: 'Tour' }],
    description: "Best method: Keep doing Tour until completing Mechanic's quest, then go to the broken plane in Woods",
    notes: 'Keeping the armored case results in -0.3 Prapor reputation.',
    objectives: [
      { id: 'falling-skies-main-1', type: 'main', description: 'Locate the fallen plane' },
      {
        id: 'falling-skies-main-2',
        type: 'main',
        description: 'Reach Loyalty Level 2 with Prapor',
      },
      {
        id: 'falling-skies-main-3',
        type: 'main',
        description: 'Ask the traders about the fallen plane',
      },
      {
        id: 'falling-skies-main-4',
        type: 'main',
        description: 'Gather information from Therapist',
      },
      {
        id: 'falling-skies-main-5',
        type: 'main',
        description: 'Retrieve the flash drive from one of the G-Wagon SUVs',
      },
      { id: 'falling-skies-main-6', type: 'main', description: 'Hand over flash drive to Prapor' },
      { id: 'falling-skies-main-7', type: 'main', description: 'Wait for Prapor' },
      {
        id: 'falling-skies-main-8',
        type: 'main',
        description: "Retrieve the plane's flight recorder",
      },
      {
        id: 'falling-skies-main-9',
        type: 'main',
        description: 'Leave the flight recorder in the specified spot',
      },
      { id: 'falling-skies-main-10', type: 'main', description: 'Visit Prapor' },
      { id: 'falling-skies-main-11', type: 'main', description: 'Hand over 2 Toolset in raid' },
      {
        id: 'falling-skies-main-12',
        type: 'main',
        description: 'Hand over 3 Rechargeable battery in raid',
      },
      {
        id: 'falling-skies-main-13',
        type: 'main',
        description: 'Hand over 5 Printed circuit board in raid',
      },
      { id: 'falling-skies-main-14', type: 'main', description: 'Longer wait for Prapor' },
      {
        id: 'falling-skies-main-15',
        type: 'main',
        description: "Hand over the flight crew's transcript to Prapor",
      },
      {
        id: 'falling-skies-main-16',
        type: 'main',
        description: "Hand over Elektronik's secure flash drive to Prapor",
      },
      { id: 'falling-skies-main-17', type: 'main', description: 'Wait for Prapor' },
      { id: 'falling-skies-main-18', type: 'main', description: 'Retrieve the armored case' },
      {
        id: 'falling-skies-main-19',
        order: 19,
        type: 'main',
        description: 'Hand over the armored case to Prapor',
        mutuallyExclusiveWith: ['falling-skies-main-20'],
      },
      {
        id: 'falling-skies-main-20',
        order: 20,
        type: 'main',
        description: 'Keep the armored case for yourself',
        mutuallyExclusiveWith: ['falling-skies-main-19'],
      },
      {
        id: 'falling-skies-opt-1',
        type: 'optional',
        description: 'Hand over cash to Therapist 2,000$',
      },
    ],
    rewards: null,
    mapUnlocks: [],
    traderUnlocks: [],
  },

  // Batya
  // Source: https://escapefromtarkov.fandom.com/wiki/Batya
  batya: {
    id: 'batya',
    name: 'Batya',
    normalizedName: 'batya',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Batya',
    order: 3,
    autoStart: false,
    chapterRequirements: [],
    description: "Turns out BEAR didn't send just regular squads into Tarkov, there were real SOF guys here. I'd like to know more about those units and what exactly they were doing.",
    notes: null,
    objectives: [
      {
        id: 'batya-main-1',
        type: 'main',
        description: 'Locate the traces of the BEAR special squad',
      },
      { id: 'batya-main-2', type: 'main', description: 'Check BEAR outposts' },
      {
        id: 'batya-main-3',
        type: 'main',
        description: 'Learn more about the Bogatyr squad from the traders',
      },
      {
        id: 'batya-main-4',
        type: 'main',
        description: 'Locate the Gnezdo outpost',
        notes: 'The outpost is in the forest on the western side of the Ultra mall',
      },
      {
        id: 'batya-main-5',
        type: 'main',
        description: 'Figure out what happened to the Bogatyr squad',
      },
      {
        id: 'batya-main-6',
        type: 'main',
        description: "Learn more about the Bogatyr squad's members",
      },
      {
        id: 'batya-main-7',
        type: 'main',
        description: 'Locate the Ryabina outpost',
        notes: 'It should be somewhere on the ridge in the Priozersk forest, it was used as an observation point',
      },
      {
        id: 'batya-main-8',
        type: 'main',
        description: 'Find more information about the Bogatyr squad',
      },
      { id: 'batya-main-9', type: 'main', description: 'Locate the Carousel outpost' },
      { id: 'batya-main-10', type: 'main', description: 'Learn more about Voevoda' },
      { id: 'batya-main-11', type: 'main', description: "Find the Bogatyr squad's personal notes" },
      { id: 'batya-main-12', type: 'main', description: 'Learn more about Taran' },
      { id: 'batya-main-13', type: 'main', description: 'Learn more about Strelets' },
      { id: 'batya-main-14', type: 'main', description: "Find Voevoda's personal belongings" },
      {
        id: 'batya-main-15',
        type: 'main',
        description: "Learn more about the Bogatyr squad's activities",
      },
      { id: 'batya-main-16', type: 'main', description: 'Search the Gnezdo outpost' },
      {
        id: 'batya-main-17',
        type: 'main',
        description: "Retrieve more information about the ambush from Moreman's phone",
      },
      { id: 'batya-main-18', type: 'main', description: 'Use Workbench to repair phone parts' },
      { id: 'batya-main-19', type: 'main', description: 'Intelligence Center level 3' },
      { id: 'batya-main-20', type: 'main', description: 'Use Intelligence Center radio station' },
      {
        id: 'batya-opt-1',
        type: 'optional',
        description: "Locate and obtain the squad commander's recorder",
      },
      {
        id: 'batya-opt-2',
        type: 'optional',
        description: 'Locate and obtain a keepsake of one of the Bogatyrs',
      },
      {
        id: 'batya-opt-3',
        type: 'optional',
        description: 'Locate and obtain a personal item of one of the Bogatyrs',
      },
      {
        id: 'batya-opt-4',
        type: 'optional',
        description: 'Locate and obtain a dogtag of one of the Bogatyrs',
      },
      {
        id: 'batya-opt-5',
        type: 'optional',
        description: 'Locate and obtain the Bogatyr squad patch',
      },
      { id: 'batya-opt-6', type: 'optional', description: "Locate and obtain Moreman's phone" },
    ],
    rewards: null,
    mapUnlocks: [],
    traderUnlocks: [],
  },

  // The Unheard
  // Source: https://escapefromtarkov.fandom.com/wiki/The_Unheard_(quest)
  'the-unheard': {
    id: 'the-unheard',
    name: 'The Unheard',
    normalizedName: 'the-unheard',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/The_Unheard_(quest)',
    order: 4,
    autoStart: false,
    chapterRequirements: [],
    description: 'The Unheard questline',
    notes: null,
    objectives: [
      {
        id: 'the-unheard-main-1',
        type: 'main',
        description: "Learn more about TerraGroup's activities",
      },
      {
        id: 'the-unheard-main-2',
        type: 'main',
        description: 'Find more information about the special catalyst shipment',
      },
      { id: 'the-unheard-main-3', type: 'main', description: "Locate Rzhevsky's service vehicle" },
      { id: 'the-unheard-main-4', type: 'main', description: 'Scout the underground laboratory' },
      {
        id: 'the-unheard-main-5',
        type: 'main',
        description: 'Find cargo transport fax in The Lab',
      },
      {
        id: 'the-unheard-main-6',
        type: 'main',
        description: 'Find document on changes in enterprise interactions in The Lab',
      },
      {
        id: 'the-unheard-main-7',
        type: 'main',
        description: 'Find transport log with notes on Factory',
      },
    ],
    rewards: null,
    mapUnlocks: [],
    traderUnlocks: [],
  },

  // Blue Fire
  // Source: https://escapefromtarkov.fandom.com/wiki/Blue_Fire
  'blue-fire': {
    id: 'blue-fire',
    name: 'Blue Fire',
    normalizedName: 'blue-fire',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Blue_Fire',
    order: 5,
    autoStart: false,
    chapterRequirements: [],
    description: 'Find flyer at any of these locations: Woods med camp (inside a green container taped to a white drawer), Interchange new area flyer, or Interchange big Terragroup area behind old co-op extract (med tent/bunker)',
    notes: 'Planting the device takes 60 seconds. Selling the fragment yields 1.5M roubles.',
    objectives: [
      {
        id: 'blue-fire-main-1',
        type: 'main',
        description: 'Locate and obtain the device fragment',
      },
      { id: 'blue-fire-main-2', type: 'main', description: 'Talk to Mechanic about the EMP blast' },
      {
        id: 'blue-fire-main-3',
        type: 'main',
        description: 'Locate and obtain the device fragment in Chek 13',
      },
      { id: 'blue-fire-main-4', type: 'main', description: 'Talk to Mechanic' },
      {
        id: 'blue-fire-main-5',
        type: 'main',
        description: 'Plant the hacking device in the server room in The Lab',
      },
      {
        id: 'blue-fire-opt-1',
        type: 'optional',
        description: 'Hand over the fragment of Item 1156 to Mechanic',
      },
      {
        id: 'blue-fire-opt-2',
        type: 'optional',
        description: 'Keep the fragment of Item 1156 for yourself',
      },
      {
        id: 'blue-fire-opt-3',
        type: 'optional',
        description: 'Find a lead on Item 1156 (if fragment was sold)',
      },
    ],
    rewards: null,
    mapUnlocks: [],
    traderUnlocks: [],
  },

  // They Are Already Here
  // Source: https://escapefromtarkov.fandom.com/wiki/They_Are_Already_Here
  'they-are-already-here': {
    id: 'they-are-already-here',
    name: 'They Are Already Here',
    normalizedName: 'they-are-already-here',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/They_Are_Already_Here',
    order: 6,
    autoStart: false,
    chapterRequirements: [],
    description: 'Complete any ONE of these: Kill cultist, Loot dorms marked room, Get note next to cultist circle in abandoned village, or Fisherman island on Shoreline where the green box is',
    notes: null,
    objectives: [
      {
        id: 'they-are-already-here-main-1',
        type: 'main',
        description: "Find 'Note about the Eye of the World'",
      },
      {
        id: 'they-are-already-here-main-2',
        type: 'main',
        description: 'Locate a place connected to the Eye of the World',
      },
      {
        id: 'they-are-already-here-main-3',
        type: 'main',
        description: "Locate the cult victim's apartment",
      },
      {
        id: 'they-are-already-here-main-4',
        type: 'main',
        description: 'Obtain and read the planted book',
      },
      {
        id: 'they-are-already-here-main-5',
        type: 'main',
        description: "Investigate the victim's apartment",
      },
      {
        id: 'they-are-already-here-main-6',
        type: 'main',
        description: "Obtain the victim's first audio tape",
      },
      {
        id: 'they-are-already-here-main-7',
        type: 'main',
        description: 'Ask Mechanic about the Eye of the World',
      },
      {
        id: 'they-are-already-here-main-8',
        type: 'main',
        description: 'Locate and neutralize 2 Cultist Priests',
      },
      {
        id: 'they-are-already-here-main-9',
        type: 'main',
        description: 'Obtain more information on the Eye of the World',
      },
      {
        id: 'they-are-already-here-opt-1',
        type: 'optional',
        description: 'Obtain the key to the apartment',
      },
    ],
    rewards: null,
    mapUnlocks: [],
    traderUnlocks: [],
  },

  // Accidental Witness
  // Source: https://escapefromtarkov.fandom.com/wiki/Accidental_Witness
  'accidental-witness': {
    id: 'accidental-witness',
    name: 'Accidental Witness',
    normalizedName: 'accidental-witness',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Accidental_Witness',
    order: 7,
    autoStart: false,
    chapterRequirements: [],
    description: 'Check the car between customs dorm',
    notes: null,
    objectives: [
      {
        id: 'accidental-witness-main-1',
        type: 'main',
        description: 'Figure out where Kozlov lived',
      },
      {
        id: 'accidental-witness-main-2',
        type: 'main',
        description: "Read the note on Kozlov's door",
      },
      {
        id: 'accidental-witness-main-3',
        type: 'main',
        description: 'Find out what Kozlov was involved in',
      },
      {
        id: 'accidental-witness-main-4',
        type: 'main',
        description: 'Ask the traders about Anastasia',
      },
      {
        id: 'accidental-witness-main-5',
        type: 'main',
        description: "Access Skier's accomplice's apartment",
      },
      {
        id: 'accidental-witness-main-6',
        type: 'main',
        description: "Learn more about Skier's accomplice's apartment",
      },
      {
        id: 'accidental-witness-main-7',
        type: 'main',
        description: "Read the documents in Skier's accomplice's apartment",
      },
      { id: 'accidental-witness-main-8', type: 'main', description: 'Report to Skier' },
      { id: 'accidental-witness-main-9', type: 'main', description: 'Talk to Ragman' },
      {
        id: 'accidental-witness-main-10',
        type: 'main',
        description: "Locate Anastasia's apartment",
      },
      {
        id: 'accidental-witness-main-11',
        type: 'main',
        description: "Investigate the entrance to Anastasia's building",
      },
      { id: 'accidental-witness-main-12', type: 'main', description: 'Learn more about Anastasia' },
      { id: 'accidental-witness-main-13', type: 'main', description: 'Locate courier Pasha' },
      { id: 'accidental-witness-main-14', type: 'main', description: 'Search the ambush spot' },
      { id: 'accidental-witness-main-15', type: 'main', description: 'Talk to Skier' },
      { id: 'accidental-witness-main-16', type: 'main', description: "Locate Reshala's stash" },
      {
        id: 'accidental-witness-main-17',
        type: 'main',
        description: "Investigate Reshala's bunkhouse",
      },
      { id: 'accidental-witness-main-18', type: 'main', description: "Locate Kozlov's hideout" },
      {
        id: 'accidental-witness-main-19',
        type: 'main',
        description: "Locate and obtain Kozlov's evidence",
      },
      { id: 'accidental-witness-opt-1', type: 'optional', description: "Access Kozlov's room" },
      {
        id: 'accidental-witness-opt-2',
        type: 'optional',
        description: "Figure out where to get Kozlov's key",
      },
      {
        id: 'accidental-witness-opt-3',
        type: 'optional',
        description: "Find the key to Skier's accomplice's apartment",
      },
    ],
    rewards: null,
    mapUnlocks: [],
    traderUnlocks: [],
  },

  // The Labyrinth
  // Source: https://escapefromtarkov.fandom.com/wiki/The_Labyrinth_(quest)
  'the-labyrinth': {
    id: 'the-labyrinth',
    name: 'The Labyrinth',
    normalizedName: 'the-labyrinth',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/The_Labyrinth_(quest)',
    order: 8,
    autoStart: false,
    chapterRequirements: [],
    description: 'Go into the access tunnel in Shoreline Resort Basement. Requires: Knossos key.',
    notes: 'Extremely dangerous area; includes traps, poison, tripwires, and miniboss versions of Tagilla and possibly Killa.',
    objectives: [
      {
        id: 'the-labyrinth-main-1',
        type: 'main',
        description: "Accept Mechanic's quest 'Shady Contractor'",
      },
      { id: 'the-labyrinth-main-2', type: 'main', description: 'Visit Therapist for information' },
      { id: 'the-labyrinth-main-3', type: 'main', description: 'Visit Jaeger and negotiate help' },
      { id: 'the-labyrinth-main-4', type: 'main', description: 'Wait 48 hours for keycards' },
      { id: 'the-labyrinth-main-5', type: 'main', description: 'Collect 2 Labrys access keycards' },
      {
        id: 'the-labyrinth-main-6',
        type: 'main',
        description: 'Reach the Labyrinth via Shoreline Health Resort',
      },
      {
        id: 'the-labyrinth-main-7',
        type: 'main',
        description: 'Disable starting-room trap to exit',
      },
      { id: 'the-labyrinth-main-8', type: 'main', description: 'Navigate the Labyrinth hazards' },
      { id: 'the-labyrinth-main-9', type: 'main', description: 'Survive enemy waves' },
      { id: 'the-labyrinth-main-10', type: 'main', description: 'Defeat Shadow of Tagilla' },
      { id: 'the-labyrinth-main-11', type: 'main', description: 'Survive potential Killa ambush' },
    ],
    rewards: null,
    mapUnlocks: [{ id: '6733700029c367a3d40b02af', name: 'The Labyrinth' }],
    traderUnlocks: [],
  },

  // The Ticket
  // Source: https://escapefromtarkov.fandom.com/wiki/The_Ticket
  'the-ticket': {
    id: 'the-ticket',
    name: 'The Ticket',
    normalizedName: 'the-ticket',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/The_Ticket',
    order: 9,
    autoStart: false,
    chapterRequirements: [{ id: 'falling-skies', name: 'Falling Skies' }],
    description: 'Earned automatically after completing Falling Skies',
    notes: null,
    objectives: [],
    rewards: null,
    mapUnlocks: [],
    traderUnlocks: [],
  },
}
```

Note: The community source uses `unheard-main-*` IDs but for consistency with the ID convention (`{chapter-normalized-name}-{type}-{n}`), use `the-unheard-main-*` to match the chapter's normalized name. Similarly `labyrinth-main-*` becomes `the-labyrinth-main-*`.

**Step 2: Validate and build**

```bash
cd /home/lab/tarkov-data-overlay
npm run validate && npm run build && npm test
```

Expected: All pass.

**Step 3: Commit**

```bash
git add src/additions/storyChapters.json5 dist/overlay.json
git commit -m "feat: add objectives and metadata to all 9 story chapters"
```

---

## Part 2: TarkovTracker

### Task 4: Extend StoryChapter type in TarkovTracker

**Files:**

- Modify: `/home/lab/TarkovTracker/app/types/tarkov.ts:361-371`

**Step 1: Add StoryObjective and extend StoryChapter**

Replace the `StoryChapter` interface (lines 361-371) with:

```typescript
export interface StoryObjective {
  id: string;
  order: number;
  type: 'main' | 'optional';
  description: string;
  notes?: string;
  mutuallyExclusiveWith?: string[];
}
export interface StoryRewards {
  description: string;
}
export interface StoryChapter {
  id: string;
  name: string;
  normalizedName: string;
  wikiLink: string;
  order: number;
  autoStart?: boolean;
  chapterRequirements?: Array<{ id: string; name: string }>;
  mapUnlocks?: Array<{ id: string; name: string }>;
  traderUnlocks?: Array<{ id: string; name: string }>;
  description?: string;
  notes?: string;
  objectives?: { [objectiveId: string]: StoryObjective };
  rewards?: StoryRewards | null;
}
```

**Step 2: Commit**

```bash
cd /home/lab/TarkovTracker
git add app/types/tarkov.ts
git commit -m "feat(storyline): add StoryObjective type and extend StoryChapter"
```

---

### Task 5: Add objective progress tracking to the store

**Files:**

- Modify: `/home/lab/TarkovTracker/app/stores/progressState.ts`

**Step 1: Extend the storyChapters progress type (line 80)**

Change:

```typescript
  storyChapters: { [chapterId: string]: { complete?: boolean; timestamp?: number } };
```

To:

```typescript
  storyChapters: {
    [chapterId: string]: {
      complete?: boolean;
      timestamp?: number;
      objectives?: { [objectiveId: string]: { complete?: boolean; timestamp?: number } };
    };
  };
```

**Step 2: Add getter for objective completion (after line 271)**

After `isStoryChapterComplete` getter, add:

```typescript
  isStoryObjectiveComplete: (state: UserState) => (chapterId: string, objectiveId: string) =>
    getCurrentData(state)?.storyChapters?.[chapterId]?.objectives?.[objectiveId]?.complete ?? false,
```

**Step 3: Add actions for objective toggling (after line 479, before the closing `} as const;`)**

After the `toggleStoryChapterComplete` action, add:

```typescript
  setStoryObjectiveComplete(this: UserState, chapterId: string, objectiveId: string) {
    const data = getCurrentData(this);
    if (!data.storyChapters[chapterId]) {
      data.storyChapters[chapterId] = {};
    }
    if (!data.storyChapters[chapterId].objectives) {
      data.storyChapters[chapterId].objectives = {};
    }
    data.storyChapters[chapterId].objectives![objectiveId] = {
      complete: true,
      timestamp: Date.now(),
    };
  },
  setStoryObjectiveUncomplete(this: UserState, chapterId: string, objectiveId: string) {
    const data = getCurrentData(this);
    if (!data.storyChapters[chapterId]) {
      data.storyChapters[chapterId] = {};
    }
    if (!data.storyChapters[chapterId].objectives) {
      data.storyChapters[chapterId].objectives = {};
    }
    data.storyChapters[chapterId].objectives![objectiveId] = { complete: false };
  },
  toggleStoryObjectiveComplete(this: UserState, chapterId: string, objectiveId: string) {
    const isComplete = getters.isStoryObjectiveComplete(this)(chapterId, objectiveId);
    if (isComplete) {
      actions.setStoryObjectiveUncomplete.call(this, chapterId, objectiveId);
    } else {
      actions.setStoryObjectiveComplete.call(this, chapterId, objectiveId);
    }
  },
```

**Step 4: Commit**

```bash
cd /home/lab/TarkovTracker
git add app/stores/progressState.ts
git commit -m "feat(storyline): add per-objective progress tracking"
```

---

### Task 6: Add locale keys

**Files:**

- Modify: `/home/lab/TarkovTracker/app/locales/en.json5` (and other locale files)

**Step 1: Add keys after `storyline_wiki` (line 715)**

```json5
      storyline_objectives_main: 'Main Objectives',
      storyline_objectives_optional: 'Optional Objectives',
      storyline_description: 'Description',
      storyline_notes: 'Notes',
      storyline_rewards: 'Rewards',
```

**Step 2: Add the same keys to de.json5, es.json5, fr.json5, ru.json5, uk.json5, zh.json5** using English as placeholder (same pattern as existing storyline keys).

**Step 3: Commit**

```bash
cd /home/lab/TarkovTracker
git add app/locales/*.json5
git commit -m "feat(storyline): add locale keys for objective tracking UI"
```

---

### Task 7: Update ProfileStorylineTab to render objectives

**Files:**

- Modify: `/home/lab/TarkovTracker/app/features/profile/ProfileStorylineTab.vue`

**Step 1: Update the Props interface**

Change the props to pass both chapter completion and objective completion state:

```typescript
interface Props {
  storyChapterCompletionState: Record<string, boolean>;
  storyObjectiveCompletionState: Record<string, Record<string, boolean>>;
}
```

**Step 2: Update ChapterProgress interface and computed**

Extend `ChapterProgress` to include objectives:

```typescript
interface ObjectiveProgress {
  id: string;
  type: 'main' | 'optional';
  description: string;
  notes?: string;
  complete: boolean;
}
interface ChapterProgress {
  id: string;
  name: string;
  normalizedName: string;
  order: number;
  autoStart: boolean;
  complete: boolean;
  wikiLink: string;
  description?: string;
  notes?: string;
  rewards?: { description: string } | null;
  requirements: Array<{ id: string; name: string }>;
  mapUnlocks: Array<{ id: string; name: string }>;
  traderUnlocks: Array<{ id: string; name: string }>;
  mainObjectives: ObjectiveProgress[];
  optionalObjectives: ObjectiveProgress[];
  mainProgress: number;
  mainTotal: number;
}
```

Update the computed to map objectives:

```typescript
const chapterProgress = computed<ChapterProgress[]>(() => {
  const chapters: StoryChapter[] = metadataStore.storyChapters ?? [];
  return chapters.map((chapter) => {
    const objectives = chapter.objectives ?? [];
    const chapterObjState = props.storyObjectiveCompletionState[chapter.id] ?? {};
    const mainObjectives = objectives
      .filter((o) => o.type === 'main')
      .map((o) => ({ ...o, complete: chapterObjState[o.id] === true }));
    const optionalObjectives = objectives
      .filter((o) => o.type === 'optional')
      .map((o) => ({ ...o, complete: chapterObjState[o.id] === true }));
    const mainTotal = mainObjectives.length;
    const mainProgress = mainObjectives.filter((o) => o.complete).length;
    return {
      id: chapter.id,
      name: chapter.name || chapter.id,
      normalizedName: chapter.normalizedName,
      order: chapter.order,
      autoStart: chapter.autoStart ?? false,
      complete: props.storyChapterCompletionState[chapter.id] === true,
      wikiLink: chapter.wikiLink,
      description: chapter.description,
      notes: chapter.notes,
      rewards: chapter.rewards,
      requirements: chapter.chapterRequirements ?? [],
      mapUnlocks: chapter.mapUnlocks ?? [],
      traderUnlocks: chapter.traderUnlocks ?? [],
      mainObjectives,
      optionalObjectives,
      mainProgress,
      mainTotal,
    };
  });
});
```

**Step 3: Add emits for objective toggling**

```typescript
const emit = defineEmits<{
  toggleObjective: [chapterId: string, objectiveId: string];
}>();
```

**Step 4: Update the template**

Add a description section, objective checklists, and a fraction-based progress bar to each chapter card. Use template anchors instead of line numbers:

- Locate the trader unlocks block by the `{{ t('page.profile.storyline_unlocks_traders') }}` marker.
- Insert the new sections immediately after that block.
- Insert before the existing progress bar block (`<div class="bg-surface-800/60 mt-2 h-1.5 overflow-hidden rounded-full">`).
- If either marker is missing, add `<!-- insert-chapter-metadata-here -->` at the correct location and insert the sections at that marker.

```vue
        <div v-if="chapter.description" class="mb-1.5">
          <div class="text-surface-400 text-xs">
            {{ chapter.description }}
          </div>
        </div>
        <div v-if="chapter.notes" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_notes') }}
          </div>
          <div class="text-warning-400 text-xs">{{ chapter.notes }}</div>
        </div>
        <div v-if="chapter.mainObjectives.length" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_objectives_main') }}
          </div>
          <div class="space-y-0.5">
            <label
              v-for="obj in chapter.mainObjectives"
              :key="obj.id"
              class="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 hover:bg-white/5"
            >
              <input
                type="checkbox"
                :checked="obj.complete"
                class="accent-success-500 mt-0.5 shrink-0"
                @change="emit('toggleObjective', chapter.id, obj.id)"
              />
              <span class="text-xs" :class="obj.complete ? 'text-surface-500 line-through' : 'text-surface-300'">
                {{ obj.description }}
              </span>
            </label>
          </div>
        </div>
        <div v-if="chapter.optionalObjectives.length" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_objectives_optional') }}
          </div>
          <div class="space-y-0.5">
            <label
              v-for="obj in chapter.optionalObjectives"
              :key="obj.id"
              class="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 hover:bg-white/5"
            >
              <input
                type="checkbox"
                :checked="obj.complete"
                class="accent-info-500 mt-0.5 shrink-0"
                @change="emit('toggleObjective', chapter.id, obj.id)"
              />
              <span class="text-xs" :class="obj.complete ? 'text-surface-500 line-through' : 'text-surface-300'">
                {{ obj.description }}
              </span>
            </label>
          </div>
        </div>
        <div v-if="chapter.rewards" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_rewards') }}
          </div>
          <div class="text-surface-300 text-xs">{{ chapter.rewards.description }}</div>
        </div>
```

Update the progress bar to use fraction-based width instead of binary:

```vue
        <div class="bg-surface-800/60 mt-2 h-1.5 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-[width] duration-300"
            :class="chapter.complete ? 'bg-success-500/70' : chapter.mainProgress > 0 ? 'bg-primary-500/70' : 'bg-surface-700'"
            :style="{ width: chapter.mainTotal > 0 ? `${(chapter.mainProgress / chapter.mainTotal) * 100}%` : chapter.complete ? '100%' : '0%' }"
          ></div>
        </div>
```

**Step 5: Commit**

```bash
cd /home/lab/TarkovTracker
git add app/features/profile/ProfileStorylineTab.vue
git commit -m "feat(storyline): render per-objective checklists with progress tracking"
```

---

### Task 8: Wire up the parent component to pass objective state

**Files:**

- Modify: `/home/lab/TarkovTracker/app/features/profile/ProfileProgression.vue`

**Step 1: Add objective completion state computed (after line 916)**

```typescript
const storyObjectiveCompletionState = computed<Record<string, Record<string, boolean>>>(() => {
  const storyProgress = modeData.value.storyChapters ?? {};
  const state: Record<string, Record<string, boolean>> = {};
  for (const chapter of metadataStore.storyChapters ?? []) {
    const chapterProgress = storyProgress[chapter.id];
    const objState: Record<string, boolean> = {};
    for (const obj of chapter.objectives ?? []) {
      objState[obj.id] = chapterProgress?.objectives?.[obj.id]?.complete === true;
    }
    state[chapter.id] = objState;
  }
  return state;
});
```

**Step 2: Add handler for objective toggle**

Add a method in the script section (near the other story chapter logic):

```typescript
const handleStoryObjectiveToggle = (chapterId: string, objectiveId: string) => {
  progressStore.toggleStoryObjectiveComplete(chapterId, objectiveId);
};
```

**Step 3: Update the ProfileStorylineTab usage in the template**

Find where `<ProfileStorylineTab` is rendered and add the new prop and event handler:

```vue
<ProfileStorylineTab
  :story-chapter-completion-state="storyChapterCompletionState"
  :story-objective-completion-state="storyObjectiveCompletionState"
  @toggle-objective="handleStoryObjectiveToggle"
/>
```

**Step 4: Update the storyline badge to show objective progress**

Update the badge for the storyline tab (around line 1558-1564) to show completed main objectives vs total instead of just chapter count. Find `completedStoryChapters` and `totalStoryChapters` computeds and add a main objective count:

```typescript
const totalStoryMainObjectives = computed(() => {
  let count = 0;
  for (const chapter of metadataStore.storyChapters ?? []) {
    count += (chapter.objectives ?? []).filter((o) => o.type === 'main').length;
  }
  return count;
});
const completedStoryMainObjectives = computed(() => {
  const storyProgress = modeData.value.storyChapters ?? {};
  let count = 0;
  for (const chapter of metadataStore.storyChapters ?? []) {
    const chapterProgress = storyProgress[chapter.id];
    for (const obj of (chapter.objectives ?? []).filter((o) => o.type === 'main')) {
      if (chapterProgress?.objectives?.[obj.id]?.complete === true) {
        count++;
      }
    }
  }
  return count;
});
```

Then update the tab badge from `completedStoryChapters`/`totalStoryChapters` to `completedStoryMainObjectives`/`totalStoryMainObjectives`.

**Step 5: Commit**

```bash
cd /home/lab/TarkovTracker
git add app/features/profile/ProfileProgression.vue
git commit -m "feat(storyline): wire objective state and toggle through parent component"
```

---

### Task 9: Run tests and verify

**Step 1: Run overlay tests**

```bash
cd /home/lab/tarkov-data-overlay
npm test
```

Expected: All pass, schema validates the new data.

**Step 2: Run TarkovTracker linting and tests**

```bash
cd /home/lab/TarkovTracker
npm run format
npx vitest run
```

Expected: All pass.

**Step 3: Run dev server and manually verify**

```bash
cd /home/lab/TarkovTracker
npm run dev
```

Verify:

- Storyline tab shows objective checklists per chapter
- Checking/unchecking objectives persists
- Progress bar fills based on main objective completion
- Chapter badge in tab shows objective counts
- Chapters without objectives (The Ticket) still render cleanly

**Step 4: Final commit if format changed anything**

```bash
cd /home/lab/TarkovTracker
git add -A
git commit -m "chore: format after storyline objectives integration"
```
