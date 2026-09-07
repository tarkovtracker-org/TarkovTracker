import { ACTIVE_SEASON, GAME_MODES, type GameMode } from '@/utils/constants';
const CHAT_MESSAGE_MARKER = 'Got notification | ChatMessageReceived';
const BACKEND_URL_PATTERN =
  /(?:https?|wss?):\/\/([A-Za-z0-9._-]+\.escapefromtarkov\.com)(\/[A-Za-z0-9_./-]*)?/g;
const LOG_LINE_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}(?: [+-]\d{2}:\d{2})?)/;
const RECORD_PATTERN =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}(?: [+-]\d{2}:\d{2})?\|([^\r\n]*)/gm;
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
/** Yields timestamp-delimited records without allowing malformed JSON to consume the next record. */
function* readLogRecords(text: string): Generator<LogRecord> {
  const matches = text.matchAll(new RegExp(RECORD_PATTERN));
  let previous: RegExpExecArray | undefined;
  for (const match of matches) {
    if (previous) yield toLogRecord(text, previous, match.index);
    previous = match;
  }
  if (previous) yield toLogRecord(text, previous, text.length);
}
/** Decodes versioned and legacy pipe-delimited headers while preserving message delimiters. */
function toLogRecord(text: string, match: RegExpExecArray, end: number): LogRecord {
  const fields = match[1]!.split('|');
  const channelIndex = /^\d+(?:\.\d+){4}$/.test(fields[0] ?? '') ? 2 : 1;
  return {
    timestamp: extractLogLineTimestamp(match[0])!,
    channel: (fields[channelIndex] ?? '').toLowerCase(),
    message: fields.slice(channelIndex + 1).join('|'),
    body: text.slice(match.index + match[0].length, end).trim(),
  };
}
/** Parses log timestamps as UTC when no explicit offset is present; invalid values return null. */
export function eftLogTimestampMillis(timestamp: string | null): number | null {
  if (!timestamp) return null;
  const normalized = timestamp.replace(' ', 'T').replace(/ ([+-])/, '$1');
  const millis = Date.parse(/[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isFinite(millis) ? millis : null;
}
/** Checks the original event time against the active season, including its start but excluding its end. */
export function isCurrentSeasonLogEvent(event: EftQuestEvent): boolean {
  const time = event.occurredAt ?? eftLogTimestampMillis(event.timestamp);
  return (
    time !== null &&
    time >= Date.parse(ACTIVE_SEASON.startsOn) &&
    time < Date.parse(ACTIVE_SEASON.endsAt)
  );
}
/** Rejects arrays and null when validating notification payload objects. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Finds a balanced JSON object while respecting quoted braces and escape sequences. */
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
/** Accepts only a 24-character quest ID from the first notification template token. */
function extractQuestId(templateId: string): string | null {
  const questId = templateId.trim().split(/\s+/)[0];
  return questId && /^[a-f\d]{24}$/i.test(questId) ? questId : null;
}
/** Uses the server event ID, or stable message fields, to identify replayed notifications. */
function buildEventKey(payload: ChatMessagePayload, questId: string, timestamp: string): string {
  if (typeof payload.eventId === 'string' && payload.eventId.trim().length > 0) {
    return `event:${payload.eventId.trim()}`;
  }
  const message = payload.message;
  const messageId = typeof message?._id === 'string' ? message._id.trim() : '';
  if (messageId) return `message:${messageId}:${questId}`;
  const dt = typeof message?.dt === 'number' && Number.isFinite(message.dt) ? message.dt : -1;
  return `fallback:${dt > 0 ? dt : timestamp}:${questId}`;
}
/** Validates the object envelope before interpreting quest notification fields. */
function toChatMessagePayload(value: unknown): ChatMessagePayload | null {
  if (!isPlainObject(value)) return null;
  if (!isPlainObject(value.message)) return null;
  return value as unknown as ChatMessagePayload;
}
/** Recognizes an actual log session directory rather than a standalone filename. */
function isSessionDirectory(directory: string, slashIndex: number): boolean {
  return slashIndex >= 0 && /(?:^|\/)log_/.test(directory);
}
/** Groups related files by session directory or the timestamp/build prefix of individual filenames. */
function toSessionKey(fileName: string): string {
  const normalized = fileName.replaceAll('\\', '/').toLowerCase();
  const slashIndex = normalized.lastIndexOf('/');
  const directory = normalized.slice(0, slashIndex);
  if (isSessionDirectory(directory, slashIndex)) return directory;
  // Preserve sessions when files are selected individually instead of as a directory.
  const prefix = /^(\d{4}\.\d{2}\.\d{2}_\d{1,2}-\d{2}-\d{2}_\d+(?:\.\d+){4})(?=[ _-])/.exec(
    normalized.slice(slashIndex + 1)
  );
  if (prefix) return `${normalized.slice(0, slashIndex + 1)}log_${prefix[1]}`;
  return slashIndex === -1 ? '__root__' : directory;
}
/** Extracts the receipt timestamp from a record header without its channel or payload. */
function extractLogLineTimestamp(text: string): string | null {
  const match = LOG_LINE_TIMESTAMP_PATTERN.exec(text);
  if (!match) return null;
  return match[1] ?? null;
}
/** Reads a five-part EFT build version from a session path or filename. */
function extractSessionVersion(value: string): string | null {
  const normalized = value.replaceAll('\\', '/').toLowerCase();
  const match = SESSION_VERSION_PATTERN.exec(normalized);
  if (!match) return null;
  const version = match[1]?.trim();
  if (!version) return null;
  return version;
}
/** Converts version components to nonnegative integers for numeric ordering. */
function parseVersionParts(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length < 2) return null;
  const parsed = parts.map((part) => Number.parseInt(part, 10));
  if (parsed.some((part) => Number.isNaN(part) || part < 0)) return null;
  return parsed;
}
/** Orders newer builds first and leaves unknown builds after known versions. */
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
/** Returns distinct build identifiers in the preview selection order. */
function sortVersionKeys(versions: Iterable<string>): string[] {
  return Array.from(new Set(versions)).sort(compareVersionKeys);
}
/** Excludes shared backend requests that do not identify the active character mode. */
function isSharedProdModePath(path: string): boolean {
  if (path.startsWith('/client/game/mode')) return true;
  if (path.startsWith('/client/menu/locale')) return true;
  return false;
}
/** Reads explicit mode declarations only from application and output channels. */
function declaredRecordMode(record: LogRecord): GameMode | undefined {
  if (!['application', 'output'].includes(record.channel)) return undefined;
  const declared = /(?:^|\s)Session mode:\s*(Regular|Pve|PvpSeason)\b/i.exec(record.message);
  const modes: Record<string, GameMode> = {
    regular: GAME_MODES.PVP,
    pve: GAME_MODES.PVE,
    pvpseason: GAME_MODES.SEASONAL,
  };
  return modes[declared?.[1]?.toLowerCase() ?? ''];
}
/** Maps known gateway and notification hosts to persistent or Seasonal progress modes. */
function gatewayMode(host: string): GameMode | undefined {
  if (/^(gw|wsn)-pvp[-_]season(?:[-.]|$)/.test(host)) return GAME_MODES.SEASONAL;
  if (/^(gw|wsn)-pve(?:[-.]|$)/.test(host)) return GAME_MODES.PVE;
  if (/^(gw|wsn)-pvp(?:[-.]|$)/.test(host)) return GAME_MODES.PVP;
  return undefined;
}
/** Accepts outgoing backend requests and notification connection records as URL evidence. */
function isModeSignalRecord(record: LogRecord): boolean {
  if (record.channel === 'backend') return record.message.includes('---> Request');
  return (
    ['notifications', 'push-notifications'].includes(record.channel) &&
    !record.message.trimStart().startsWith('Got notification |')
  );
}
/** Allows legacy production hosts only when their request path is mode-specific. */
function isLegacyModeUrl(host: string, path: string): boolean {
  return host.startsWith('prod-') && !isSharedProdModePath(path);
}
/** Separates explicit gateway evidence from the lower-priority legacy PvP fallback. */
function collectUrlModeSignal(
  match: RegExpExecArray,
  timestamp: string,
  timeline: BackendModeSignal[],
  legacy: BackendModeSignal[]
): void {
  const host = match[1]!.toLowerCase();
  const path = (match[2] ?? '').toLowerCase();
  const mode = gatewayMode(host);
  if (mode) timeline.push({ mode, timestamp: timestamp });
  else if (isLegacyModeUrl(host, path)) {
    legacy.push({ mode: GAME_MODES.PVP, timestamp: timestamp });
  }
}
/** Adds a recognized session declaration at its receipt timestamp. */
function collectDeclaredModeSignal(record: LogRecord, timeline: BackendModeSignal[]): void {
  const declared = declaredRecordMode(record);
  if (declared) timeline.push({ mode: declared, timestamp: record.timestamp });
}
/** Rejects invalid timestamps before collecting declarations and eligible connection URLs. */
function collectRecordModeSignals(
  record: LogRecord,
  timeline: BackendModeSignal[],
  legacy: BackendModeSignal[]
): void {
  if (eftLogTimestampMillis(record.timestamp) === null) return;
  collectDeclaredModeSignal(record, timeline);
  // Delayed responses and URLs inside JSON chat text are not mode switches.
  if (!isModeSignalRecord(record)) return;
  for (const match of record.message.matchAll(new RegExp(BACKEND_URL_PATTERN))) {
    collectUrlModeSignal(match, record.timestamp, timeline, legacy);
  }
}
/** Builds a session timeline, enabling legacy fallback only without explicit PvP or Seasonal evidence. */
function collectBackendModeSignals(files: EftLogInputFile[]): BackendModeSignals {
  const timeline: BackendModeSignal[] = [];
  const legacy: BackendModeSignal[] = [];
  for (const file of files) {
    for (const record of readLogRecords(file.text)) {
      collectRecordModeSignals(record, timeline, legacy);
    }
  }
  // Legacy prod hosts remain useful alongside PvE, but must not override explicit PvP/Season signals.
  if (
    !timeline.some(
      (signal) => signal.mode === GAME_MODES.PVP || signal.mode === GAME_MODES.SEASONAL
    )
  )
    timeline.push(...legacy);
  return { timeline: combineModeSignals(timeline) };
}
/** Returns a numeric timestamp for chronological mode-signal ordering. */
function signalTime(signal: BackendModeSignal): number {
  return eftLogTimestampMillis(signal.timestamp) ?? 0;
}
/** Keeps agreement at one instant and marks conflicting simultaneous modes as unknown. */
function reconcileModeSignal(prior: EftQuestEventMode, mode: EftQuestEventMode): EftQuestEventMode {
  return prior === mode ? mode : UNKNOWN_MODE;
}
/** Sorts signals and combines simultaneous evidence before binary-search routing. */
function combineModeSignals(timeline: BackendModeSignal[]): BackendModeSignal[] {
  timeline.sort((left, right) => signalTime(left) - signalTime(right));
  const combined: BackendModeSignal[] = [];
  for (const signal of timeline) {
    const prior = combined.at(-1);
    if (prior && signalTime(prior) === signalTime(signal)) {
      prior.mode = reconcileModeSignal(prior.mode, signal.mode);
    } else combined.push({ ...signal });
  }
  return combined;
}
/** Uses the latest preceding valid signal; future signals never identify an earlier event. */
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
/** Extracts quest starts, failures, and completions and counts malformed notification payloads. */
export function parseEftNotificationLogText(text: string): EftLogTextParseResult {
  const completionEvents: EftQuestEvent[] = [];
  const startedEvents: EftQuestEvent[] = [];
  const failedEvents: EftQuestEvent[] = [];
  const eventBuckets = new Map<unknown, EftQuestEvent[]>([
    [10, startedEvents],
    [11, failedEvents],
    [12, completionEvents],
  ]);
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
    const events = eventBuckets.get(message.type);
    if (!events) continue;
    events.push({
      eventKey: buildEventKey(payload, questId, record.timestamp),
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
/** Recognizes Arena session paths so their notifications cannot enter EFT progress. */
function isArenaLog(fileName: string): boolean {
  return /(?:^|[/\\])(?:log_)?arena[_/\\]/i.test(fileName);
}
/** Matches supported log channel filenames, including numbered rotations, while excluding Arena. */
function matchesChannel(fileName: string, channel: string): boolean {
  if (isArenaLog(fileName)) return false;
  const name = fileName.replaceAll('\\', '/').split('/').pop() ?? '';
  return new RegExp(String.raw`(?:^|[ _-])${channel}(?:_\d+)?\.log$`, 'i').test(name);
}
/** Identifies legacy and current quest notification filenames. */
export function isEftNotificationLogFileName(fileName: string): boolean {
  return matchesChannel(fileName, '(?:push-notifications|notifications)');
}
/** Identifies backend logs that can provide session mode evidence. */
export function isEftBackendLogFileName(fileName: string): boolean {
  return matchesChannel(fileName, 'backend');
}
/** Accepts notification records and the application, output, and backend context needed for routing. */
export function isEftImportLogFileName(fileName: string): boolean {
  return (
    isEftNotificationLogFileName(fileName) ||
    matchesChannel(fileName, '(?:backend|application|output)')
  );
}
/** Creates independent values for each detected mode and the unresolved-mode bucket. */
function modeBuckets<T>(create: () => T): Record<EftQuestEventMode, T> {
  return { pvp: create(), pve: create(), seasonal: create(), unknown: create() };
}
/** Prefers original server time and otherwise uses the notification receipt timestamp. */
function knownQuestEventTime(event: EftQuestEvent): number | null {
  return event.occurredAt ?? eftLogTimestampMillis(event.timestamp);
}
/** Places events without usable timestamps before dated history during reconciliation. */
function questEventTime(event: EftQuestEvent): number {
  return knownQuestEventTime(event) ?? -1;
}
/** Chooses later history, breaking equal-time ties as completed, failed, then started. */
function supersedesQuestEvent(event: EftQuestImportEvent, prior: EftQuestImportEvent): boolean {
  const time = questEventTime(event);
  const priorTime = questEventTime(prior);
  const rank = { started: 0, failed: 1, completed: 2 };
  return time > priorTime || (time === priorTime && rank[event.status] > rank[prior.status]);
}
/** Routes unresolved events only when an explicit import destination is supplied. */
function routeUnknownEvent(event: EftQuestImportEvent, targetMode?: GameMode): EftQuestImportEvent {
  return event.mode === UNKNOWN_MODE && targetMode ? { ...event, mode: targetMode } : event;
}
// Reconcile after routing unknown events too, so a restart and completion cannot land in different buckets.
/** Reconciles each destination and quest after manual routing, retaining one authoritative state. */
export function latestEftQuestEvents(
  events: EftQuestImportEvent[],
  targetMode?: GameMode
): EftQuestImportEvent[] {
  const latest = new Map<string, EftQuestImportEvent>();
  for (const original of events) {
    const event = routeUnknownEvent(original, targetMode);
    const key = `${event.mode}:${event.questId}`;
    const prior = latest.get(key);
    if (!prior || supersedesQuestEvent(event, prior)) latest.set(key, event);
  }
  return [...latest.values()];
}
/** Keeps strong server identities global; sparse fallback identities remain scoped to their mode. */
function eventDeduplicationKey(event: EftQuestImportEvent): string {
  const scope = event.eventKey.startsWith('fallback:') ? `${event.mode}:` : '';
  return `${scope}${event.status}:${event.questId}:${event.eventKey}`;
}
/** Uses receipt time for routing evidence even when all replays share the same original event time. */
function eventReceiptTime(event: EftQuestEvent): number {
  return eftLogTimestampMillis(event.timestamp) ?? Infinity;
}
/** Retains the earliest delivery's routing, marking conflicting simultaneous deliveries as unknown. */
function retainEarliestEvent(duplicate: EftQuestImportEvent, event: EftQuestImportEvent): void {
  const time = eventReceiptTime(event);
  const priorTime = eventReceiptTime(duplicate);
  if (time < priorTime) {
    Object.assign(duplicate, event);
  } else if (time === priorTime) {
    duplicate.mode = reconcileModeSignal(duplicate.mode, event.mode);
  }
}
/** Builds a version-filtered preview with mode routing, deduplication, season guards, and catalog eligibility. */
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
        /^\d{4}-[^\r\n|]+\|(\d+(?:\.\d+){4})\|/m.exec(file.text)?.[1] ??
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
        /^\d{4}-[^\r\n|]+\|(\d+(?:\.\d+){4})\|/m.exec(file.text)?.[1] ??
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
        const imported = { ...event, mode, status };
        const key = eventDeduplicationKey(imported);
        const duplicate = seen.get(key);
        if (duplicate) {
          retainEarliestEvent(duplicate, imported);
          return;
        }
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
    ].sort((left, right) => left.localeCompare(right));
  const matchedByMode = (status: EftQuestEventStatus) => {
    const buckets = modeBuckets<string[]>(() => []);
    for (const event of latest)
      if (event.status === status && isMatched(event)) buckets[event.mode].push(event.questId);
    Object.values(buckets).forEach((ids) => {
      ids.sort((left, right) => left.localeCompare(right));
    });
    return buckets;
  };
  const matchedIdsFor = (status: EftQuestEventStatus) =>
    [
      ...new Set(
        latest
          .filter((event) => event.status === status && isMatched(event))
          .map((event) => event.questId)
      ),
    ].sort((left, right) => left.localeCompare(right));
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
