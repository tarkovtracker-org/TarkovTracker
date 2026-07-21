export const TARKOVTRACKER_USER_AGENT = 'TarkovTracker/1.0 (+https://tarkovtracker.org)';
export const INBOUND_USER_AGENT_MIN_LENGTH = 5;
export const INBOUND_USER_AGENT_MAX_LENGTH = 200;
export function normalizeInboundUserAgent(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length > INBOUND_USER_AGENT_MAX_LENGTH) return null;
  return trimmed;
}
