import { describe, expect, it } from 'vitest';
import { ACTIVE_SEASON } from '@/utils/constants';
import {
  isEftBackendLogFileName,
  isEftNotificationLogFileName,
  parseEftLogsForQuestImport,
  parseEftNotificationLogText,
} from '@/utils/eftLogQuestParser';
const seasonStart = Date.parse(ACTIVE_SEASON.startsOn);
const seasonDate = (millis: number) =>
  new Date(millis).toISOString().replace('T', ' ').replace('Z', '');
const seasonDay = new Date(seasonStart + 86400000).toISOString().slice(0, 10);
const completionPayload = (
  eventId: string,
  templateId: string,
  timestamp = '2026-02-21 10:00:00.000'
) => `
${timestamp}|Info|push-notifications|Got notification | ChatMessageReceived
{
  "type": "new_message",
  "eventId": "${eventId}",
  "dialogId": "54cb57776803fa99248b456e",
  "message": {
    "_id": "msg-${eventId}",
    "uid": "54cb57776803fa99248b456e",
    "type": 12,
    "dt": ${Date.parse(timestamp.replace(' ', 'T').replace(/ ([+-])/, '$1') + (/[+-]\d{2}:\d{2}$/.test(timestamp) ? '' : 'Z')) / 1000},
    "text": "quest started",
    "templateId": "${templateId}"
  }
}
`;
const startedPayload = (
  questId = '5ac2426c86f774138762edfe',
  eventId = 'started-event',
  timestamp = '2026-02-21 10:00:00.000'
) => `
${timestamp}|Info|push-notifications|Got notification | ChatMessageReceived
{
  "type": "new_message",
  "eventId": "${eventId}",
  "dialogId": "54cb57776803fa99248b456e",
  "message": {
    "_id": "msg-started",
    "uid": "54cb57776803fa99248b456e",
    "type": 10,
    "dt": ${Date.parse(timestamp.replace(' ', 'T').replace(/ ([+-])/, '$1') + (/[+-]\d{2}:\d{2}$/.test(timestamp) ? '' : 'Z')) / 1000},
    "text": "quest started",
    "templateId": "${questId} description"
  }
}
`;
const backendPayload = (host: string, path: string, timestamp = '2026-02-21 10:00:00.000') =>
  `${timestamp}|Info|backend|---> Request HTTPS, id [1]: URL: https://${host}${path}, crc: .`;
