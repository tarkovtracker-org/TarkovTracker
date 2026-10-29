// A comparison of a strict textual subset, not a general YAML loader. Unknown changed shapes hold.
//
// The proof reasons about package identities and resolved edges rather than textual pairing, so
// routine pnpm churn (deduplicated records, re-hashed peer contexts, shrinking transitive peer
// lists) admits while these invariants stay fixed:
// - lock controls and every surviving package record (integrity included) are byte-identical;
// - an added package record is a safe non-major upgrade of a name already in the lock with
//   unchanged metadata apart from its sha512 integrity, and sensitive packages are never added
//   or removed;
// - a removal leaves no dangling reference: no surviving edge names a removed snapshot, no
//   snapshot names a removed package record, and every surviving package record keeps a snapshot;
//   changed edges and added snapshots must resolve to records that exist;
// - every changed edge keeps its name and moves its version and readable peer versions only by
//   safe steps; a changed opaque peer hash must point at a new snapshot derived from the old one;
// - a sensitive package keeps its version, its sensitive peers and any opaque peer hash, and its
//   own edges may change only where its peer context names that dependency (a relink);
// - every added snapshot matches the edges of an earlier snapshot of the same package by safe
//   steps, including its readable peers, and names only peers that exist as packages.
import { safeVersion } from './review-admission-version.mjs';
const SENSITIVE =
  /(?:supabase|stripe|auth|session|jose|jwt|jsonwebtoken|oauth|passport|credential|progress-contracts)/i;
const NAME = '(?:@[a-z0-9_.-]+\\/)?[a-z0-9_.-]+';
const KEY = new RegExp(`^(${NAME})@(.+)$`);
const RESOLUTION =
  /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)((?:\([^\s]*\))?)$/;
