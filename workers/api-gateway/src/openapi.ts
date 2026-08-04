export const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'TarkovTracker API Gateway',
    version: '2.5.0',
    description:
      'Public API gateway for TarkovTracker progress, team progress, and token info.\n\n' +
      'Authentication: Send API tokens in the Authorization header as `Bearer <token>`.\n' +
      "Tokens use prefixes `PVP_`, `PVE_`, or `SEASONAL_`, which must match the token's game mode; " +
      'a mismatched token is rejected with 401. The token game mode alone decides which ' +
      'progress data is read or written. Legacy `tt_` tokens are no longer accepted.\n\n' +
      'Rate limits: tiered daily quotas keyed by user account (free: 1,000 reads/day and ' +
      '100 writes/day; supporter tiers scale up), resetting at 00:00 UTC. A pre-authentication ' +
      'IP abuse gate (Cloudflare Workers Rate Limiting binding) shields token validation from ' +
      'floods and returns its own `429` with only `Retry-After`. ' +
      'Authenticated responses that reach the daily quota include `X-RateLimit-Limit`, ' +
      '`X-RateLimit-Remaining`, and `X-RateLimit-Reset` (unix seconds); daily-quota `429` ' +
      'responses add `Retry-After` (seconds), so clients should queue and retry after that ' +
      'delay rather than busy-looping. Throttled requests do not consume the daily quota. ' +
      'If the daily-quota service is temporarily unavailable the gateway fails open and ' +
      'serves the request without rate-limit headers.\n\n' +
      'Conditional requests & polling: `GET /progress` and `GET /team/progress` return a weak ' +
      '`ETag` and honor `If-None-Match` with `304 Not Modified` (empty body; rate-limit headers ' +
      'included only when the daily-quota service is available — on the fail-open path they are ' +
      'omitted). Responses are gzip-compressed when the request sends `Accept-Encoding: gzip` ' +
      'and the body is at least 1 KiB; an explicit `gzip;q=0` is honored as a refusal. If the ' +
      'client accepts gzip but refuses identity (`identity;q=0`), even sub-1 KiB bodies are ' +
      'gzipped since uncompressed is not acceptable; if no acceptable encoding remains the ' +
      'gateway returns `406`. Poll read endpoints at 60-second intervals or slower and always ' +
      'send the previous `ETag` so unchanged progress costs almost no bandwidth. A `304` still ' +
      'counts against the daily quota.\n\n' +
      'Token cap: each account may have at most 3 active API tokens. Revoke an existing ' +
      'token before creating a new one if the cap is reached. Token creation is only ' +
      'allowed through the token-create Edge Function and is rate-limited to 3/hour.\n\n' +
      'User-Agent: a 5-200 character User-Agent header identifying the client application ' +
      'is required on protected API endpoints (token, progress, team). Infrastructure routes ' +
      '(/health, /openapi.json, /docs, /robots.txt) are exempt. Requests outside that range ' +
      'are rejected with 400. Use a descriptive string like "AppName/1.0 (+https://your-app.com)".\n\n' +
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
    parameters: {
      UserAgentHeader: {
        name: 'User-Agent',
        in: 'header',
        required: true,
        description:
          'A 5-200 character User-Agent identifying the client application, ' +
          'e.g. "RatScanner/2.1 (+https://ratscanner.io)". ' +
          'Requests outside that range are rejected with 400.',
        schema: { type: 'string', minLength: 5, maxLength: 200 },
        example: 'RatScanner/2.1 (+https://ratscanner.io)',
      },
      IfNoneMatchHeader: {
        name: 'If-None-Match',
        in: 'header',
        required: false,
        description:
          'The ETag from a previous response. When the payload is unchanged the gateway ' +
          'answers 304 Not Modified with an empty body. Polling clients should always send this.',
        schema: { type: 'string' },
        example: 'W/"0b661a2f5c3d9e14a7b8c0d1e2f30456"',
      },
    },
    headers: {
      ETag: {
        description:
          'Weak validator (SHA-256, first 16 bytes) for the response payload. ' +
          'Send it back in `If-None-Match` to receive a `304` when nothing changed.',
        schema: { type: 'string' },
      },
      ReadCacheControl: {
        description:
          'Always `private, max-age=15` for token-scoped reads. `private` prevents ' +
          'shared/edge caches from storing authenticated progress.',
        schema: { type: 'string' },
      },
      ReadVary: {
        description: 'Cache variant dimensions. Always `Accept-Encoding, Authorization, Origin`.',
        schema: { type: 'string' },
      },
      ContentEncoding: {
        description:
          'Present and set to `gzip` when the response body is gzip-compressed ' +
          '(payload >= 1 KiB and the client accepts gzip, or any size when the client accepts ' +
          'gzip but refused identity). Absent when the body is uncompressed.',
        schema: { type: 'string', enum: ['gzip'] },
      },
      RateLimitLimit: {
        description:
          'Maximum requests permitted per UTC day for the account tier. Present only when ' +
          'the daily-quota service is available.',
        schema: { type: 'integer', minimum: 1 },
      },
      RateLimitRemaining: {
        description:
          'Requests remaining in the daily quota. Present only when the daily-quota ' +
          'service is available.',
        schema: { type: 'integer', minimum: 0 },
      },
      RateLimitReset: {
        description:
          'Unix timestamp (seconds) when the daily quota resets (00:00 UTC). Present only ' +
          'when the daily-quota service is available.',
        schema: { type: 'integer', minimum: 0 },
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
              invalidUserAgent: {
                summary: 'Missing or invalid User-Agent header',
                value: {
                  success: false,
                  error:
                    'User-Agent must be 5-200 characters (e.g. "AppName/1.0 (+https://your-app.com)")',
                },
              },
            },
          },
        },
      },
      RateLimited: {
        description:
          'Rate limit exceeded (tiered daily quota, or the pre-authentication IP abuse gate). ' +
          'Daily-quota `429` responses include the `X-RateLimit-*` headers below; abuse-gate ' +
          '`429` responses are pre-authentication and include only `Retry-After`.',
        headers: {
          'Retry-After': {
            description:
              'Seconds the client should wait before retrying (until the daily quota resets at 00:00 UTC, or the abuse-gate period elapses).',
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
      NotModified: {
        description:
          'Payload unchanged since the ETag in If-None-Match. Empty body. The request still ' +
          'counts against the daily quota. `ETag`, `Cache-Control`, and `Vary` are always ' +
          'present; the `X-RateLimit-*` headers are present only when the daily-quota service ' +
          'is available (on the fail-open path they are omitted).',
        headers: {
          ETag: {
            description: 'Weak validator for the unchanged payload. Reuse it on the next poll.',
            schema: { type: 'string' },
          },
          'Cache-Control': {
            description: 'Always `private, max-age=15` for token-scoped reads.',
            schema: { type: 'string' },
          },
          Vary: { $ref: '#/components/headers/ReadVary' },
          'X-RateLimit-Limit': { $ref: '#/components/headers/RateLimitLimit' },
          'X-RateLimit-Remaining': { $ref: '#/components/headers/RateLimitRemaining' },
          'X-RateLimit-Reset': { $ref: '#/components/headers/RateLimitReset' },
        },
      },
      NotAcceptable: {
        description:
          'The client refused every encoding the gateway can produce (gzip and identity, ' +
          'e.g. `Accept-Encoding: gzip;q=0, identity;q=0`). No response body encoding is ' +
          'acceptable. The request was admitted and counts against the daily quota, so the ' +
          '`X-RateLimit-*` headers are present when the daily-quota service is available ' +
          '(omitted on the fail-open path). The rejection depends on `Accept-Encoding`, so ' +
          '`Vary` is included.',
        headers: {
          Vary: { $ref: '#/components/headers/ReadVary' },
          'X-RateLimit-Limit': { $ref: '#/components/headers/RateLimitLimit' },
          'X-RateLimit-Remaining': { $ref: '#/components/headers/RateLimitRemaining' },
          'X-RateLimit-Reset': { $ref: '#/components/headers/RateLimitReset' },
        },
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            examples: {
              noAcceptableEncoding: {
                value: { success: false, error: 'no_acceptable_encoding' },
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
        enum: ['pvp', 'pve', 'seasonal'],
        description:
          '`seasonal` addresses the active numbered PvP season; it is isolated from persistent PvP.',
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
            token: 'PVP_deadbeefcafefeed01',
            owner: 'user-uuid',
            note: 'RatScanner',
            calls: 12,
            gameMode: 'pvp',
          },
          {
            success: true,
            permissions: ['GP'],
            token: 'SEASONAL_deadbeefcafefeed01',
            owner: 'user-uuid',
            note: 'Season 1 overlay',
            calls: 4,
            gameMode: 'seasonal',
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
          'Requires GP permission. Counts against the tiered daily read quota (keyed by user).',
        operationId: 'getTokenInfo',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/UserAgentHeader' }],
        responses: {
          '200': {
            description: 'Token info',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TokenInfoResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/progress': {
      get: {
        tags: ['progress'],
        summary: 'Get user progress',
        description:
          'Requires GP permission. Counts against the tiered daily read quota (keyed by user). ' +
          'Returns a weak ETag; send If-None-Match to receive 304 when unchanged. Poll at >=60s intervals.',
        operationId: 'getProgress',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/UserAgentHeader' },
          { $ref: '#/components/parameters/IfNoneMatchHeader' },
        ],
        responses: {
          '200': {
            description: 'Progress data',
            headers: {
              ETag: { $ref: '#/components/headers/ETag' },
              'Cache-Control': { $ref: '#/components/headers/ReadCacheControl' },
              Vary: { $ref: '#/components/headers/ReadVary' },
              'Content-Encoding': { $ref: '#/components/headers/ContentEncoding' },
              'X-RateLimit-Limit': { $ref: '#/components/headers/RateLimitLimit' },
              'X-RateLimit-Remaining': { $ref: '#/components/headers/RateLimitRemaining' },
              'X-RateLimit-Reset': { $ref: '#/components/headers/RateLimitReset' },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProgressResponse' },
              },
            },
          },
          '304': { $ref: '#/components/responses/NotModified' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '406': { $ref: '#/components/responses/NotAcceptable' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/team/progress': {
      get: {
        tags: ['team'],
        summary: 'Get team progress',
        description:
          'Requires TP permission. Counts against the tiered daily read quota (keyed by user). ' +
          'Returns a weak ETag; send If-None-Match to receive 304 when unchanged. Poll at >=60s intervals.',
        operationId: 'getTeamProgress',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/UserAgentHeader' },
          { $ref: '#/components/parameters/IfNoneMatchHeader' },
        ],
        responses: {
          '200': {
            description: 'Team progress data',
            headers: {
              ETag: { $ref: '#/components/headers/ETag' },
              'Cache-Control': { $ref: '#/components/headers/ReadCacheControl' },
              Vary: { $ref: '#/components/headers/ReadVary' },
              'Content-Encoding': { $ref: '#/components/headers/ContentEncoding' },
              'X-RateLimit-Limit': { $ref: '#/components/headers/RateLimitLimit' },
              'X-RateLimit-Remaining': { $ref: '#/components/headers/RateLimitRemaining' },
              'X-RateLimit-Reset': { $ref: '#/components/headers/RateLimitReset' },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TeamProgressResponse' },
              },
            },
          },
          '304': { $ref: '#/components/responses/NotModified' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '406': { $ref: '#/components/responses/NotAcceptable' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/progress/level/{level}': {
      post: {
        tags: ['progress'],
        summary: 'Update player level',
        description:
          'Requires WP permission. Counts against the tiered daily write quota (keyed by user).',
        operationId: 'updatePlayerLevel',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/UserAgentHeader' },
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
        },
      },
    },
    '/progress/task/{taskId}': {
      post: {
        tags: ['progress'],
        summary: 'Update single task state',
        description:
          'Requires WP permission. Counts against the tiered daily write quota (keyed by user).',
        operationId: 'updateTask',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/UserAgentHeader' },
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
        },
      },
    },
    '/progress/task/objective/{objectiveId}': {
      post: {
        tags: ['progress'],
        summary: 'Update a task objective',
        description:
          'Requires WP permission. Counts against the tiered daily write quota (keyed by user).',
        operationId: 'updateTaskObjective',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/UserAgentHeader' },
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
        },
      },
    },
    '/progress/tasks': {
      post: {
        tags: ['progress'],
        summary: 'Batch update tasks',
        description:
          'Requires WP permission. Counts against the tiered daily write quota (keyed by user).',
        operationId: 'updateTasksBatch',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/UserAgentHeader' }],
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
        },
      },
    },
  },
} as const;
export const OPENAPI_JSON = JSON.stringify(OPENAPI_SPEC, null, 2);
