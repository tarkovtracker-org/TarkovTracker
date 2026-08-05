export const getUserMetadataString = (
  metadata: Record<string, unknown>,
  key: string
): string | null => {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};
export const extractUserMetadataUsername = (
  userMetadata: Record<string, unknown>,
  email: string | null,
  provider: string | null
): string | null => {
  if (provider === 'discord') {
    const preferredValues = [
      'global_name',
      'username',
      'preferred_username',
      'full_name',
      'name',
    ].map((key) => getUserMetadataString(userMetadata, key));
    const legacyName = preferredValues[4]?.split('#')[0] ?? null;
    return preferredValues.slice(0, 4).find(Boolean) ?? legacyName ?? email?.split('@')[0] ?? null;
  }
  if (provider === 'twitch') {
    return (
      getUserMetadataString(userMetadata, 'preferred_username') ??
      getUserMetadataString(userMetadata, 'name') ??
      email?.split('@')[0] ??
      null
    );
  }
  return getUserMetadataString(userMetadata, 'name') ?? email?.split('@')[0] ?? null;
};
export const extractUserMetadataDisplayName = (
  userMetadata: Record<string, unknown>,
  provider: string | null,
  username: string | null
): string | null => {
  if (provider === 'discord') return username;
  return getUserMetadataString(userMetadata, 'full_name') ?? username;
};
