import type { UserIdentity } from '@supabase/supabase-js';
const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' ? value.trim() || null : null;
const usernameFromMetadata = (metadata: Record<string, unknown>): string | null => {
  const name = nonEmptyString(metadata.name);
  // Preserve the discriminator for legacy Discord usernames.
  if (name?.match(/#\d{4}$/)) return name;
  // Supabase maps Discord's username to full_name, and name to username#discriminator.
  return (
    ['username', 'preferred_username', 'full_name', 'name']
      .map((key) => nonEmptyString(metadata[key]))
      .find(Boolean)
      ?.replace(/#0$/, '') ?? null
  );
};
export const getLinkedDiscordUsername = (
  identities: UserIdentity[],
  discordUserId: string
): string | null => {
  const identity = identities.find((candidate) => candidate.provider === 'discord');
  const metadata = identity?.identity_data ?? {};
  const identityId = nonEmptyString(metadata.provider_id) ?? nonEmptyString(metadata.sub);
  if (identityId !== discordUserId) return null;
  return usernameFromMetadata(metadata);
};
