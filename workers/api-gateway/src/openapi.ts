export const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'TarkovTracker API Gateway',
    version: '2.1.0',
    description:
      'Public API gateway for TarkovTracker progress, team progress, and token info.\n\n' +
      'Authentication: Send API tokens in the Authorization header as `Bearer <token>`.\n' +
      'Tokens use prefixes `PVP_` or `PVE_`.\n\n' +
      'Rate limits: tiered daily quotas keyed by user account (free: 1,000 reads/day and ' +
      '100 writes/day; supporter tiers scale up), resetting at 00:00 UTC, plus a per-minute ' +
      'burst limit using a 60-second sliding window. ' +
      'Every response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` ' +
      '(unix seconds) describing the daily quota. On `429` responses a `Retry-After` header (seconds) ' +
      'is also returned, so clients should queue and retry after that delay rather than busy-looping. ' +
      'Burst-throttled requests do not consume the daily quota.\n\n' +
      'Docs: https://api.tarkovtracker.org/docs (or / on the api subdomain).',
    contact: {
      name: 'TarkovTracker',
      url: 'https://tarkovtracker.org',
    },
  },
  servers: [
    {
      url: 'https://api.tarkovtracker.org',
      description: 'API subdomain (recommended)',
    },
    {
      url: 'https://tarkovtracker.org/api/v2',
      description: 'Legacy path-based API',
    },
    {
      url: 'http://localhost:8787',
      description: 'Local dev (wrangler dev)',
    },
  ],
  tags: [
    { name: 'health', description: 'Health and diagnostics' },
    { name: 'docs', description: 'Documentation endpoints' },
    { name: 'tokens', description: 'Token inspection endpoints' },
    { name: 'progress', description: 'User progress read/write endpoints' },
    { name: 'team', description: 'Team progress endpoints' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Token',
        description: 'Authorization: Bearer <token>',
      },
    },
    responses: {
      Unauthorized: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            examples: {
              missingToken: { value: { success: false, error: 'Unauthorized' } },
              invalidToken: { value: { success: false, error: 'Invalid token' } },
            },
          },
        },
      },
      Forbidden: {
        description: 'Forbidden (missing permission)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            examples: {
              missingPermission: {
                value: { success: false, error: 'Missing required permission: TP' },
              },
            },
          },
        },
      },
      BadRequest: {
        description: 'Bad Request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            examples: {
              invalidState: { value: { success: false, error: 'Invalid state' } },
            },
          },
        },
      },
      RateLimited: {
        description: 'Rate limit exceeded (daily quota or per-minute burst limit)',
        headers: {
          'Retry-After': {
            description:
              'Seconds the client should wait before retrying (daily reset, or when burst capacity frees).',
            schema: { type: 'integer', minimum: 1 },
          },
          'X-RateLimit-Limit': {
            description: 'Maximum requests permitted per UTC day for the account tier.',
            schema: { type: 'integer', minimum: 1 },
          },
          'X-RateLimit-Remaining': {
            description: 'Requests remaining in the daily quota.',
            schema: { type: 'integer', minimum: 0 },
          },
          'X-RateLimit-Reset': {
            description: 'Unix timestamp (seconds) when the daily quota resets (00:00 UTC).',
            schema: { type: 'integer', minimum: 0 },
          },
        },
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            examples: {
              rateLimited: { value: { success: false, error: 'Rate limit exceeded' } },
              dailyQuotaUpgrade: {
                summary: 'Free-tier daily quota exhausted',
                value: {
                  success: false,
                  error:
                    'Daily read quota exceeded for the free tier. Quotas reset at 00:00 UTC. ' +
                    'Upgrade your account for higher limits: https://tarkovtracker.org/supporter',
                },
              },
            },
          },
        },
      },
      ServiceUnavailable: {
        description: 'Rate limiter unavailable',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            examples: {
              limiterUnavailable: {
                value: { success: false, error: 'Rate limiter unavailable' },
              },
            },
          },
        },
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { const: false },
          error: { type: 'string' },
        },
        required: ['success', 'error'],
        examples: [{ success: false, error: 'Unauthorized' }],
      },
      Permission: {
        type: 'string',
        enum: ['GP', 'TP', 'WP'],
        description: 'GP=progress read, TP=team progress, WP=progress write',
      },
      GameMode: {
        type: 'string',
        enum: ['pvp', 'pve'],
      },
      PmcFaction: {
        type: 'string',
        enum: ['USEC', 'BEAR'],
      },
      TokenInfoResponse: {
        type: 'object',
        properties: {
          success: { const: true },
          permissions: { type: 'array', items: { $ref: '#/components/schemas/Permission' } },
          token: { type: 'string' },
          owner: { type: 'string' },
          note: { type: 'string' },
          calls: { type: 'integer' },
          gameMode: { $ref: '#/components/schemas/GameMode' },
        },
        required: ['success', 'permissions', 'token', 'owner', 'note', 'calls', 'gameMode'],
        examples: [
          {
            success: true,
            permissions: ['GP', 'WP'],
            token: 'PVP_deadbeefcafe',
            owner: 'user-uuid',
            note: 'RatScanner',
            calls: 12,
            gameMode: 'pvp',
          },
        ],
      },
      ProgressTask: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          complete: { type: 'boolean' },
          failed: { type: 'boolean' },
          invalid: { type: 'boolean' },
        },
        required: ['id', 'complete'],
      },
      ProgressObjective: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          complete: { type: 'boolean' },
          count: {
            type: 'number',
            description: 'Only included when greater than 0.',
          },
          invalid: { type: 'boolean' },
        },
        required: ['id', 'complete'],
      },
      ProgressHideoutModule: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          complete: { type: 'boolean' },
        },
        required: ['id', 'complete'],
      },
      ProgressHideoutPart: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          complete: { type: 'boolean' },
          count: {
            type: 'number',
            description: 'Only included when greater than 0.',
          },
        },
        required: ['id', 'complete'],
      },
      ProgressMeta: {
        type: 'object',
        properties: {
          self: { type: 'string' },
          gameMode: { $ref: '#/components/schemas/GameMode' },
        },
        required: ['self', 'gameMode'],
      },
      TeamProgressMeta: {
        type: 'object',
        properties: {
          self: { type: 'string' },
          hiddenTeammates: { type: 'array', items: { type: 'string' } },
        },
        required: ['self', 'hiddenTeammates'],
      },
      ProgressData: {
        type: 'object',
        properties: {
          tasksProgress: { type: 'array', items: { $ref: '#/components/schemas/ProgressTask' } },
          taskObjectivesProgress: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProgressObjective' },
          },
          hideoutModulesProgress: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProgressHideoutModule' },
          },
          hideoutPartsProgress: {
            type: 'array',
            items: { $ref: '#/components/schemas/ProgressHideoutPart' },
          },
          displayName: { type: 'string' },
          userId: { type: 'string' },
          playerLevel: { type: 'integer', minimum: 1, maximum: 79 },
          gameEdition: { type: 'integer', minimum: 1 },
          pmcFaction: { $ref: '#/components/schemas/PmcFaction' },
        },
        required: [
          'tasksProgress',
          'taskObjectivesProgress',
          'hideoutModulesProgress',
          'hideoutPartsProgress',
          'displayName',
          'userId',
          'playerLevel',
          'gameEdition',
          'pmcFaction',
        ],
      },
      ProgressResponse: {
        type: 'object',
        properties: {
          success: { const: true },
          data: { $ref: '#/components/schemas/ProgressData' },
          meta: { $ref: '#/components/schemas/ProgressMeta' },
        },
        required: ['success', 'data', 'meta'],
        examples: [
          {
            success: true,
            data: {
              tasksProgress: [{ id: 'task-1', complete: true, failed: false, invalid: false }],
              taskObjectivesProgress: [{ id: 'obj-1', complete: true, count: 2, invalid: false }],
              hideoutModulesProgress: [],
              hideoutPartsProgress: [],
              displayName: 'Tracker',
              userId: 'user-uuid',
              playerLevel: 10,
              gameEdition: 1,
              pmcFaction: 'USEC',
            },
            meta: { self: 'user-uuid', gameMode: 'pvp' },
          },
        ],
      },
      TeamProgressResponse: {
        type: 'object',
        properties: {
          success: { const: true },
          data: { type: 'array', items: { $ref: '#/components/schemas/ProgressData' } },
          meta: { $ref: '#/components/schemas/TeamProgressMeta' },
        },
        required: ['success', 'data', 'meta'],
      },
      UpdateLevelResponse: {
        type: 'object',
        properties: {
          success: { const: true },
          data: {
            type: 'object',
            properties: {
              level: { type: 'integer', minimum: 1, maximum: 79 },
              message: { type: 'string' },
            },
            required: ['level', 'message'],
          },
        },
        required: ['success', 'data'],
        examples: [{ success: true, data: { level: 12, message: 'Level updated successfully' } }],
      },
      TaskState: {
        type: 'string',
        enum: ['completed', 'uncompleted', 'failed'],
      },
      TaskUpdateRequest: {
        type: 'object',
        properties: {
          state: { $ref: '#/components/schemas/TaskState' },
        },
        required: ['state'],
        examples: [{ state: 'completed' }],
      },
      BatchTaskUpdateItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          state: { $ref: '#/components/schemas/TaskState' },
        },
        required: ['id', 'state'],
      },
      LegacyTaskUpdateMap: {
        type: 'object',
        additionalProperties: { $ref: '#/components/schemas/TaskState' },
        examples: [{ 'task-1': 'completed', 'task-2': 'failed' }],
      },
      TaskUpdateArray: {
        type: 'array',
        items: { $ref: '#/components/schemas/BatchTaskUpdateItem' },
        examples: [
          [
            { id: 'task-1', state: 'completed' },
            { id: 'task-2', state: 'failed' },
          ],
        ],
      },
      ObjectiveUpdateRequest: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: ['completed', 'uncompleted'] },
          count: { type: 'number' },
        },
        anyOf: [{ required: ['state'] }, { required: ['count'] }],
        examples: [{ state: 'completed' }, { count: 3 }, { state: 'completed', count: 3 }],
      },
      UpdateTaskResponse: {
        type: 'object',
        properties: {
          success: { const: true },
          data: {
            type: 'object',
            properties: {
              taskId: { type: 'string' },
              state: { $ref: '#/components/schemas/TaskState' },
              message: { type: 'string' },
            },
            required: ['taskId', 'state', 'message'],
          },
        },
        required: ['success', 'data'],
        examples: [
          {
            success: true,
            data: { taskId: 'task-1', state: 'completed', message: 'Task updated successfully' },
          },
        ],
      },
      UpdateTasksResponse: {
        type: 'object',
        properties: {
          success: { const: true },
          data: {
            type: 'object',
            properties: {
              updatedTasks: { type: 'array', items: { type: 'string' } },
              message: { type: 'string' },
            },
            required: ['updatedTasks', 'message'],
          },
        },
        required: ['success', 'data'],
        examples: [
          {
            success: true,
            data: {
              updatedTasks: ['task-1', 'task-2'],
              message: 'Tasks updated successfully',
            },
          },
        ],
      },
      UpdateObjectiveResponse: {
        type: 'object',
        properties: {
          success: { const: true },
          data: {
            type: 'object',
            properties: {
              objectiveId: { type: 'string' },
              state: { type: 'string', enum: ['completed', 'uncompleted'] },
              count: { type: 'number' },
              message: { type: 'string' },
            },
            required: ['objectiveId', 'message'],
          },
        },
        required: ['success', 'data'],
        examples: [
          {
            success: true,
            data: {
              objectiveId: 'obj-1',
              state: 'completed',
              count: 2,
              message: 'Task objective updated successfully',
            },
          },
        ],
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['health'],
        summary: 'Gateway health check',
        description: 'Does not require authentication.',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'Healthy response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { const: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        timestamp: { type: 'string' },
                        version: { type: 'string' },
                        service: { type: 'string' },
                      },
                      required: ['status', 'timestamp', 'version', 'service'],
                    },
                  },
                  required: ['success', 'data'],
                },
                examples: {
                  healthy: {
                    value: {
                      success: true,
                      data: {
                        status: 'healthy',
                        timestamp: '2025-01-01T00:00:00.000Z',
                        version: '2.0.0',
                        service: 'tarkovtracker-api',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['docs'],
        summary: 'OpenAPI specification',
        description: 'Returns the OpenAPI 3.1 JSON spec for this gateway.',
        operationId: 'getOpenApiSpec',
        responses: {
          '200': {
            description: 'OpenAPI JSON document',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
    '/docs': {
      get: {
        tags: ['docs'],
        summary: 'API documentation UI',
        description: 'Scalar API reference UI (HTML). Also served at `/` on api.tarkovtracker.org.',
        operationId: 'getDocs',
        responses: {
          '200': {
            description: 'HTML documentation page',
            content: {
              'text/html': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    '/token': {
      get: {
        tags: ['tokens'],
        summary: 'Get token info',
        description:
          'Requires GP permission. Counts against the tiered daily read quota (keyed by user) and the per-minute burst limit.',
        operationId: 'getTokenInfo',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Token info',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TokenInfoResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '503': { $ref: '#/components/responses/ServiceUnavailable' },
        },
      },
    },
    '/progress': {
      get: {
        tags: ['progress'],
        summary: 'Get user progress',
        description:
          'Requires GP permission. Counts against the tiered daily read quota (keyed by user) and the per-minute burst limit.',
        operationId: 'getProgress',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Progress data',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProgressResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '503': { $ref: '#/components/responses/ServiceUnavailable' },
        },
      },
    },
    '/team/progress': {
      get: {
        tags: ['team'],
        summary: 'Get team progress',
        description:
          'Requires TP permission. Counts against the tiered daily read quota (keyed by user) and the per-minute burst limit.',
        operationId: 'getTeamProgress',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Team progress data',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TeamProgressResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '503': { $ref: '#/components/responses/ServiceUnavailable' },
        },
      },
    },
    '/progress/level/{level}': {
      post: {
        tags: ['progress'],
        summary: 'Update player level',
        description:
          'Requires WP permission. Counts against the tiered daily write quota (keyed by user) and the per-minute burst limit.',
        operationId: 'updatePlayerLevel',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'level',
            in: 'path',
            required: true,
            description: 'Player level (1-79).',
            schema: { type: 'integer', minimum: 1, maximum: 79 },
            example: 15,
          },
        ],
        responses: {
          '200': {
            description: 'Level updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateLevelResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '503': { $ref: '#/components/responses/ServiceUnavailable' },
        },
      },
    },
    '/progress/task/{taskId}': {
      post: {
        tags: ['progress'],
        summary: 'Update single task state',
        description:
          'Requires WP permission. Counts against the tiered daily write quota (keyed by user) and the per-minute burst limit.',
        operationId: 'updateTask',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'task-1',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TaskUpdateRequest' },
              examples: {
                complete: { value: { state: 'completed' } },
                failed: { value: { state: 'failed' } },
                uncompleted: { value: { state: 'uncompleted' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Task updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateTaskResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '503': { $ref: '#/components/responses/ServiceUnavailable' },
        },
      },
    },
    '/progress/task/objective/{objectiveId}': {
      post: {
        tags: ['progress'],
        summary: 'Update a task objective',
        description:
          'Requires WP permission. Counts against the tiered daily write quota (keyed by user) and the per-minute burst limit.',
        operationId: 'updateTaskObjective',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'objectiveId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'obj-1',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ObjectiveUpdateRequest' },
              examples: {
                stateOnly: { value: { state: 'completed' } },
                countOnly: { value: { count: 3 } },
                stateAndCount: { value: { state: 'completed', count: 3 } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Objective updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateObjectiveResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '503': { $ref: '#/components/responses/ServiceUnavailable' },
        },
      },
    },
    '/progress/tasks': {
      post: {
        tags: ['progress'],
        summary: 'Batch update tasks',
        description:
          'Requires WP permission. Counts against the tiered daily write quota (keyed by user) and the per-minute burst limit.',
        operationId: 'updateTasksBatch',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/LegacyTaskUpdateMap' },
                  { $ref: '#/components/schemas/TaskUpdateArray' },
                ],
              },
              examples: {
                legacyObject: {
                  value: {
                    'task-1': 'completed',
                    'task-2': 'failed',
                  },
                },
                arrayFormat: {
                  value: [
                    { id: 'task-1', state: 'completed' },
                    { id: 'task-2', state: 'failed' },
                  ],
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tasks updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateTasksResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '429': { $ref: '#/components/responses/RateLimited' },
          '503': { $ref: '#/components/responses/ServiceUnavailable' },
        },
      },
    },
  },
} as const;
export const OPENAPI_JSON = JSON.stringify(OPENAPI_SPEC, null, 2);
