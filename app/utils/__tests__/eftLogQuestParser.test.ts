import { describe, expect, it } from 'vitest';
import {
  isEftBackendLogFileName,
  isEftNotificationLogFileName,
  parseEftLogsForQuestImport,
  parseEftNotificationLogText,
} from '@/utils/eftLogQuestParser';
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
    "dt": 1764602065,
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
    "dt": 1764602065,
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
      },
    ]);
    expect(result.startedEvents).toEqual([
      {
        eventKey: 'event:started-event',
        questId: '5ac2426c86f774138762edfe',
        timestamp: '2026-02-21 10:00:00.000',
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
    expect(result.unmatchedStartedQuestIds).toEqual(['5ac2426c86f774138762edfe']);
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
    expect(result.matchedStartedTaskIdsByMode.pvp).toEqual([shortageQuestId, firstInLineQuestId]);
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
