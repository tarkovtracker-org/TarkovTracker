import { ACTIVE_SEASON, GAME_MODES, type GameMode } from '@/utils/constants';
const CHAT_MESSAGE_MARKER = 'Got notification | ChatMessageReceived';
const BACKEND_URL_PATTERN =
  /(?:https?|wss?):\/\/([A-Za-z0-9.-]+\.escapefromtarkov\.com)(\/[A-Za-z0-9_./-]*)?/g;
const LOG_LINE_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}(?: [+-]\d{2}:\d{2})?)/;
const RECORD_PATTERN =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}(?: [+-]\d{2}:\d{2})?\|(?:\d+(?:\.\d+){4}\|)?[^|\r\n]+\|([^|\r\n]+)\|([^\r\n]*)/gm;
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
  occurredAt?: number;
}
export interface EftLogTextParseResult {
  chatMessageCount: number;
  completionEventCount: number;
  startedEventCount: number;
  completionEvents: EftQuestEvent[];
  startedEvents: EftQuestEvent[];
  failedEvents: EftQuestEvent[];
  failedEventCount: number;
  parseErrorCount: number;
}
export type EftQuestEventStatus = 'started' | 'completed' | 'failed';
export interface EftQuestImportEvent extends EftQuestEvent {
  mode: EftQuestEventMode;
  status: EftQuestEventStatus;
  matchedModes?: GameMode[];
}
export interface EftQuestImportPreview {
  events: EftQuestImportEvent[];
  failedEventCount: number;
  dedupedFailedEventCount: number;
  matchedFailedTaskIds: string[];
  matchedFailedTaskIdsByMode: Record<EftQuestEventMode, string[]>;
  unmatchedFailedQuestIds: string[];
  parseErrorCount: number;
  skippedSeasonalEventCount: number;
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
  taskIdsByMode?: Partial<Record<GameMode, Iterable<string>>>;
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
  mode: EftQuestEventMode;
  timestamp: string;
}
interface BackendModeSignals {
  timeline: BackendModeSignal[];
}
interface LogRecord {
  timestamp: string;
  channel: string;
  message: string;
  body: string;
}
function* readLogRecords(text: string): Generator<LogRecord> {
  const matches = text.matchAll(new RegExp(RECORD_PATTERN));
  let previous: RegExpExecArray | undefined;
  for (const match of matches) {
    if (previous) yield toLogRecord(text, previous, match.index);
    previous = match;
  }
  if (previous) yield toLogRecord(text, previous, text.length);
}
function toLogRecord(text: string, match: RegExpExecArray, end: number): LogRecord {
  return {
    timestamp: extractLogLineTimestamp(match[0])!,
    channel: match[1]!.toLowerCase(),
    message: match[2]!,
    body: text.slice(match.index + match[0].length, end).trim(),
  };
}
export function eftLogTimestampMillis(timestamp: string | null): number | null {
  if (!timestamp) return null;
  const normalized = timestamp.replace(' ', 'T').replace(/ ([+-])/, '$1');
  const millis = Date.parse(/[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isFinite(millis) ? millis : null;
}
export function isCurrentSeasonLogEvent(event: EftQuestEvent): boolean {
  const time = event.occurredAt ?? eftLogTimestampMillis(event.timestamp);
  return (
    time !== null &&
    time >= Date.parse(ACTIVE_SEASON.startsOn) &&
    time < Date.parse(ACTIVE_SEASON.endsAt)
  );
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
function extractQuestId(templateId: string): string | null {
  const questId = templateId.trim().split(/\s+/)[0];
  return questId && /^[a-f\d]{24}$/i.test(questId) ? questId : null;
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
  const directory = normalized.slice(0, slashIndex);
  if (slashIndex !== -1 && /(?:^|\/)log_/.test(directory)) return directory;
  // Preserve sessions when files are selected individually instead of as a directory.
  const prefix = normalized
    .slice(slashIndex + 1)
    .match(/^(\d{4}\.\d{2}\.\d{2}_\d{1,2}-\d{2}-\d{2}_\d+(?:\.\d+){4})(?=[ _-])/);
  return prefix
    ? `${normalized.slice(0, slashIndex + 1)}log_${prefix[1]}`
    : slashIndex === -1
      ? '__root__'
      : normalized.slice(0, slashIndex);
}
function extractLogLineTimestamp(text: string): string | null {
  const match = text.match(LOG_LINE_TIMESTAMP_PATTERN);
  if (!match) return null;
  return match[1] ?? null;
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
function collectBackendModeSignals(files: EftLogInputFile[]): BackendModeSignals {
  const timeline: BackendModeSignal[] = [];
  const legacy: BackendModeSignal[] = [];
  for (const file of files) {
    for (const record of readLogRecords(file.text)) {
      const declared = /(?:^|\s)Session mode:\s*(Regular|Pve|PvpSeason)\b/i.exec(record.message);
      if (declared && ['application', 'output'].includes(record.channel)) {
        const mode = declared[1]!.toLowerCase();
        timeline.push({
          mode:
            mode === 'pve'
              ? GAME_MODES.PVE
              : mode === 'pvpseason'
                ? GAME_MODES.SEASONAL
                : GAME_MODES.PVP,
          timestamp: record.timestamp,
        });
      }
      // Delayed responses and URLs inside JSON chat text are not mode switches.
      if (record.channel === 'backend' && !record.message.includes('---> Request')) continue;
      if (!['backend', 'notifications', 'push-notifications'].includes(record.channel)) continue;
      for (const match of record.message.matchAll(new RegExp(BACKEND_URL_PATTERN))) {
        const host = match[1]!.toLowerCase();
        const path = (match[2] ?? '').toLowerCase();
        let mode: GameMode | undefined;
        if (/^(gw|wsn)-pvp[-_]season(?:[-.]|$)/.test(host)) mode = GAME_MODES.SEASONAL;
        else if (/^(gw|wsn)-pve(?:[-.]|$)/.test(host)) mode = GAME_MODES.PVE;
        else if (/^(gw|wsn)-pvp(?:[-.]|$)/.test(host)) mode = GAME_MODES.PVP;
        if (mode) timeline.push({ mode, timestamp: record.timestamp });
        else if (host.startsWith('prod-') && !isSharedProdModePath(path)) {
          legacy.push({ mode: GAME_MODES.PVP, timestamp: record.timestamp });
        }
      }
    }
  }
  // Legacy prod hosts remain useful alongside PvE, but must not override explicit PvP/Season signals.
  if (
    !timeline.some(
      (signal) => signal.mode === GAME_MODES.PVP || signal.mode === GAME_MODES.SEASONAL
    )
  )
    timeline.push(...legacy);
  timeline.sort(
    (left, right) =>
      (eftLogTimestampMillis(left.timestamp) ?? 0) - (eftLogTimestampMillis(right.timestamp) ?? 0)
  );
  const combined: BackendModeSignal[] = [];
  for (const signal of timeline) {
    const prior = combined.at(-1);
    if (
      prior &&
      eftLogTimestampMillis(prior.timestamp) === eftLogTimestampMillis(signal.timestamp)
    ) {
      if (prior.mode !== signal.mode) prior.mode = UNKNOWN_MODE;
    } else combined.push({ ...signal });
  }
  return { timeline: combined };
}
function resolveEventModeFromTimeline(
  timestamp: string | null,
  timeline: BackendModeSignal[]
): EftQuestEventMode {
  const time = eftLogTimestampMillis(timestamp);
  if (time === null) return UNKNOWN_MODE;
  let low = 0;
  let high = timeline.length - 1;
  let resolved: EftQuestEventMode = UNKNOWN_MODE;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const signal = timeline[mid]!;
    const signalTime = eftLogTimestampMillis(signal.timestamp);
    if (signalTime !== null && signalTime <= time) {
      resolved = signal.mode;
      low = mid + 1;
    } else high = mid - 1;
  }
  return resolved;
}
export function parseEftNotificationLogText(text: string): EftLogTextParseResult {
  const completionEvents: EftQuestEvent[] = [];
  const startedEvents: EftQuestEvent[] = [];
  const failedEvents: EftQuestEvent[] = [];
  let chatMessageCount = 0;
  let parseErrorCount = 0;
  for (const record of readLogRecords(text)) {
    if (!['notifications', 'push-notifications'].includes(record.channel)) continue;
    if (
      record.message.trim() !== CHAT_MESSAGE_MARKER &&
      !record.message.startsWith(`${CHAT_MESSAGE_MARKER} {`)
    )
      continue;
    const json = (record.message.slice(CHAT_MESSAGE_MARKER.length) + record.body).trim();
    const block = json.startsWith('{') ? readJsonBlock(json, 0) : null;
    if (!block) {
      parseErrorCount++;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.text);
    } catch {
      parseErrorCount++;
      continue;
    }
    const payload = toChatMessagePayload(parsed);
    if (!payload) {
      parseErrorCount++;
      continue;
    }
    chatMessageCount++;
    const message = payload.message!;
    if (typeof message.templateId !== 'string') continue;
    const questId = extractQuestId(message.templateId);
    if (!questId) continue;
    const events =
      message.type === 12
        ? completionEvents
        : message.type === 10
          ? startedEvents
          : message.type === 11
            ? failedEvents
            : null;
    if (!events) continue;
    events.push({
      eventKey: buildEventKey(payload, questId),
      questId,
      timestamp: record.timestamp,
      ...(typeof message.dt === 'number' && Number.isFinite(message.dt) && message.dt > 0
        ? { occurredAt: message.dt * 1000 }
        : {}),
    });
  }
  return {
    chatMessageCount,
    completionEventCount: completionEvents.length,
    startedEventCount: startedEvents.length,
    failedEventCount: failedEvents.length,
    completionEvents,
    startedEvents,
    failedEvents,
    parseErrorCount,
  };
}
function isArenaLog(fileName: string): boolean {
  return /(?:^|[/\\])(?:log_)?arena[_/\\]/i.test(fileName);
}
function matchesChannel(fileName: string, channel: string): boolean {
  if (isArenaLog(fileName)) return false;
  const name = fileName.replaceAll('\\', '/').split('/').pop() ?? '';
  return new RegExp(`(?:^|[ _-])${channel}(?:_\\d+)?\\.log$`, 'i').test(name);
}
export function isEftNotificationLogFileName(fileName: string): boolean {
  return matchesChannel(fileName, '(?:push-notifications|notifications)');
}
export function isEftBackendLogFileName(fileName: string): boolean {
  return matchesChannel(fileName, 'backend');
}
export function isEftImportLogFileName(fileName: string): boolean {
  return (
    isEftNotificationLogFileName(fileName) ||
    matchesChannel(fileName, '(?:backend|application|output)')
  );
}
function modeBuckets<T>(create: () => T): Record<EftQuestEventMode, T> {
  return { pvp: create(), pve: create(), seasonal: create(), unknown: create() };
}
// Reconcile after routing unknown events too, so a restart and completion cannot land in different buckets.
export function latestEftQuestEvents(
  events: EftQuestImportEvent[],
  targetMode?: GameMode
): EftQuestImportEvent[] {
  const latest = new Map<string, EftQuestImportEvent>();
  const rank = { started: 0, failed: 1, completed: 2 };
  for (const original of events) {
    const event =
      original.mode === UNKNOWN_MODE && targetMode ? { ...original, mode: targetMode } : original;
    const key = `${event.mode}:${event.questId}`;
    const prior = latest.get(key);
    const time = event.occurredAt ?? eftLogTimestampMillis(event.timestamp) ?? -1;
    const priorTime = prior?.occurredAt ?? eftLogTimestampMillis(prior?.timestamp ?? null) ?? -1;
    if (
      !prior ||
      time > priorTime ||
      (time === priorTime && rank[event.status] > rank[prior.status])
    )
      latest.set(key, event);
  }
  return [...latest.values()];
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
    if (!isEftImportLogFileName(file.name)) continue;
    const sessionKey = toSessionKey(file.name);
    const group = groupedFiles.get(sessionKey) ?? {
      backend: [],
      notifications: [],
      version:
        extractSessionVersion(sessionKey) ??
        extractSessionVersion(file.name) ??
        file.text.match(/^\d{4}-[^\r\n|]+\|(\d+(?:\.\d+){4})\|/m)?.[1] ??
        UNKNOWN_LOG_VERSION,
    };
    if (isEftNotificationLogFileName(file.name)) {
      group.notifications.push(file);
    } else {
      group.backend.push(file);
    }
    if (group.version === UNKNOWN_LOG_VERSION) {
      group.version =
        extractSessionVersion(file.name) ??
        file.text.match(/^\d{4}-[^\r\n|]+\|(\d+(?:\.\d+){4})\|/m)?.[1] ??
        UNKNOWN_LOG_VERSION;
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
  let events: EftQuestImportEvent[] = [];
  const seen = new Map<string, EftQuestImportEvent>();
  let chatMessageCount = 0;
  let completionEventCount = 0;
  let startedEventCount = 0;
  let failedEventCount = 0;
  let parseErrorCount = 0;
  let skippedSeasonalEventCount = 0;
  let filesParsed = 0;
  for (const group of groupedFiles.values()) {
    if (!includedVersionSet.has(group.version)) continue;
    const signals = collectBackendModeSignals([...group.backend, ...group.notifications]);
    for (const file of group.notifications) {
      const result = parseEftNotificationLogText(file.text);
      filesParsed++;
      chatMessageCount += result.chatMessageCount;
      completionEventCount += result.completionEventCount;
      startedEventCount += result.startedEventCount;
      failedEventCount += result.failedEventCount;
      parseErrorCount += result.parseErrorCount;
      const add = (event: EftQuestEvent, status: EftQuestEventStatus) => {
        const mode = resolveEventModeFromTimeline(event.timestamp, signals.timeline);
        const key = `${mode}:${status}:${event.questId}:${event.eventKey}`;
        const duplicate = seen.get(key);
        if (duplicate) {
          const time = event.occurredAt ?? eftLogTimestampMillis(event.timestamp) ?? Infinity;
          const priorTime =
            duplicate.occurredAt ?? eftLogTimestampMillis(duplicate.timestamp) ?? Infinity;
          if (time < priorTime) {
            duplicate.timestamp = event.timestamp;
            duplicate.occurredAt = event.occurredAt;
          }
          return;
        }
        const imported = { ...event, mode, status };
        seen.set(key, imported);
        events.push(imported);
      };
      result.completionEvents.forEach((event) => add(event, 'completed'));
      result.startedEvents.forEach((event) => add(event, 'started'));
      result.failedEvents.forEach((event) => add(event, 'failed'));
    }
  }
  events = events.filter((event) => {
    if (event.mode !== GAME_MODES.SEASONAL || isCurrentSeasonLogEvent(event)) return true;
    skippedSeasonalEventCount++;
    return false;
  });
  if (options.taskIdsByMode) {
    const idsByMode = new Map(
      Object.entries(options.taskIdsByMode).map(([mode, ids]) => [mode, new Set(ids)])
    );
    for (const event of events) {
      event.matchedModes = [...idsByMode]
        .filter(
          ([mode, ids]) =>
            (event.mode === UNKNOWN_MODE || event.mode === mode) && ids.has(event.questId)
        )
        .map(([mode]) => mode as GameMode);
    }
  }
  const isMatched = (event: EftQuestImportEvent) =>
    event.matchedModes ? event.matchedModes.length > 0 : taskIdSet.has(event.questId);
  const latest = latestEftQuestEvents(events);
  const idsFor = (status: EftQuestEventStatus) =>
    [
      ...new Set(latest.filter((event) => event.status === status).map((event) => event.questId)),
    ].sort();
  const matchedByMode = (status: EftQuestEventStatus) => {
    const buckets = modeBuckets<string[]>(() => []);
    for (const event of latest)
      if (event.status === status && isMatched(event)) buckets[event.mode].push(event.questId);
    Object.values(buckets).forEach((ids) => ids.sort());
    return buckets;
  };
  const matchedIdsFor = (status: EftQuestEventStatus) =>
    [
      ...new Set(
        latest
          .filter((event) => event.status === status && isMatched(event))
          .map((event) => event.questId)
      ),
    ].sort();
  const questIds = idsFor('completed');
  const startedQuestIds = idsFor('started');
  const failedQuestIds = idsFor('failed');
  return {
    events,
    chatMessageCount,
    completionEventCount,
    startedEventCount,
    failedEventCount,
    dedupedCompletionEventCount: events.filter((event) => event.status === 'completed').length,
    dedupedStartedEventCount: events.filter((event) => event.status === 'started').length,
    dedupedFailedEventCount: events.filter((event) => event.status === 'failed').length,
    parseErrorCount,
    skippedSeasonalEventCount,
    filesParsed,
    questIds,
    startedQuestIds,
    matchedTaskIds: matchedIdsFor('completed'),
    matchedStartedTaskIds: matchedIdsFor('started'),
    matchedFailedTaskIds: matchedIdsFor('failed'),
    matchedTaskIdsByMode: matchedByMode('completed'),
    matchedStartedTaskIdsByMode: matchedByMode('started'),
    matchedFailedTaskIdsByMode: matchedByMode('failed'),
    unmatchedQuestIds: questIds.filter((id) => !taskIdSet.has(id)),
    unmatchedStartedQuestIds: startedQuestIds.filter((id) => !taskIdSet.has(id)),
    unmatchedFailedQuestIds: failedQuestIds.filter((id) => !taskIdSet.has(id)),
    availableVersions,
    includedVersions,
    versionSessionCounts,
  };
}