const DIRECT_PEER = new RegExp(`\\((${NAME})@`, 'g');
const PEER_HASH = /^\([0-9a-f]{32}\)$/;
const PEER = new RegExp(`(?:^|\\()(${NAME})@([0-9][^()]*)`, 'g');
const PEER_TOKEN = new RegExp(`(?<=\\()${NAME}@[0-9][^()]*`, 'g');
const TRANSITIVE_PEER = /^ {6}- '?[@a-z0-9_./-]+'?$/;
const TRANSITIVE_HEADER = /^ {4}transitivePeerDependencies:$/;
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
function balancedParens(text) {
  let rest = text;
  for (let next = rest.replaceAll('()', ''); next !== rest; next = rest.replaceAll('()', ''))
    rest = next;
  return rest === '';
}
// A peer suffix is an opaque pnpm hash or nested `(name@version...)` groups and nothing else.
function wellFormedPeers(peers) {
  if (!peers || PEER_HASH.test(peers)) return true;
  return balancedParens(peers.replace(PEER_TOKEN, ''));
}
function resolution(value) {
  const match = RESOLUTION.exec(value);
  if (!match || !wellFormedPeers(match[2])) return null;
  return { version: match[1], peers: match[2] };
}
function identity(key) {
  const match = KEY.exec(key);
  const resolved = match && resolution(match[2]);
  if (!resolved) throw new Error('Unclassified package resolution');
  return { name: match[1], ...resolved };
}
function changedRecords(before, after) {
  const removed = [...before].filter(([key]) => !after.has(key));
  const added = [...after].filter(([key]) => !before.has(key));
  return { removed, added };
}
function unchangedCommon(before, after, same) {
  return [...before]
    .filter(([key]) => after.has(key))
    .every(([key, body]) => same(key, body, after.get(key)));
}
function byName(entries, parse = identity) {
  const result = new Map();
  for (const [key, body] of entries) addByName(result, parse(key), key, body);
  return result;
}
function addByName(result, parsed, key, body) {
  if (parsed)
    result.set(parsed.name, [...(result.get(parsed.name) ?? []), { ...parsed, key, body }]);
}
// Earlier records only serve as templates, so unclassified ones (tarballs) simply never match.
function knownIdentity(key) {
  try {
    return identity(key);
  } catch {
    return null;
  }
}
function safeMove(before, after) {
  return before === after || safeVersion(before, after);
}
function hashed(peers) {
  return PEER_HASH.test(peers);
}
function sensitivePeers(peers) {
  return [...peers.matchAll(PEER)]
    .filter((match) => SENSITIVE.test(match[1]))
    .map((match) => `${match[1]}@${match[2]}`)
    .toSorted()
    .join(' ');
}
function peerVersions(peers) {
  const result = new Map();
  for (const [, name, version] of peers.matchAll(PEER))
    result.set(name, [...(result.get(name) ?? []), version]);
  return result;
}
function safePeerStep(previous = [], version) {
  return !previous.length || previous.some((old) => safeMove(old, version));
}
// Peers named on both sides may only move by safe steps; pnpm adds or drops peers across versions.
function safePeerSteps(before, after) {
  const old = peerVersions(before);
  return [...peerVersions(after)].every(([name, versions]) =>
    versions.every((version) => safePeerStep(old.get(name), version))
  );
}
// Names of the direct peers in a suffix such as `(a@1.0.0)(b@2.0.0(c@3.0.0))`: a and b, not c.
function directPeers(peers) {
  let flat = peers;
  for (let next = stripNested(flat); next !== flat; next = stripNested(flat)) flat = next;
  return new Set([...flat.matchAll(DIRECT_PEER)].map((match) => match[1]));
}
function stripNested(peers) {
  return peers.replace(/(\([^()]*)\([^()]*\)/g, '$1');
}
// A sensitive snapshot may only change the edges that its own peer context names.
function changeableEdges(name, peers) {
  return SENSITIVE.test(name) ? directPeers(peers) : null;
}
function knownPeers(peers, packages) {
  if (!peers || hashed(peers)) return true;
  return [...peers.matchAll(PEER)].every((match) => packages.has(`${match[1]}@${match[2]}`));
}
function integrityMetadata(body) {
  const matches = body.match(/^ {4}resolution: \{integrity: sha512-[a-zA-Z0-9+/=]+\}$/gm);
  if (matches?.length !== 1) throw new Error('Unclassified package integrity');
  return body.replace(matches[0], '    resolution: {integrity: #INTEGRITY#}');
}
function upgradesPackage(previous, next) {
  if (!safeVersion(previous.version, next.version)) return false;
  return integrityMetadata(previous.body) === integrityMetadata(next.body);
}
function safeAddedPackage(next, previous) {
  if (SENSITIVE.test(next.name) || next.peers) return false;
  return (previous.get(next.name) ?? []).some((record) => upgradesPackage(record, next));
}
function samePackages(before, after) {
  if (!unchangedCommon(before, after, (_key, old, next) => old === next)) return false;
  const { removed, added } = changedRecords(before, after);
  if (removed.some(([key]) => SENSITIVE.test(identity(key).name))) return false;
  const previous = byName(before, knownIdentity);
  return [...byName(added).values()].flat().every((next) => safeAddedPackage(next, previous));
}
function contextualLines(text) {
  const stack = [];
  const result = [];
  for (const line of text.split('\n').filter(Boolean)) result.push(contextualLine(stack, line));
  return result.filter((entry) => !transitivePeer(entry));
}
function contextualLine(stack, line) {
  const indent = /^ */.exec(line)[0].length;
  while (stack.length && stack.at(-1).indent >= indent) stack.pop();
  const header = /^ +(.+):$/.exec(line);
  if (header) stack.push({ indent, name: header[1].replace(/^'(.*)'$/, '$1') });
  return { line, context: stack.map((entry) => entry.name) };
}
// Transitive peer lists name unresolved optional peers; they carry no resolution or code.
function transitivePeer(entry) {
  if (entry.context.at(-1) !== 'transitivePeerDependencies') return false;
  if (![TRANSITIVE_PEER, TRANSITIVE_HEADER].some((shape) => shape.test(entry.line)))
    throw new Error('Unclassified transitive peer');
  return true;
}
function resolvedScalar(entry) {
  const scalar = /^ +([^:]+): (.+)$/.exec(entry.line);
  if (!scalar) return null;
  const name = scalar[1].replace(/^'(.*)'$/, '$1');
  const edge = name === 'version' ? entry.context.at(-1) : name;
  return { name, edge, value: scalar[2].replace(/^'(.*)'$/, '$1') };
}
function snapshotRecord(snapshots, key) {
  const body = snapshots.get(key);
  return body === undefined ? null : { ...identity(key), key, body };
}
// An opaque peer hash hides the peer set, so a changed hash must name a new snapshot that derives
// from the old target edge for edge; switching to another existing hashed variant holds. A peer
// cycle (a package and its own test environment) assumes the pair in progress holds; nothing is
// cached, so a result computed under that assumption cannot outlive a failed outer check.
function safeHashedSwitch(edge, before, after, graph) {
  const old = snapshotRecord(graph.before, `${edge}@${before}`);
  const next = snapshotRecord(graph.after, `${edge}@${after}`);
  if (![old, next].every(Boolean) || graph.before.has(next.key)) return false;
  const pair = `${old.key}\n${next.key}`;
  if (graph.switching.has(pair)) return true;
  graph.switching.add(pair);
  try {
    return derivesSnapshot(old, next, graph);
  } finally {
    graph.switching.delete(pair);
  }
}
function safePeerChange(edge, [before, after], [old, next], graph) {
  if (old.peers === next.peers) return true;
  if ([old.peers, next.peers].some(hashed)) return safeHashedSwitch(edge, before, after, graph);
  return safePeerSteps(old.peers, next.peers);
}
function resolvedEdgeChange(edge, before, after, graph) {
  const old = resolution(before);
  const next = resolution(after);
  if (![old, next, edge].every(Boolean)) return null;
  return graph.after.has(`${edge}@${after}`) ? { old, next } : null;
}
function safeEdgeChange(edge, before, after, graph) {
  const change = resolvedEdgeChange(edge, before, after, graph);
  if (!change) return false;
  const { old, next } = change;
  if (!steadySensitive(edge, old, next) || !safeMove(old.version, next.version)) return false;
  return safePeerChange(edge, [before, after], [old, next], graph);
}
// Exact importer specifiers mirror the manifest, which review-admission-dependencies checks.
function safeSpecifier(context, before, after) {
  if (context.length !== 3 || SENSITIVE.test(context.at(-1))) return false;
  return safeVersion(before, after);
}
function comparableScalars(before, after, changeable) {
  const pair = { old: resolvedScalar(before), next: resolvedScalar(after) };
  if (!sameScalar(pair)) return null;
  return edgeChangeable(changeable, pair.old.edge) ? pair : null;
}
function sameScalar({ old, next }) {
  return Boolean(old && next) && old.name === next.name;
}
function edgeChangeable(changeable, edge) {
  return !changeable || changeable.has(edge);
}
function safeScalarPair(before, after, graph, changeable) {
  const pair = comparableScalars(before, after, changeable);
  if (!pair) return false;
  const { old, next } = pair;
  if (old.name === 'specifier') return safeSpecifier(before.context, old.value, next.value);
  return safeEdgeChange(old.edge, old.value, next.value, graph);
}
function safeLine(before, after, graph, changeable) {
  if (before.context.join('/') !== after.context.join('/')) return false;
  if (before.line === after.line) return true;
  return safeScalarPair(before, after, graph, changeable);
}
function sameResolvedEdges(before, after, graph, changeable = null) {
  const old = contextualLines(before);
  const next = contextualLines(after);
  if (old.length !== next.length) return false;
  return old.every((line, index) => safeLine(line, next[index], graph, changeable));
}
// A sensitive package may only be relinked against new non-sensitive peers, never re-resolved.
function steadySensitive(name, before, after) {
  if (!SENSITIVE.test(name)) return sensitivePeers(before.peers) === sensitivePeers(after.peers);
  if (before.version !== after.version) return false;
  if ([before.peers, after.peers].some(hashed)) return before.peers === after.peers;
  return sensitivePeers(before.peers) === sensitivePeers(after.peers);
}
function derivesSnapshot(previous, next, graph) {
  if (!safeMove(previous.version, next.version)) return false;
  if (!steadySensitive(next.name, previous, next)) return false;
  if (!safePeerSteps(previous.peers, next.peers)) return false;
  return sameResolvedEdges(previous.body, next.body, graph, changeableEdges(next.name, next.peers));
}
function safeAddedSnapshot(next, previous, graph) {
  if (!graph.packages.has(`${next.name}@${next.version}`)) return false;
  if (!knownPeers(next.peers, graph.packages)) return false;
  return (previous.get(next.name) ?? []).some((record) => derivesSnapshot(record, next, graph));
}
function sameCommonSnapshot(key, before, after, graph) {
  const { name, peers } = identity(key);
  return sameResolvedEdges(before, after, graph, changeableEdges(name, peers));
}
function sameSnapshots(graph) {
  const same = (key, old, next) => old === next || sameCommonSnapshot(key, old, next, graph);
  if (!unchangedCommon(graph.before, graph.after, same)) return false;
  const previous = byName(graph.before, knownIdentity);
  const { added } = changedRecords(graph.before, graph.after);
  return [...byName(added).values()]
    .flat()
    .every((next) => safeAddedSnapshot(next, previous, graph));
}
// Registry snapshots name `name@version(peers)`; tarball and alias snapshots use their own key.
function packageKey(key) {
  const parsed = knownIdentity(key);
  return parsed ? `${parsed.name}@${parsed.version}` : key;
}
// Importer `version:` and snapshot dependency lines; specifiers and metadata name no snapshot.
function edgeScalar(entry) {
  const scalar = entry.context.length ? resolvedScalar(entry) : null;
  return scalar?.name === 'specifier' ? null : scalar;
}
function edgeTarget(entry) {
  const scalar = edgeScalar(entry);
  if (!scalar) return null;
  if (resolution(scalar.value)) return `${scalar.edge}@${scalar.value}`;
  return KEY.test(scalar.value) ? scalar.value : null;
}
function edgeTargets(importers, snapshots) {
  return [importers, ...snapshots.values()]
    .flatMap((text) => contextualLines(text).map(edgeTarget))
    .filter(Boolean);
}
function keepsSnapshot(key, linked, packages) {
  return !packages.has(packageKey(key)) || linked.has(packageKey(key));
}
// Removal must leave no surviving reference: no edge names a removed snapshot, no snapshot names
// a removed package record, and a surviving package record keeps at least one snapshot.
function safeRemovals(graph, removedPackages, importers) {
  const removed = new Set(changedRecords(graph.before, graph.after).removed.map(([key]) => key));
  const linked = new Set([...graph.after.keys()].map(packageKey));
  if (removedPackages.some((key) => linked.has(key))) return false;
  if (![...removed].every((key) => keepsSnapshot(key, linked, graph.packages))) return false;
  return !edgeTargets(importers, graph.after).some((target) => removed.has(target));
}
function safeSections(before, after) {
  if (before.controls !== after.controls) return false;
  const [oldPackages, newPackages] = [before, after].map((lock) => records(lock.packages));
  const graph = {
    before: records(before.snapshots),
    after: records(after.snapshots),
    packages: newPackages,
    switching: new Set(),
  };
  const removedPackages = changedRecords(oldPackages, newPackages).removed.map(([key]) => key);
  return [
    () => safeRemovals(graph, removedPackages, after.importers),
    () => sameResolvedEdges(before.importers, after.importers, graph),
    () => samePackages(oldPackages, newPackages),
    () => sameSnapshots(graph),
  ].every((check) => check());
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
