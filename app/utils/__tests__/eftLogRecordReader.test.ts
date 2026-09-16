import { describe, expect, it } from 'vitest';
import { createEftLogFileParser, parseEftLogsForQuestImport } from '@/utils/eftLogQuestParser';
const QUEST = '657315ddab5a49b71f098853';
const text = `2026-09-10 10:00:00.000|1.1.0.1.46911|Info|notifications|Connected to wss://wsn-pve-01.escapefromtarkov.com/
2026-09-10 10:00:01.000|1.1.0.1.46911|Info|push-notifications|Got notification | ChatMessageReceived
{
  "eventId": "event-😀",
  "message": { "type": 12, "templateId": "${QUEST} successMessageText" }
}
2026-09-10 10:00:02.000|1.1.0.1.46911|Info|push-notifications|Got notification | ChatMessageReceived
{"broken":
2026-09-10 10:00:03.000|1.1.0.1.46911|Info|output|Last record without trailing newline`;
describe('incremental EFT log records', () => {
  it.each([1, 7, 31, 64, 256])(
    'preserves headers, multiline JSON, and version/mode evidence across %i-character chunks',
    (size) => {
      const parser = createEftLogFileParser('notifications.log');
      for (let offset = 0; offset < text.length; offset += size)
        parser.push(text.slice(offset, offset + size));
      const streamed = parseEftLogsForQuestImport([parser.finish()], [QUEST]);
      expect(streamed).toEqual(
        parseEftLogsForQuestImport([{ name: 'notifications.log', text }], [QUEST])
      );
      expect(streamed.matchedTaskIdsByMode.pve).toEqual([QUEST]);
      expect(streamed.parseErrorCount).toBe(1);
      expect(streamed.events[0]?.eventKey).toBe('event:event-😀');
    }
  );
});
