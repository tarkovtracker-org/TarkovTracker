import { describe, expect, it } from 'vitest';
import {
  extractUserMetadataDisplayName,
  extractUserMetadataUsername,
  getUserMetadataString,
} from './userMetadata';
describe('existing public display-name projection', () => {
  it.each([undefined, null, false, 7, '', '   '])('rejects unusable metadata %j', (name) => {
    expect(getUserMetadataString({ name }, 'name')).toBeNull();
  });
  it('retains original whitespace in a usable name', () => {
    expect(getUserMetadataString({ name: ' Player ' }, 'name')).toBe(' Player ');
  });
  it.each([
    { provider: 'discord', metadata: { global_name: 'Global', username: 'User' }, name: 'Global' },
    {
      provider: 'discord',
      metadata: { username: 'User', preferred_username: 'Preferred' },
      name: 'User',
    },
    {
      provider: 'discord',
      metadata: { preferred_username: 'Preferred', full_name: 'Full' },
      name: 'Preferred',
    },
    { provider: 'discord', metadata: { full_name: 'Full', name: 'Legacy#1234' }, name: 'Full' },
    { provider: 'discord', metadata: { name: 'Legacy#1234' }, name: 'Legacy' },
    {
      provider: 'twitch',
      metadata: { preferred_username: 'Preferred', name: 'Name' },
      name: 'Preferred',
    },
    { provider: 'twitch', metadata: { name: 'Name' }, name: 'Name' },
    { provider: null, metadata: { name: 'Name', full_name: 'Full' }, name: 'Name' },
  ])('retains provider precedence for $provider/$name', ({ provider, metadata, name }) => {
    expect(extractUserMetadataUsername(metadata, 'email@example.com', provider)).toBe(name);
  });
  it.each(['discord', 'twitch', null])('uses the email fallback for %s', (provider) => {
    expect(extractUserMetadataUsername({}, 'email@example.com', provider)).toBe('email');
    expect(extractUserMetadataUsername({}, null, provider)).toBeNull();
  });
  it('uses the Discord username and otherwise prefers full_name for display', () => {
    const metadata = { full_name: 'Full' };
    expect(extractUserMetadataDisplayName(metadata, 'discord', 'User')).toBe('User');
    expect(extractUserMetadataDisplayName(metadata, 'twitch', 'User')).toBe('Full');
    expect(extractUserMetadataDisplayName({}, null, 'User')).toBe('User');
    expect(extractUserMetadataDisplayName({}, null, null)).toBeNull();
  });
});
