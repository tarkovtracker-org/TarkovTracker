import { GAME_MODES, type GameMode } from '@/utils/constants';
const CHAT_MESSAGE_MARKER = 'Got notification | ChatMessageReceived';
const QUEST_COMPLETION_TEMPLATE_SUFFIX = 'successMessageText';
const QUEST_STARTED_TEMPLATE_SUFFIX = 'description';
const BACKEND_URL_PATTERN =
  /https?:\/\/([A-Za-z0-9.-]+\.escapefromtarkov\.com)(\/[A-Za-z0-9_./-]*)?/g;
const LOG_LINE_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/;
const SESSION_VERSION_PATTERN = /(?:^|[_\s-])(\d+\.\d+\.\d+\.\d+\.\d+)(?=$|[_\s-])/;
const UNKNOWN_MODE = 'unknown' as const;
export const UNKNOWN_LOG_VERSION = 'unknown';
export type EftQuestEventMode = GameMode | typeof UNKNOWN_MODE;
export interface EftLogInputFile {
  name: string;
  text: string;
}
export interface EftQuestEvent {
  eventKey: string;
  questId: string;
  timestamp: string | null;
}
export interface EftLogTextParseResult {
  chatMessageCount: number;
  completionEventCount: number;
  startedEventCount: number;
  completionEvents: EftQuestEvent[];
  startedEvents: EftQuestEvent[];
  parseErrorCount: number;
}
export interface EftQuestImportPreview {
  chatMessageCount: number;
  completionEventCount: number;
  startedEventCount: number;
  dedupedCompletionEventCount: number;
  dedupedStartedEventCount: number;
  filesParsed: number;
  matchedTaskIds: string[];
  matchedTaskIdsByMode: Record<EftQuestEventMode, string[]>;
  matchedStartedTaskIds: string[];
  matchedStartedTaskIdsByMode: Record<EftQuestEventMode, string[]>;
  questIds: string[];
  startedQuestIds: string[];
  unmatchedQuestIds: string[];
  unmatchedStartedQuestIds: string[];
  availableVersions: string[];
  includedVersions: string[];
  versionSessionCounts: Record<string, number>;
}
export interface ParseEftLogsForQuestImportOptions {
  includedVersions?: Iterable<string> | null;
}
interface ChatMessagePayload {
  eventId?: unknown;
  message?: {
    _id?: unknown;
    dt?: unknown;
    templateId?: unknown;
    type?: unknown;
  };
}
interface JsonBlock {
  end: number;
  text: string;
}
interface BackendModeSignal {
  mode: GameMode;
  timestamp: string;
}
interface BackendModeSignals {
  hasPveSignal: boolean;
  hasPvpSignal: boolean;
  timeline: BackendModeSignal[];
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readJsonBlock(text: string, start: number): JsonBlock | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          end: index + 1,
          text: text.slice(start, index + 1),
        };
      }
    }
  }
  return null;
}
function extractQuestId(templateId: string, expectedSuffix: string): string | null {
  const parts = templateId.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const [questId, suffix] = parts;
  if (!questId || suffix !== expectedSuffix) return null;
  return questId;
}
function buildEventKey(payload: ChatMessagePayload, questId: string): string {
  if (typeof payload.eventId === 'string' && payload.eventId.trim().length > 0) {
    return `event:${payload.eventId.trim()}`;
  }
  const message = payload.message;
  const messageId = typeof message?._id === 'string' ? message._id : '';
  const dt = typeof message?.dt === 'number' && Number.isFinite(message.dt) ? message.dt : -1;
  return `fallback:${messageId}:${dt}:${questId}`;
}
function toChatMessagePayload(value: unknown): ChatMessagePayload | null {
  if (!isPlainObject(value)) return null;
  if (!isPlainObject(value.message)) return null;
  return value as unknown as ChatMessagePayload;
}
function toSessionKey(fileName: string): string {
  const normalized = fileName.replaceAll('\\', '/').toLowerCase();
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex === -1) return '__root__';
  return normalized.slice(0, slashIndex);
}
function extractLogLineTimestamp(text: string): string | null {
  const match = text.match(LOG_LINE_TIMESTAMP_PATTERN);
  if (!match) return null;
  return match[1] ?? null;
}
function extractLogLineTimestampAtIndex(text: string, index: number): string | null {
  const lineStartIndex = text.lastIndexOf('\n', index);
  const lineStart = lineStartIndex === -1 ? 0 : lineStartIndex + 1;
  const lineEndIndex = text.indexOf('\n', index);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const line = text.slice(lineStart, lineEnd);
  return extractLogLineTimestamp(line);
}
function extractSessionVersion(value: string): string | null {
  const normalized = value.replaceAll('\\', '/').toLowerCase();
  const match = normalized.match(SESSION_VERSION_PATTERN);
  if (!match) return null;
  const version = match[1]?.trim();
  if (!version) return null;
  return version;
}
function parseVersionParts(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length < 2) return null;
  const parsed = parts.map((part) => Number.parseInt(part, 10));
  if (parsed.some((part) => Number.isNaN(part) || part < 0)) return null;
  return parsed;
}
function compareVersionKeys(left: string, right: string): number {
  if (left === right) return 0;
  if (left === UNKNOWN_LOG_VERSION) return 1;
  if (right === UNKNOWN_LOG_VERSION) return -1;
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  if (!leftParts && !rightParts) return left.localeCompare(right);
  if (!leftParts) return 1;
  if (!rightParts) return -1;
  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index++) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart === rightPart) continue;
    return rightPart - leftPart;
  }
  return left.localeCompare(right);
}
function sortVersionKeys(versions: Iterable<string>): string[] {
  return Array.from(new Set(versions)).sort(compareVersionKeys);
}
function isSharedProdModePath(path: string): boolean {
  if (path.startsWith('/client/game/mode')) return true;
  if (path.startsWith('/client/menu/locale')) return true;
  return false;
}
function collectBackendModeSignals(backendFiles: EftLogInputFile[]): BackendModeSignals {
  let hasPveSignal = false;
  let hasPvpSignal = false;
  const timeline: BackendModeSignal[] = [];
  for (const backendFile of backendFiles) {
    const lines = backendFile.text.split('\n');
    for (const line of lines) {
      const timestamp = extractLogLineTimestamp(line);
      let match: RegExpExecArray | null;
      while ((match = BACKEND_URL_PATTERN.exec(line)) !== null) {
        const host = (match[1] ?? '').toLowerCase();
        const path = (match[2] ?? '').toLowerCase();
        if (host.startsWith('gw-pve')) {
          hasPveSignal = true;
          if (timestamp) {
            timeline.push({
              mode: GAME_MODES.PVE,
              timestamp,
            });
          }
          continue;
        }
        if (!host.startsWith('prod-')) continue;
        if (isSharedProdModePath(path)) continue;
        hasPvpSignal = true;
        if (timestamp) {
          timeline.push({
            mode: GAME_MODES.PVP,
            timestamp,
          });
        }
      }
      BACKEND_URL_PATTERN.lastIndex = 0;
    }
  }
  timeline.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  return {
    hasPveSignal,
    hasPvpSignal,
    timeline,
  };
}
function detectSessionModeFromSignals({
  hasPveSignal,
  hasPvpSignal,
}: Pick<BackendModeSignals, 'hasPveSignal' | 'hasPvpSignal'>): EftQuestEventMode {
  if (hasPveSignal && !hasPvpSignal) return GAME_MODES.PVE;
  if (hasPvpSignal && !hasPveSignal) return GAME_MODES.PVP;
  return UNKNOWN_MODE;
}
function resolveEventModeFromTimeline(
  timestamp: string | null,
  timeline: BackendModeSignal[],
  fallbackMode: EftQuestEventMode
): EftQuestEventMode {
  if (!timestamp || timeline.length === 0) return fallbackMode;
  let resolvedMode: EftQuestEventMode | null = null;
  for (const signal of timeline) {
    if (signal.timestamp > timestamp) break;
    resolvedMode = signal.mode;
  }
  if (resolvedMode) return resolvedMode;
  return fallbackMode;
}
export function parseEftNotificationLogText(text: string): EftLogTextParseResult {
  const completionEvents: EftQuestEvent[] = [];
  const startedEvents: EftQuestEvent[] = [];
  let chatMessageCount = 0;
  let completionEventCount = 0;
  let startedEventCount = 0;
  let parseErrorCount = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const markerIndex = text.indexOf(CHAT_MESSAGE_MARKER, cursor);
    if (markerIndex === -1) break;
    const eventTimestamp = extractLogLineTimestampAtIndex(text, markerIndex);
    const jsonStart = text.indexOf('{', markerIndex + CHAT_MESSAGE_MARKER.length);
    if (jsonStart === -1) break;
    const block = readJsonBlock(text, jsonStart);
    if (!block) {
      parseErrorCount += 1;
      cursor = markerIndex + CHAT_MESSAGE_MARKER.length;
      continue;
    }
    cursor = block.end;
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.text);
    } catch {
      parseErrorCount += 1;
      continue;
    }
    const payload = toChatMessagePayload(parsed);
    if (!payload) continue;
    chatMessageCount += 1;
    const message = payload.message;
    if (!message || typeof message.templateId !== 'string') continue;
    const eventKey = buildEventKey(payload, message.templateId);
    if (message?.type === 12) {
      const questId = extractQuestId(message.templateId, QUEST_COMPLETION_TEMPLATE_SUFFIX);
      if (!questId) continue;
      completionEventCount += 1;
      completionEvents.push({
        eventKey,
        questId,
        timestamp: eventTimestamp,
      });
      continue;
    }
    if (message?.type === 10) {
      const questId = extractQuestId(message.templateId, QUEST_STARTED_TEMPLATE_SUFFIX);
      if (!questId) continue;
      startedEventCount += 1;
      startedEvents.push({
        eventKey,
        questId,
        timestamp: eventTimestamp,
      });
    }
  }
  return {
    chatMessageCount,
    completionEventCount,
    startedEventCount,
    completionEvents,
    startedEvents,
    parseErrorCount,
  };
}
export function isEftNotificationLogFileName(fileName: string): boolean {
  const normalized = fileName.replaceAll('\\', '/').toLowerCase();
  const baseName = normalized.split('/').pop() ?? normalized;
  return baseName.endsWith('notifications.log') || /push-notifications_\d+\.log$/.test(baseName);
}
export function isEftBackendLogFileName(fileName: string): boolean {
  const normalized = fileName.replaceAll('\\', '/').toLowerCase();
  const baseName = normalized.split('/').pop() ?? normalized;
  return baseName.endsWith('_backend.log') || /backend_\d+\.log$/.test(baseName);
}
export function parseEftLogsForQuestImport(
  files: EftLogInputFile[],
  taskIds: Iterable<string>,
  options: ParseEftLogsForQuestImportOptions = {}
): EftQuestImportPreview {
  const taskIdSet = new Set(Array.from(taskIds));
  const groupedFiles = new Map<
    string,
    {
      backend: EftLogInputFile[];
      notifications: EftLogInputFile[];
      version: string;
    }
  >();
  for (const file of files) {
    if (!isEftNotificationLogFileName(file.name) && !isEftBackendLogFileName(file.name)) continue;
    const sessionKey = toSessionKey(file.name);
    const group = groupedFiles.get(sessionKey) ?? {
      backend: [],
      notifications: [],
      version:
        extractSessionVersion(sessionKey) ??
        extractSessionVersion(file.name) ??
        UNKNOWN_LOG_VERSION,
    };
    if (isEftNotificationLogFileName(file.name)) {
      group.notifications.push(file);
    } else if (isEftBackendLogFileName(file.name)) {
      group.backend.push(file);
    }
    if (group.version === UNKNOWN_LOG_VERSION) {
      group.version = extractSessionVersion(file.name) ?? UNKNOWN_LOG_VERSION;
    }
    groupedFiles.set(sessionKey, group);
  }
  const versionSessionCounts: Record<string, number> = {};
  for (const group of groupedFiles.values()) {
    if (group.notifications.length === 0) continue;
    const key = group.version || UNKNOWN_LOG_VERSION;
    versionSessionCounts[key] = (versionSessionCounts[key] ?? 0) + 1;
  }
  const availableVersions = sortVersionKeys(Object.keys(versionSessionCounts));
  const availableVersionSet = new Set(availableVersions);
  const requestedIncludedVersions =
    options.includedVersions == null
      ? availableVersions
      : Array.from(new Set(options.includedVersions)).filter((version) =>
          availableVersionSet.has(version)
        );
  const includedVersions = sortVersionKeys(requestedIncludedVersions);
  const includedVersionSet = new Set(includedVersions);
  const seenCompletionEventKeys = new Set<string>();
  const seenStartedEventKeys = new Set<string>();
  const questIds = new Set<string>();
  const startedQuestIds = new Set<string>();
  const questIdsByMode: Record<EftQuestEventMode, Set<string>> = {
    [GAME_MODES.PVP]: new Set<string>(),
    [GAME_MODES.PVE]: new Set<string>(),
    [UNKNOWN_MODE]: new Set<string>(),
  };
  const startedQuestIdsByMode: Record<EftQuestEventMode, Set<string>> = {
    [GAME_MODES.PVP]: new Set<string>(),
    [GAME_MODES.PVE]: new Set<string>(),
    [UNKNOWN_MODE]: new Set<string>(),
  };
  let chatMessageCount = 0;
  let completionEventCount = 0;
  let startedEventCount = 0;
  let filesParsed = 0;
  for (const groupedSession of groupedFiles.values()) {
    if (groupedSession.notifications.length === 0) continue;
    if (!includedVersionSet.has(groupedSession.version)) continue;
    const modeSignals = collectBackendModeSignals(groupedSession.backend);
    const sessionMode = detectSessionModeFromSignals(modeSignals);
    for (const notificationFile of groupedSession.notifications) {
      const result = parseEftNotificationLogText(notificationFile.text);
      filesParsed += 1;
      chatMessageCount += result.chatMessageCount;
      completionEventCount += result.completionEventCount;
      startedEventCount += result.startedEventCount;
      for (const event of result.completionEvents) {
        if (seenCompletionEventKeys.has(event.eventKey)) continue;
        seenCompletionEventKeys.add(event.eventKey);
        questIds.add(event.questId);
        const resolvedMode = resolveEventModeFromTimeline(
          event.timestamp,
          modeSignals.timeline,
          sessionMode
        );
        questIdsByMode[resolvedMode].add(event.questId);
      }
      for (const event of result.startedEvents) {
        if (seenStartedEventKeys.has(event.eventKey)) continue;
        seenStartedEventKeys.add(event.eventKey);
        startedQuestIds.add(event.questId);
        const resolvedMode = resolveEventModeFromTimeline(
          event.timestamp,
          modeSignals.timeline,
          sessionMode
        );
        startedQuestIdsByMode[resolvedMode].add(event.questId);
      }
    }
  }
  const sortedQuestIds = Array.from(questIds).sort((left, right) => left.localeCompare(right));
  const sortedStartedQuestIds = Array.from(startedQuestIds).sort((left, right) =>
    left.localeCompare(right)
  );
  const sortedQuestIdsByMode: Record<EftQuestEventMode, string[]> = {
    [GAME_MODES.PVP]: Array.from(questIdsByMode[GAME_MODES.PVP]).sort((left, right) =>
      left.localeCompare(right)
    ),
    [GAME_MODES.PVE]: Array.from(questIdsByMode[GAME_MODES.PVE]).sort((left, right) =>
      left.localeCompare(right)
    ),
    [UNKNOWN_MODE]: Array.from(questIdsByMode[UNKNOWN_MODE]).sort((left, right) =>
      left.localeCompare(right)
    ),
  };
  const sortedStartedQuestIdsByMode: Record<EftQuestEventMode, string[]> = {
    [GAME_MODES.PVP]: Array.from(startedQuestIdsByMode[GAME_MODES.PVP]).sort((left, right) =>
      left.localeCompare(right)
    ),
    [GAME_MODES.PVE]: Array.from(startedQuestIdsByMode[GAME_MODES.PVE]).sort((left, right) =>
      left.localeCompare(right)
    ),
    [UNKNOWN_MODE]: Array.from(startedQuestIdsByMode[UNKNOWN_MODE]).sort((left, right) =>
      left.localeCompare(right)
    ),
  };
  const matchedTaskIds = sortedQuestIds.filter((questId) => taskIdSet.has(questId));
  const matchedTaskIdsByMode: Record<EftQuestEventMode, string[]> = {
    [GAME_MODES.PVP]: sortedQuestIdsByMode[GAME_MODES.PVP].filter((questId) =>
      taskIdSet.has(questId)
    ),
    [GAME_MODES.PVE]: sortedQuestIdsByMode[GAME_MODES.PVE].filter((questId) =>
      taskIdSet.has(questId)
    ),
    [UNKNOWN_MODE]: sortedQuestIdsByMode[UNKNOWN_MODE].filter((questId) => taskIdSet.has(questId)),
  };
  const matchedStartedTaskIds = sortedStartedQuestIds.filter((questId) => taskIdSet.has(questId));
  const matchedStartedTaskIdsByMode: Record<EftQuestEventMode, string[]> = {
    [GAME_MODES.PVP]: sortedStartedQuestIdsByMode[GAME_MODES.PVP].filter((questId) =>
      taskIdSet.has(questId)
    ),
    [GAME_MODES.PVE]: sortedStartedQuestIdsByMode[GAME_MODES.PVE].filter((questId) =>
      taskIdSet.has(questId)
    ),
    [UNKNOWN_MODE]: sortedStartedQuestIdsByMode[UNKNOWN_MODE].filter((questId) =>
      taskIdSet.has(questId)
    ),
  };
  const unmatchedQuestIds = sortedQuestIds.filter((questId) => !taskIdSet.has(questId));
  const unmatchedStartedQuestIds = sortedStartedQuestIds.filter(
    (questId) => !taskIdSet.has(questId)
  );
  return {
    chatMessageCount,
    completionEventCount,
    startedEventCount,
    dedupedCompletionEventCount: seenCompletionEventKeys.size,
    dedupedStartedEventCount: seenStartedEventKeys.size,
    filesParsed,
    matchedTaskIds,
    matchedTaskIdsByMode,
    matchedStartedTaskIds,
    matchedStartedTaskIdsByMode,
    questIds: sortedQuestIds,
    startedQuestIds: sortedStartedQuestIds,
    unmatchedQuestIds,
    unmatchedStartedQuestIds,
    availableVersions,
    includedVersions,
    versionSessionCounts,
  };
}
