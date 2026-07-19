export const TARKOVTRACKER_USER_AGENT = 'TarkovTracker/1.0 (+https://tarkovtracker.org)';
const INBOUND_USER_AGENT_MAX_LENGTH = 200;
export function normalizeInboundUserAgent(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, INBOUND_USER_AGENT_MAX_LENGTH);
}
