const EXACT = /^((?:0|[1-9]\d*))\.((?:0|[1-9]\d*))\.((?:0|[1-9]\d*))$/;
function exactVersion(text) {
  const match = EXACT.exec(text);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
export function safeVersion(before, after) {
  const oldVersion = exactVersion(before);
  const newVersion = exactVersion(after);
  if (![oldVersion, newVersion].every(Boolean)) return false;
  if (!compatibleLine(oldVersion, newVersion)) return false;
  if (newVersion[1] > oldVersion[1]) return true;
  return [newVersion[1] === oldVersion[1], newVersion[2] >= oldVersion[2]].every(Boolean);
}
function compatibleLine(before, after) {
  if (before[0] !== after[0]) return false;
  return before[0] !== 0 || before[1] === after[1];
}
