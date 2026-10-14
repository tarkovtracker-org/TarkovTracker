// A comparison of a strict textual subset, not a general YAML loader. Unknown changed shapes hold.
import { safeVersion } from './review-admission-version.mjs';
const SENSITIVE =
  /(?:supabase|stripe|auth|session|jose|jwt|oauth|passport|credential|progress-contracts)/i;
const VERSION =
  /(?<![a-zA-Z0-9_.-])(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?![a-zA-Z0-9_.-])/g;
const PACKAGE =
  /^((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(.*)$/;
function sections(text) {
  if (!validLockText(text)) return null;
  const match =
    /^(.*?)\nimporters:\n([\s\S]*?)\npackages:\n([\s\S]*?)\nsnapshots:\n([\s\S]*)$/s.exec(text);
  return (
    match && { controls: match[1], importers: match[2], packages: match[3], snapshots: match[4] }
  );
}
function validLockText(text) {
  if (typeof text !== 'string') return false;
  return [Buffer.byteLength(text) <= 1000000, !text.includes('\r')].every(Boolean);
}
function records(text) {
  const result = new Map();
  let key = null;
  let body = [];
  for (const line of text.split('\n').filter(Boolean))
    ({ key, body } = recordLine(result, line, key, body));
  saveRecord(result, key, body);
  return result;
}
function recordLine(result, line, key, body) {
  const match = /^ {2}(\S.*):(?: \{\})?$/.exec(line);
  if (!match) return recordBody(line, key, body);
  saveRecord(result, key, body);
  const next = match[1].replace(/^'(.*)'$/, '$1');
  if (result.has(next)) throw new Error('Duplicate lock record');
  return { key: next, body: [] };
}
function recordBody(line, key, body) {
  if (!key) throw new Error('Lock body has no record');
  if (!/^ {4}\S/.test(line) && !/^ {6,}\S/.test(line)) throw new Error('Unknown lock indentation');
  body.push(line);
  return { key, body };
}
function saveRecord(result, key, body) {
  if (key !== null) result.set(key, body.join('\n'));
}
function changedRecords(before, after) {
  const removed = [...before].filter(([key]) => !after.has(key));
  const added = [...after].filter(([key]) => !before.has(key));
  return { removed, added };
}
function packageName(key) {
  const parsed = PACKAGE.exec(key);
  if (!parsed) throw new Error('Unclassified package resolution');
  return parsed[1];
}
function normaliseVersions(text) {
  return text.replace(VERSION, '#VERSION#');
}
function versionShape(before, after) {
  if (normaliseVersions(before) !== normaliseVersions(after)) return false;
  const old = [...before.matchAll(VERSION)].map((match) => match[0]);
  const next = [...after.matchAll(VERSION)].map((match) => match[0]);
  if (!old.length) return false;
  return old.every((version, index) => safeVersion(version, next[index]));
}
function integrityMetadata(body) {
  const matches = body.match(/^ {4}resolution: \{integrity: sha512-[a-zA-Z0-9+/=]+\}$/gm);
  if (matches?.length !== 1) throw new Error('Unclassified package integrity');
  return body.replace(matches[0], '    resolution: {integrity: #INTEGRITY#}');
}
function safePackagePair(before, after) {
  if (SENSITIVE.test(packageName(before[0]))) return false;
  if (!versionShape(before[0], after[0])) return false;
  if (before[0] === after[0]) return false; // An immutable version may not change its resolution.
  return integrityMetadata(before[1]) === integrityMetadata(after[1]);
}
function groupRecords(entries) {
  const groups = new Map();
  for (const entry of entries) addGroup(groups, entry);
  return groups;
}
function addGroup(groups, entry) {
  const key = normaliseVersions(entry[0]);
  const list = groups.get(key) ?? [];
  list.push(entry);
  groups.set(key, list);
}
function safePairs(removed, added, predicate) {
  if (removed.length !== added.length) return false;
  const old = groupRecords(removed);
  const next = groupRecords(added);
  if (old.size !== next.size) return false;
  return [...old].every(([key, entries]) => safeGroup(entries, next.get(key), predicate));
}
function safeGroup(before, after, predicate) {
  if (!after) return false;
  if (before.length !== after.length) return false;
  const sorted = after.toSorted(([left], [right]) => left.localeCompare(right));
  return before
    .toSorted(([left], [right]) => left.localeCompare(right))
    .every((entry, index) => predicate(entry, sorted[index]));
}
function samePackages(before, after) {
  const common = [...before].filter(([key]) => after.has(key));
  if (!common.every(([key, body]) => body === after.get(key))) return false;
  const { removed, added } = changedRecords(before, after);
  return safePairs(removed, added, safePackagePair);
}
function contextualLines(text) {
  const stack = [];
  const result = [];
  for (const line of text.split('\n').filter(Boolean)) result.push(contextualLine(stack, line));
  return result;
}
function contextualLine(stack, line) {
  const indent = /^ */.exec(line)[0].length;
  while (stack.length && stack.at(-1).indent >= indent) stack.pop();
  const header = /^ +(.+):$/.exec(line);
  if (header) stack.push({ indent, name: header[1] });
  return { line, context: stack.map((entry) => entry.name).join('/') };
}
function ordinaryScalar(line) {
  const scalar = /^ +[^:]+: (.+)$/.exec(line);
  if (!scalar) return false;
  return /^['"]?[a-zA-Z0-9@_./()-]+['"]?$/.test(scalar[1]);
}
function safeLine(before, after) {
  if (before.line === after.line) return true;
  if (SENSITIVE.test(`${before.context} ${before.line} ${after.context} ${after.line}`))
    return false;
  if (![ordinaryScalar(before.line), ordinaryScalar(after.line)].every(Boolean)) return false;
  return versionShape(before.line, after.line);
}
function sameResolvedEdges(before, after) {
  const old = contextualLines(before);
  const next = contextualLines(after);
  if (old.length !== next.length) return false;
  return old.every((line, index) => safeLine(line, next[index]));
}
function safeSnapshotPair(before, after) {
  if (SENSITIVE.test(packageName(before[0]))) return false;
  if (!versionShape(before[0], after[0])) return false;
  return sameResolvedEdges(before[1], after[1]);
}
function sameSnapshots(before, after) {
  const common = [...before].filter(([key]) => after.has(key));
  if (!common.every(([key, body]) => safeCommonSnapshot(key, body, after.get(key)))) return false;
  const { removed, added } = changedRecords(before, after);
  return safePairs(removed, added, safeSnapshotPair);
}
function safeCommonSnapshot(key, before, after) {
  if (before === after) return true;
  if (SENSITIVE.test(packageName(key))) return false;
  return sameResolvedEdges(before, after);
}
function safeSections(before, after) {
  if (before.controls !== after.controls) return false;
  if (!sameResolvedEdges(before.importers, after.importers)) return false;
  if (!samePackages(records(before.packages), records(after.packages))) return false;
  return sameSnapshots(records(before.snapshots), records(after.snapshots));
}
export function safeLockfileChange(before, after) {
  if (before === after) return true;
  const old = sections(before);
  const next = sections(after);
  if (![old, next].every(Boolean)) return false;
  try {
    return safeSections(old, next);
  } catch {
    return false;
  }
}