describe('parseEftNotificationLogText', () => {
  it('extracts quest completion events from chat notifications', () => {
    const text =
      completionPayload('event-1', '5ac2426c86f774138762edfe successMessageText') +
      startedPayload();
    const result = parseEftNotificationLogText(text);
    expect(result.chatMessageCount).toBe(2);
    expect(result.completionEventCount).toBe(1);
    expect(result.startedEventCount).toBe(1);
    expect(result.completionEvents).toEqual([
      {
        eventKey: 'event:event-1',
        questId: '5ac2426c86f774138762edfe',
        timestamp: '2026-02-21 10:00:00.000',
        occurredAt: Date.parse('2026-02-21T10:00:00.000Z'),
      },
    ]);
    expect(result.startedEvents).toEqual([
      {
        eventKey: 'event:started-event',
        questId: '5ac2426c86f774138762edfe',
        timestamp: '2026-02-21 10:00:00.000',
        occurredAt: Date.parse('2026-02-21T10:00:00.000Z'),
      },
    ]);
  });
  it('accepts completion template IDs that contain additional suffix tokens', () => {
    const text = completionPayload(
      'event-2',
      '61604635c725987e815b1a46 successMessageText 54cb57776803fa99248b456e 0'
    );
    const result = parseEftNotificationLogText(text);
    expect(result.completionEventCount).toBe(1);
    expect(result.completionEvents[0]?.questId).toBe('61604635c725987e815b1a46');
  });
});
describe('parseEftLogsForQuestImport', () => {
  it('deduplicates by eventId and maps matched/unmatched quest IDs', () => {
    const duplicateEvent = completionPayload(
      'event-1',
      '5ac2426c86f774138762edfe successMessageText'
    );
    const distinctEvent = completionPayload(
      'event-2',
      '61604635c725987e815b1a46 successMessageText'
    );
    const result = parseEftLogsForQuestImport(
      [
        { name: 'a notifications.log', text: duplicateEvent + distinctEvent },
        { name: 'b notifications.log', text: duplicateEvent },
        { name: 'c notifications.log', text: startedPayload() },
      ],
      ['61604635c725987e815b1a46']
    );
    expect(result.chatMessageCount).toBe(4);
    expect(result.completionEventCount).toBe(3);
    expect(result.startedEventCount).toBe(1);
    expect(result.dedupedCompletionEventCount).toBe(2);
    expect(result.dedupedStartedEventCount).toBe(1);
    expect(result.matchedTaskIds).toEqual(['61604635c725987e815b1a46']);
    expect(result.matchedStartedTaskIds).toEqual([]);
    expect(result.matchedTaskIdsByMode.pvp).toEqual([]);
    expect(result.matchedTaskIdsByMode.pve).toEqual([]);
    expect(result.matchedTaskIdsByMode.unknown).toEqual(['61604635c725987e815b1a46']);
    expect(result.unmatchedQuestIds).toEqual(['5ac2426c86f774138762edfe']);
    expect(result.unmatchedStartedQuestIds).toEqual([]);
  });
  it('routes matched tasks into detected PvP and PvE mode buckets by session', () => {
    const pvpQuestId = '61604635c725987e815b1a46';
    const pveQuestId = '5ac2426c86f774138762edfe';
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'Logs/log_2026.02.21_A/2026.02.21 notifications.log',
          text: completionPayload('pvp-event', `${pvpQuestId} successMessageText`),
        },
        {
          name: 'Logs/log_2026.02.21_A/2026.02.21_backend.log',
          text: backendPayload('prod-01.escapefromtarkov.com', '/client/quest/list'),
        },
        {
          name: 'Logs/log_2026.02.21_B/push-notifications_000.log',
          text: completionPayload('pve-event', `${pveQuestId} successMessageText`),
        },
        {
          name: 'Logs/log_2026.02.21_B/backend_000.log',
          text: backendPayload('gw-pve-03.escapefromtarkov.com', '/client/quest/list'),
        },
      ],
      [pvpQuestId, pveQuestId]
    );
    expect(result.matchedTaskIdsByMode.pvp).toEqual([pvpQuestId]);
    expect(result.matchedTaskIdsByMode.pve).toEqual([pveQuestId]);
    expect(result.matchedTaskIdsByMode.unknown).toEqual([]);
  });
  it('resolves mixed sessions by assigning mode from the latest prior backend signal timestamp', () => {
    const firstInLineQuestId = '657315ddab5a49b71f098853';
    const shortageQuestId = '5967733e86f774602332fc84';
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'Logs/log_2025.11.15_8-46-08_1.0.0.0.41760/push-notifications_000.log',
          text:
            startedPayload(firstInLineQuestId, 'evt-1', '2025-11-15 10:09:23.692') +
            completionPayload(
              'evt-2',
              `${firstInLineQuestId} successMessageText`,
              '2025-11-15 11:26:39.311'
            ) +
            startedPayload(shortageQuestId, 'evt-3', '2025-11-15 11:26:42.189'),
        },
        {
          name: 'Logs/log_2025.11.15_8-46-08_1.0.0.0.41760/backend_000.log',
          text: [
            backendPayload(
              'gw-pve-01.escapefromtarkov.com',
              '/client/game/start',
              '2025-11-15 08:46:17.329'
            ),
            backendPayload(
              'gw-pve-03.escapefromtarkov.com',
              '/client/checkVersion',
              '2025-11-15 08:46:53.093'
            ),
            backendPayload(
              'prod-01.escapefromtarkov.com',
              '/client/quest/list',
              '2025-11-15 08:47:02.385'
            ),
            backendPayload(
              'prod-01.escapefromtarkov.com',
              '/client/game/profile/items/moving',
              '2025-11-15 11:26:39.149'
            ),
          ].join('\n'),
        },
      ],
      [firstInLineQuestId, shortageQuestId]
    );
    expect(result.matchedTaskIdsByMode.pvp).toEqual([firstInLineQuestId]);
    expect(result.matchedTaskIdsByMode.pve).toEqual([]);
    expect(result.matchedTaskIdsByMode.unknown).toEqual([]);
    expect(result.matchedStartedTaskIdsByMode.pvp).toEqual([shortageQuestId]);
    expect(result.matchedStartedTaskIdsByMode.pve).toEqual([]);
    expect(result.matchedStartedTaskIdsByMode.unknown).toEqual([]);
  });
  it('supports filtering by included log versions', () => {
    const oldQuestId = '61604635c725987e815b1a46';
    const newQuestId = '5ac2426c86f774138762edfe';
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'Logs/log_2025.07.17_20-43-24_0.16.8.1.38114/2025.07.17 notifications.log',
          text: completionPayload('old-event', `${oldQuestId} successMessageText`),
        },
        {
          name: 'Logs/log_2026.01.12_20-00-15_1.0.1.0.42625/2026.01.12 push-notifications_000.log',
          text: completionPayload('new-event', `${newQuestId} successMessageText`),
        },
      ],
      [oldQuestId, newQuestId],
      {
        includedVersions: ['0.16.8.1.38114'],
      }
    );
    expect(result.availableVersions).toEqual(['1.0.1.0.42625', '0.16.8.1.38114']);
    expect(result.includedVersions).toEqual(['0.16.8.1.38114']);
    expect(result.matchedTaskIds).toEqual([oldQuestId]);
  });
});
describe('isEftNotificationLogFileName', () => {
  it('matches legacy and modern notification log file names', () => {
    expect(isEftNotificationLogFileName('2025.07.09 notifications.log')).toBe(true);
    expect(isEftNotificationLogFileName('push-notifications_000.log')).toBe(true);
    expect(
      isEftNotificationLogFileName('2026.01.12_20-00-15_1.0.1.0.42625 push-notifications_000.log')
    ).toBe(true);
    expect(isEftNotificationLogFileName('backend_000.log')).toBe(false);
  });
});
describe('isEftBackendLogFileName', () => {
  it('matches legacy and modern backend log file names', () => {
    expect(isEftBackendLogFileName('2025.07.09_22-40-53_backend.log')).toBe(true);
    expect(isEftBackendLogFileName('backend_000.log')).toBe(true);
    expect(isEftBackendLogFileName('2025.11.24_11-09-15_1.0.0.1.41967 backend_000.log')).toBe(true);
    expect(isEftBackendLogFileName('backend_queue.log')).toBe(false);
    expect(isEftBackendLogFileName('push-notifications_000.log')).toBe(false);
  });
});
describe('documented log formats and state history', () => {
  const quest = '61604635c725987e815b1a46';
  const day = seasonDay;
  const event = (id: string, type: number, time = `${day} 10:00:00.000`) =>
    completionPayload(id, `${quest} successMessageText`, time).replace(
      '"type": 12',
      `"type": ${type}`
    );
  it.each([
    '0.16.8.0.37972',
    '0.16.8.1.38114',
    '0.16.9.5.40743',
    '1.0.0.0.41760',
    '1.0.0.1.41837',
    '1.0.0.1.41967',
    '1.0.0.2.42157',
    '1.0.0.5.42334',
    '1.0.1.0.42625',
    '1.0.1.1.42751',
    '1.0.2.0.43037',
    '1.0.2.5.43579',
    '1.0.4.0.44005',
    '1.0.4.1.44236',
    '1.0.4.6.44802',
    '1.0.4.9.45133',
    '1.0.5.0.45272',
    '1.0.5.0.45383',
    '1.0.5.0.45436',
    '1.0.5.0.45464',
    '1.0.5.0.45581',
    '1.0.6.0.46010',
    '1.0.6.5.46189',
    '1.0.6.5.46221',
    '1.1.0.0.46608',
    '1.1.0.0.46624',
    '1.1.0.0.46657',
    '1.1.0.1.46777',
    '1.1.0.1.46911',
  ])('reads a versioned notification envelope for %s', (version) => {
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'push-notifications.log',
          text: event('event', 12).replace('|Info|', `|${version}|Info|`),
        },
      ],
      [quest]
    );
    expect(result.availableVersions).toEqual([version]);
    expect(result.matchedTaskIds).toEqual([quest]);
  });
  it.each([
    'gw-pvp-season-01',
    'gw-pvp_season',
    'wsn-pvp_season',
    'wsn-pvp-season-01',
    'gw-pvp-01',
    'wsn-pvp-01',
    'gw-pve-01',
    'wsn-pve-01',
  ])('routes %s using explicit gateways', (host) => {
    const notification = host.startsWith('wsn');
    const signal = notification
      ? `${day} 09:59:00.000|Info|push-notifications|Opening wss://${host}.escapefromtarkov.com/connection`
      : backendPayload(`${host}.escapefromtarkov.com`, '/client/quest/list', `${day} 09:59:00.000`);
    const result = parseEftLogsForQuestImport(
      [
        { name: 'backend.log', text: notification ? '' : signal },
        { name: 'push-notifications.log', text: (notification ? signal : '') + event('event', 12) },
      ],
      [quest]
    );
    const mode = host.includes('season') ? 'seasonal' : host.includes('pve') ? 'pve' : 'pvp';
    expect(result.matchedTaskIdsByMode[mode]).toEqual([quest]);
    expect(result.matchedTaskIdsByMode.unknown).toEqual([]);
  });
  it('routes mode switches from application and output, excluding delayed backend responses', () => {
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'application.log',
          text: `${day} 09:00:00.000|Info|application|Session mode: Regular\n${day} 11:00:00.000|Info|application|Session mode: PvpSeason`,
        },
        { name: 'output_000.log', text: `${day} 13:00:00.000|Info|output|Session mode: Pve` },
        {
          name: 'backend.log',
          text: `${day} 11:30:00.000|Info|backend|<--- Response HTTPS, id [1]: URL: https://gw-pve-01.escapefromtarkov.com/client/quest/list`,
        },
        {
          name: 'notifications.log',
          text:
            event('regular', 12) +
            event('season', 10, `${day} 12:00:00.000`) +
            event('pve', 11, `${day} 14:00:00.000`),
        },
      ],
      [quest]
    );
    expect(result.matchedTaskIdsByMode.pvp).toEqual([quest]);
    expect(result.matchedStartedTaskIdsByMode.seasonal).toEqual([quest]);
    expect(result.matchedFailedTaskIdsByMode.pve).toEqual([quest]);
  });
  it('ignores malformed mode timestamps while retaining valid earlier signals', () => {
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'application.log',
          text: `2024-13-01 00:00:00.000|Info|application|Session mode: PvpSeason\n${day} 09:00:00.000|Info|application|Session mode: Pve`,
        },
        { name: 'notifications.log', text: event('event', 12) },
      ],
      [quest]
    );
    expect(result.matchedTaskIdsByMode.pve).toEqual([quest]);
    expect(result.matchedTaskIdsByMode.unknown).toEqual([]);
  });
  it('does not apply future mode signals to preceding events', () => {
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'backend.log',
          text: backendPayload(
            'gw-pve-01.escapefromtarkov.com',
            '/client/quest/list',
            `${day} 11:00:00.000`
          ),
        },
        { name: 'notifications.log', text: event('event', 12) },
      ],
      [quest]
    );
    expect(result.matchedTaskIdsByMode.unknown).toEqual([quest]);
  });
  it('orders offset timestamps by instant, including mixed record envelopes', () => {
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'backend.log',
          text: backendPayload(
            'gw-pve-01.escapefromtarkov.com',
            '/client/quest/list',
            `${day} 10:00:00.000 +03:00`
          ),
        },
        { name: 'notifications.log', text: event('event', 12, `${day} 08:00:00.000 +00:00`) },
      ],
      [quest]
    );
    expect(result.matchedTaskIdsByMode.pve).toEqual([quest]);
  });
  it('keeps individually selected timestamped files in separate sessions', () => {
    const prefixA = `${day.replaceAll('-', '.')}_09-00-00_1.1.0.1.46911`;
    const prefixB = `${day.replaceAll('-', '.')}_09-30-00_1.1.0.1.46911`;
    const result = parseEftLogsForQuestImport(
      [
        {
          name: `${prefixA} backend.log`,
          text: backendPayload(
            'gw-pvp-season-01.escapefromtarkov.com',
            '/client/quest/list',
            `${day} 09:00:00.000`
          ),
        },
        {
          name: `${prefixB} backend.log`,
          text: backendPayload(
            'gw-pve-01.escapefromtarkov.com',
            '/client/quest/list',
            `${day} 09:30:00.000`
          ),
        },
        { name: `${prefixA} notifications.log`, text: event('same-id', 12) },
        { name: `${prefixB} notifications.log`, text: event('same-id', 12) },
      ],
      [quest]
    );
    expect(result.versionSessionCounts['1.1.0.1.46911']).toBe(2);
    expect(result.matchedTaskIdsByMode.seasonal).toEqual([quest]);
    expect(result.matchedTaskIdsByMode.pve).toEqual([quest]);
    expect(result.dedupedCompletionEventCount).toBe(2);
  });
  it('ignores Arena filenames and folders', () => {
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'Logs/log_arena_2026.08.29_09-00-00_0.4.2.5.42886/notifications.log',
          text: event('arena', 12),
        },
        { name: 'arena_2026.08.29 notifications.log', text: event('arena-flat', 12) },
      ],
      [quest]
    );
    expect(result.filesParsed).toBe(0);
  });
  it('recovers after truncated JSON without consuming the next record', () => {
    const broken = `${day} 09:00:00.000|Info|notifications|Got notification | ChatMessageReceived\n{"message": {\n`;
    const result = parseEftNotificationLogText(broken + event('valid', 12));
    expect(result.parseErrorCount).toBe(1);
    expect(result.completionEventCount).toBe(1);
  });
  it('does not borrow a different notification body or parse quest-shaped user text', () => {
    const text = `${day} 09:00:00.000|Info|notifications|Got notification | ChatMessageReceived\n${day} 09:01:00.000|Info|notifications|Got notification | UserConfirmed\n{"message":{"type":12,"templateId":"${quest} successMessageText"}}\n`;
    expect(parseEftNotificationLogText(text).completionEventCount).toBe(0);
    expect(parseEftNotificationLogText(event('chat', 1)).completionEventCount).toBe(0);
  });
  it('uses the latest quest state independent of file order, including failure and restart', () => {
    const files = [
      { name: 'a notifications.log', text: event('restart', 10, `${day} 12:00:00.000`) },
      {
        name: 'b notifications.log',
        text: event('fail', 11, `${day} 11:00:00.000`) + event('start', 10),
      },
    ];
    for (const input of [files, [...files].reverse()]) {
      const result = parseEftLogsForQuestImport(input, [quest]);
      expect(result.dedupedFailedEventCount).toBe(1);
      expect(result.matchedStartedTaskIds).toEqual([quest]);
      expect(result.matchedFailedTaskIds).toEqual([]);
    }
  });
  it('excludes Seasonal history before the active season and at its end boundary', () => {
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'backend.log',
          text: backendPayload(
            'gw-pvp-season-01.escapefromtarkov.com',
            '/client/quest/list',
            seasonDate(seasonStart - 86400000)
          ),
        },
        {
          name: 'notifications.log',
          text:
            event('old', 12, seasonDate(seasonStart - 1)) +
            event('start-boundary', 10, seasonDate(seasonStart)) +
            event('end', 12, seasonDate(Date.parse(ACTIVE_SEASON.endsAt))) +
            event('current', 10),
        },
      ],
      [quest]
    );
    expect(result.skippedSeasonalEventCount).toBe(2);
    expect(result.dedupedStartedEventCount).toBe(2);
    expect(result.matchedTaskIds).toEqual([]);
    expect(result.matchedStartedTaskIdsByMode.seasonal).toEqual([quest]);
  });
});
describe('notification replays', () => {
  const quest = '61604635c725987e815b1a46';
  const notification = (id: string, type: number, original: string, received: string) =>
    `${received}|Info|notifications|Got notification | ChatMessageReceived\n${JSON.stringify({ eventId: id, message: { type, templateId: quest, dt: Date.parse(original) / 1000 } })}\n`;
  it('does not let a replayed completion override a later restart', () => {
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'notifications.log',
          text:
            notification('old', 12, '2026-08-29T09:00:00Z', '2026-08-29 12:00:00.000') +
            notification('restart', 10, '2026-08-29T11:00:00Z', '2026-08-29 11:00:00.000'),
        },
      ],
      [quest]
    );
    expect(result.matchedTaskIds).toEqual([]);
    expect(result.matchedStartedTaskIds).toEqual([quest]);
  });
  it('rejects a prior-season message replayed during the active season', () => {
    const result = parseEftLogsForQuestImport(
      [
        {
          name: 'application.log',
          text: `${seasonDay} 08:00:00.000|Info|application|Session mode: PvpSeason`,
        },
        {
          name: 'notifications.log',
          text: notification(
            'old',
            12,
            new Date(seasonStart - 86400000).toISOString(),
            `${seasonDay} 12:00:00.000`
          ),
        },
      ],
      [quest]
    );
    expect(result.skippedSeasonalEventCount).toBe(1);
    expect(result.matchedTaskIds).toEqual([]);
  });
});
