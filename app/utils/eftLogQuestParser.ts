import { ACTIVE_SEASON, GAME_MODES, type GameMode } from '@/utils/constants';
import { createEftLogRecordReader } from '@/utils/eftLogRecordReader';
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
  timestamp: number;
}
export interface EftParsedLogFile {
  name: string;
  version: string;
  timeline: BackendModeSignal[];
  legacy: BackendModeSignal[];
  notifications: EftLogTextParseResult | null;
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
  timestamp: number,
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
function collectDeclaredModeSignal(
  record: LogRecord,
  timeline: BackendModeSignal[],
  timestamp: number
): void {
  const declared = declaredRecordMode(record);
  if (declared) timeline.push({ mode: declared, timestamp });
}
/** Rejects invalid timestamps before collecting declarations and eligible connection URLs. */
function collectRecordModeSignals(
  record: LogRecord,
  timeline: BackendModeSignal[],
  legacy: BackendModeSignal[]
): void {
  const timestamp = eftLogTimestampMillis(record.timestamp);
  if (timestamp === null) return;
  collectDeclaredModeSignal(record, timeline, timestamp);
  // Delayed responses and URLs inside JSON chat text are not mode switches.
  if (!isModeSignalRecord(record)) return;
  for (const match of record.message.matchAll(new RegExp(BACKEND_URL_PATTERN))) {
    collectUrlModeSignal(match, timestamp, timeline, legacy);
  }
}
/** Builds a session timeline, enabling legacy fallback only without explicit PvP or Seasonal evidence. */
function collectBackendModeSignals(files: EftParsedLogFile[]): BackendModeSignals {
  const timeline = files.flatMap((file) => file.timeline);
  const legacy = files.flatMap((file) => file.legacy);
  // Legacy prod hosts remain useful alongside PvE, but must not override explicit PvP/Season signals.
  if (
    !timeline.some(
      (signal) => signal.mode === GAME_MODES.PVP || signal.mode === GAME_MODES.SEASONAL
    )
  )
    for (const signal of legacy) timeline.push(signal);
  return { timeline: combineModeSignals(timeline) };
}
/** Keeps agreement at one instant and marks conflicting simultaneous modes as unknown. */
function reconcileModeSignal(prior: EftQuestEventMode, mode: EftQuestEventMode): EftQuestEventMode {
  return prior === mode ? mode : UNKNOWN_MODE;
}
/** Sorts signals and combines simultaneous evidence before binary-search routing. */
function combineModeSignals(timeline: BackendModeSignal[]): BackendModeSignal[] {
  timeline.sort((left, right) => left.timestamp - right.timestamp);
  const combined: BackendModeSignal[] = [];
  for (const signal of timeline) {
    const prior = combined.at(-1);
    if (prior?.timestamp === signal.timestamp) {
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
    if (signal.timestamp <= time) {
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
/** Combines parsed notification evidence without retaining source text. */
function appendNotificationResult(
  target: EftLogTextParseResult,
  source: EftLogTextParseResult
): void {
  const counts = [
    'chatMessageCount',
    'completionEventCount',
    'startedEventCount',
    'failedEventCount',
    'parseErrorCount',
  ] as const;
  for (const key of counts) target[key] += source[key];
  const buckets = ['completionEvents', 'startedEvents', 'failedEvents'] as const;
  for (const key of buckets) {
    for (const event of source[key]) target[key].push(event);
  }
}
/** Uses the first versioned record header when the path did not identify a build. */
function updateSourceVersion(source: EftParsedLogFile, text: string): void {
  if (source.version !== UNKNOWN_LOG_VERSION) return;
  source.version = /^\d{4}-[^\r\n|]+\|(\d+(?:\.\d+){4})\|/m.exec(text)?.[1] ?? UNKNOWN_LOG_VERSION;
}
/** Adds only quest notifications and mode signals from a batch of complete records. */
function appendLogText(source: EftParsedLogFile, text: string): void {
  updateSourceVersion(source, text);
  for (const record of readLogRecords(text)) {
    collectRecordModeSignals(record, source.timeline, source.legacy);
  }
  if (source.notifications)
    appendNotificationResult(source.notifications, parseEftNotificationLogText(text));
}
/** Parses complete records once and retains only evidence needed for later version/mode selection. */
export function createEftLogFileParser(name: string) {
  const source: EftParsedLogFile = {
    name,
    version: extractSessionVersion(name) ?? UNKNOWN_LOG_VERSION,
    timeline: [],
    legacy: [],
    notifications: isEftNotificationLogFileName(name) ? parseEftNotificationLogText('') : null,
  };
  const reader = createEftLogRecordReader((text) => appendLogText(source, text), name);
  return {
    push: reader.push,
    finish: (): EftParsedLogFile => {
      reader.finish();
      return source;
    },
  };
}
/** Adapts in-memory callers to the same parser used by chunked file reads. */
function parseEftLogFile(file: EftLogInputFile): EftParsedLogFile {
  const parser = createEftLogFileParser(file.name);
  parser.push(file.text);
  return parser.finish();
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
/** Recognizes quest events eligible for their resolved destination catalog. */
export function isEligibleImportEvent(
  event: EftQuestImportEvent
): event is EftQuestImportEvent & { mode: GameMode } {
  if (event.mode === UNKNOWN_MODE) return false;
  return event.matchedModes?.includes(event.mode) ?? true;
}
/** Checks the same Seasonal eligibility constraint for both preview and progress application. */
export function hasOutsideSeasonEvents(
  events: EftQuestImportEvent[],
  targetMode: GameMode
): boolean {
  if (targetMode !== GAME_MODES.SEASONAL) return false;
  return latestEftQuestEvents(events, targetMode).some(
    (event) =>
      event.mode === GAME_MODES.SEASONAL &&
      isEligibleImportEvent(event) &&
      !isCurrentSeasonLogEvent(event)
  );
}
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
interface SessionLogs {
  files: EftParsedLogFile[];
  version: string;
}
interface ImportCounts {
  chatMessageCount: number;
  completionEventCount: number;
  startedEventCount: number;
  failedEventCount: number;
  parseErrorCount: number;
  filesParsed: number;
}
/** Groups related evidence while preserving the first known session version. */
function addSessionFile(groups: Map<string, SessionLogs>, file: EftParsedLogFile): void {
  const sessionKey = toSessionKey(file.name);
  const group = groups.get(sessionKey) ?? {
    files: [],
    version: extractSessionVersion(sessionKey) ?? file.version,
  };
  if (group.version === UNKNOWN_LOG_VERSION) group.version = file.version;
  group.files.push(file);
  groups.set(sessionKey, group);
}
/** Accepts both streamed evidence and existing small in-memory parser callers. */
function groupLogSources(files: (EftLogInputFile | EftParsedLogFile)[]): SessionLogs[] {
  const groups = new Map<string, SessionLogs>();
  for (const input of files) {
    if (!isEftImportLogFileName(input.name)) continue;
    addSessionFile(groups, 'text' in input ? parseEftLogFile(input) : input);
  }
  return [...groups.values()];
}
/** Counts sessions with notification files, including empty logs, for the version selector. */
function countVersionSessions(groups: SessionLogs[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const group of groups) {
    if (!group.files.some((file) => file.notifications)) continue;
    counts[group.version] = (counts[group.version] ?? 0) + 1;
  }
  return counts;
}
/** Restricts requested builds to available versions and preserves newest-first ordering. */
function selectIncludedVersions(
  available: string[],
  requested?: Iterable<string> | null
): string[] {
  if (requested == null) return available;
  return sortVersionKeys([...requested].filter((version) => available.includes(version)));
}
/** Counts parsed notifications without retaining or re-reading their source text. */
function addImportCounts(counts: ImportCounts, result: EftLogTextParseResult): void {
  const keys = [
    'chatMessageCount',
    'completionEventCount',
    'startedEventCount',
    'failedEventCount',
    'parseErrorCount',
  ] as const;
  for (const key of keys) counts[key] += result[key];
  counts.filesParsed++;
}
/** Deduplicates strong event identities using the earliest delivery's routing evidence. */
function retainImportEvent(
  seen: Map<string, EftQuestImportEvent>,
  event: EftQuestImportEvent
): void {
  const key = eventDeduplicationKey(event);
  const duplicate = seen.get(key);
  if (duplicate) retainEarliestEvent(duplicate, event);
  else seen.set(key, event);
}
/** Routes each file's events against the complete session timeline, regardless of file order. */
function collectFileEvents(
  file: EftParsedLogFile,
  timeline: BackendModeSignal[],
  seen: Map<string, EftQuestImportEvent>,
  counts: ImportCounts
): void {
  const result = file.notifications;
  if (!result) return;
  addImportCounts(counts, result);
  const buckets = {
    completed: result.completionEvents,
    started: result.startedEvents,
    failed: result.failedEvents,
  };
  for (const status of ['completed', 'started', 'failed'] as const) {
    for (const event of buckets[status]) {
      const mode = resolveEventModeFromTimeline(event.timestamp, timeline);
      retainImportEvent(seen, { ...event, mode, status });
    }
  }
}
/** Collects evidence only from the selected versions before applying season or catalog guards. */
function collectImportEvents(groups: SessionLogs[], included: Set<string>) {
  const seen = new Map<string, EftQuestImportEvent>();
  const counts: ImportCounts = {
    chatMessageCount: 0,
    completionEventCount: 0,
    startedEventCount: 0,
    failedEventCount: 0,
    parseErrorCount: 0,
    filesParsed: 0,
  };
  for (const group of groups) {
    if (!included.has(group.version)) continue;
    const signals = collectBackendModeSignals(group.files);
    for (const file of group.files) collectFileEvents(file, signals.timeline, seen, counts);
  }
  return { counts, events: [...seen.values()] };
}
/** Removes only out-of-season Seasonal history, retaining unresolved events for manual routing. */
function filterSeasonEvents(events: EftQuestImportEvent[]) {
  let skippedSeasonalEventCount = 0;
  const included = events.filter((event) => {
    if (event.mode !== GAME_MODES.SEASONAL || isCurrentSeasonLogEvent(event)) return true;
    skippedSeasonalEventCount++;
    return false;
  });
  return { events: included, skippedSeasonalEventCount };
}
/** Annotates event eligibility without changing the active metadata store or progress mode. */
function matchEventModes(
  events: EftQuestImportEvent[],
  catalogs: ParseEftLogsForQuestImportOptions['taskIdsByMode']
): void {
  if (!catalogs) return;
  const idsByMode = new Map(Object.entries(catalogs).map(([mode, ids]) => [mode, new Set(ids)]));
  for (const event of events) {
    event.matchedModes = [...idsByMode]
      .filter(
        ([mode, ids]) =>
          (event.mode === UNKNOWN_MODE || event.mode === mode) && ids.has(event.questId)
      )
      .map(([mode]) => mode as GameMode);
  }
}
/** Summarizes reconciled quest states while preserving the full deduplicated evidence for confirmation. */
function summarizeImportEvents(events: EftQuestImportEvent[], taskIdSet: Set<string>) {
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
    dedupedCompletionEventCount: events.filter((event) => event.status === 'completed').length,
    dedupedStartedEventCount: events.filter((event) => event.status === 'started').length,
    dedupedFailedEventCount: events.filter((event) => event.status === 'failed').length,
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
  };
}
/** Builds a version-filtered preview from compact evidence, preserving mode, identity and season guards. */
export function parseEftLogsForQuestImport(
  files: (EftLogInputFile | EftParsedLogFile)[],
  taskIds: Iterable<string>,
  options: ParseEftLogsForQuestImportOptions = {}
): EftQuestImportPreview {
  const groups = groupLogSources(files);
  const versionSessionCounts = countVersionSessions(groups);
  const availableVersions = sortVersionKeys(Object.keys(versionSessionCounts));
  const includedVersions = selectIncludedVersions(availableVersions, options.includedVersions);
  const collected = collectImportEvents(groups, new Set(includedVersions));
  const seasonal = filterSeasonEvents(collected.events);
  matchEventModes(seasonal.events, options.taskIdsByMode);
  return {
    ...summarizeImportEvents(seasonal.events, new Set(taskIds)),
    ...collected.counts,
    ...seasonal,
    availableVersions,
    includedVersions,
    versionSessionCounts,
  };
}
