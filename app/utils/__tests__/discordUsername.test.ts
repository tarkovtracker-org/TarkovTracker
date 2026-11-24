import { describe, expect, it } from 'vitest';
import { getLinkedDiscordUsername } from '@/utils/discordUsername';
import type { UserIdentity } from '@supabase/supabase-js';
const identity = (metadata: Record<string, unknown>, provider = 'discord'): UserIdentity => ({
  id: 'identity-1',
  identity_id: 'identity-1',
  user_id: 'user-1',
  provider,
  created_at: '',
  updated_at: '',
  last_sign_in_at: '',
  identity_data: { provider_id: 'discord-123', ...metadata },
});
describe('getLinkedDiscordUsername', () => {
  it('uses Supabase Discord full_name instead of the global display name', () => {
    expect(
      getLinkedDiscordUsername(
        [
          identity({
            full_name: 'unique.user',
            name: 'unique.user#0',
            global_name: 'Display Name',
          }),
        ],
        'discord-123'
      )
    ).toBe('unique.user');
  });
  it.each(['username', 'preferred_username', 'full_name', 'name'])(
    'supports the %s username field',
    (key) => {
      expect(getLinkedDiscordUsername([identity({ [key]: ' unique.user ' })], 'discord-123')).toBe(
        'unique.user'
      );
    }
  );
  it('removes the modern #0 discriminator from the name fallback', () => {
    expect(getLinkedDiscordUsername([identity({ name: 'unique.user#0' })], 'discord-123')).toBe(
      'unique.user'
    );
  });
  it('keeps the discriminator that makes a legacy username unique', () => {
    expect(
      getLinkedDiscordUsername(
        [identity({ full_name: 'legacy-user', name: 'legacy-user#1234' })],
        'discord-123'
      )
    ).toBe('legacy-user#1234');
  });
  it('skips blank or malformed username fields', () => {
    expect(
      getLinkedDiscordUsername(
        [identity({ username: ' ', preferred_username: 42, full_name: 'unique.user' })],
        'discord-123'
      )
    ).toBe('unique.user');
  });
  it('matches identities that use sub instead of provider_id', () => {
    expect(
      getLinkedDiscordUsername(
        [identity({ provider_id: '', sub: 'discord-123', full_name: 'unique.user' })],
        'discord-123'
      )
    ).toBe('unique.user');
  });
  it('never falls back to a global display name', () => {
    expect(
      getLinkedDiscordUsername([identity({ global_name: 'Display Name' })], 'discord-123')
    ).toBeNull();
  });
  it('does not use another provider', () => {
    expect(
      getLinkedDiscordUsername([identity({ full_name: 'Google User' }, 'google')], 'discord-123')
    ).toBeNull();
  });
  it('does not use a different Discord account', () => {
    expect(
      getLinkedDiscordUsername([identity({ full_name: 'wrong-user' })], 'discord-other')
    ).toBeNull();
  });
  it.each([{ provider_id: 'discord-123' }, { provider_id: '', sub: 'discord-123' }])(
    'finds the linked account after another Discord identity (%j)',
    (metadata) => {
      expect(
        getLinkedDiscordUsername(
          [
            identity({ provider_id: 'discord-other', full_name: 'wrong-user' }),
            identity({ ...metadata, full_name: 'linked-user' }),
          ],
          'discord-123'
        )
      ).toBe('linked-user');
    }
  );
  it('returns no username when the Discord identity is missing', () => {
    expect(getLinkedDiscordUsername([], 'discord-123')).toBeNull();
  });
});
