/**
 * @openapi
 * components:
 *   schemas:
 *     Token:
 *       title: Token
 *       description: User's token data.
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: Shows token used to make this call
 *         permissions:
 *           type: array
 *           description: GP == Get Progression, TP == Team Progression, WP == Write Progression
 *           items:
 *             type: string
 *     TeamProgress:
 *       title: TeamProgress
 *       description: Array of team member's progress data.
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/Progress'
 *     Progress:
 *       title: Progress
 *       description: User's progress data.
 *       type: object
 *       properties:
 *         playerLevel:
 *           type: integer
 *           description: Player's current level
 *         gameEdition:
 *           type: integer
 *           description: 1 = Standard Edition, 2 = Left Behind Edition, 3 = Prepare for Escape Edition,
 *             4 = Edge of Darkness (Limited Edition), 5 = The Unheard Edition
 *         taskProgress:
 *           type: array
 *           description: Array of task progress data.
 *           items:
 *             $ref: '#/components/schemas/TaskProgress'
 *         taskObjectivesProgress:
 *           type: array
 *           description: Array of task objective progress data.
 *           items:
 *             $ref: '#/components/schemas/TaskObjectiveProgress'
 *         hideoutModulesProgress:
 *           type: array
 *           description: Array of hideout module progress data.
 *           items:
 *             $ref: '#/components/schemas/HideoutModulesProgress'
 *         hideoutPartsProgress:
 *           type: array
 *           description: Array of hideout part progress data.
 *           items:
 *             $ref: '#/components/schemas/HideoutPartsProgress'
 *         userId:
 *           type: string
 *           description: Player's TarkovTracker UUID
 *         displayName:
 *           type: string
 *           description: Player's TarkovTracker display name within their team
 *         pmcFaction:
 *           type: string
 *           description: Player's PMC faction (USEC, BEAR)
 *     TaskProgress:
 *       title: TaskProgress
 *       description: Player's progress of a given task. The key is the UUID correlating to the task ID
 *         available via the tarkov.dev API
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: UUID correlating to the task ID available via the tarkov.dev API
 *         complete:
 *           type: boolean
 *           description: True if a given quest has been completed.
 *         failed:
 *           type: boolean
 *           description: True if a given quest has been failed in some permanent way
 *             (eg. one of three quest options was chosen and the other two are now unavailable)
 *         invalid:
 *           type: boolean
 *           description: True if a given quest is no longer accessible, but not necessarily failed
 *             (eg. wrong faction, part of a quest chain that was not chosen by previous completions)
 *     HideoutModulesProgress:
 *       title: HideoutModulesProgress
 *       description: Player's progress on a given hideout module.
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: UUID correlating to the hideout station level ID available via the tarkov.dev API
 *         complete:
 *           type: boolean
 *           description: True if a given hideout module has been installed
 *     TaskObjectiveProgress:
 *       title: TaskObjectiveProgress
 *       description: Player's progress on a given task objective.
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: UUID correlating to the task objective ID available via the tarkov.dev API
 *         count:
 *           type: integer
 *           description: Number of items collected for a given objective (if applicable)
 *         complete:
 *           type: boolean
 *           description: True if a given objective has been completed
 *         invalid:
 *           type: boolean
 *           description: True if a given objective is no longer accessible, but not necessarily failed
 *             (eg. wrong faction, part of a quest chain that was not chosen by previous completions)
 *     HideoutPartsProgress:
 *       title: HideoutPartsProgress
 *       description: Player's progress on items needed for hideout module upgrades.
 *       type: object
 *       properties:
 *         complete:
 *           type: boolean
 *           description: True if a given hideout part objective has been completed
 *         count:
 *           type: integer
 *           description: Number of items collected for a given hideout part objective
 *         id:
 *           type: string
 *           description: UUID correlating to individual hideout station level item requirements' ID
 *             available via the tarkov.dev API
 */

// This file primarily serves to hold the OpenAPI component definitions.
// Actual TypeScript interfaces/types should be defined alongside the code that uses them or in dedicated type files.
