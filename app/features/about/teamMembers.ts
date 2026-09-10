export type TeamMemberGroup = 'core' | 'support' | 'partner';
export interface TeamMember {
  /** Stable identifier used for list keys and ordering. */
  id: string;
  displayName: string;
  /** i18n key under `page.about.roles` — never raw English. */
  roleKey: string;
  /** Only set when verified from repo sources (credits data, CODEOWNERS). */
  githubUsername?: string;
  /** Only set for partners; repo-verified project URLs only. */
  projectUrl?: string;
  /** i18n key under `page.about.projects`. */
  projectLabelKey?: string;
  group: TeamMemberGroup;
}
const githubAvatarUrl = (username: string): string => `https://github.com/${username}.png?size=96`;
const githubProfileUrl = (username: string): string => `https://github.com/${username}`;
/**
 * Canonical TarkovTracker.org roster (issue #707). Fields that cannot be
 * verified from repo sources are omitted rather than guessed; members
 * without a verified GitHub username render a monogram avatar.
 * Order is stable: core owner first, then maintainers, support, partners.
 */
export const teamMembers: TeamMember[] = [
  {
    id: 'dysektai',
    displayName: 'DysektAI',
    roleKey: 'page.about.roles.core_owner',
    githubUsername: 'dysektai',
    group: 'core',
  },
  {
    id: 'niv',
    displayName: 'Niv',
    roleKey: 'page.about.roles.discord_owner_developer',
    githubUsername: 'nivmizz7',
    group: 'core',
  },
  {
    id: 'chica',
    displayName: 'Chica',
    roleKey: 'page.about.roles.core_support',
    githubUsername: 'chica999',
    group: 'support',
  },
  {
    id: 'adealia',
    displayName: 'Adealia',
    roleKey: 'page.about.roles.discord_support',
    githubUsername: 'adealia',
    group: 'support',
  },
  {
    id: 'dio',
    displayName: 'Dio',
    roleKey: 'page.about.roles.discord_support',
    group: 'support',
  },
  {
    id: 'mrbreachie',
    displayName: 'MrBreachie',
    roleKey: 'page.about.roles.discord_support',
    group: 'support',
  },
  {
    id: 'razzmatazz',
    displayName: 'Razzmatazz',
    roleKey: 'page.about.roles.tarkov_dev_maintainer',
    projectUrl: 'https://tarkov.dev/',
    projectLabelKey: 'page.about.projects.tarkov_dev',
    group: 'partner',
  },
  {
    id: 'blightbuster',
    displayName: 'Moritz (Blightbuster)',
    roleKey: 'page.about.roles.ratscanner_maintainer',
    projectUrl: 'https://ratscanner.com',
    projectLabelKey: 'page.about.projects.ratscanner',
    group: 'partner',
  },
];
export const membersByGroup = (group: TeamMemberGroup): TeamMember[] =>
  teamMembers.filter((member) => member.group === group);
export type TeamMemberLink = { href: string; icon: string; labelKey: string };
/** Displays either the verified GitHub profile or the partner project. */
export const memberLink = (member: TeamMember): TeamMemberLink | null => {
  if (member.githubUsername) {
    return {
      href: githubProfileUrl(member.githubUsername),
      icon: 'i-mdi-github',
      labelKey: 'page.about.github_profile',
    };
  }
  if (member.projectUrl && member.projectLabelKey) {
    return { href: member.projectUrl, icon: 'i-mdi-open-in-new', labelKey: member.projectLabelKey };
  }
  return null;
};
/** Avatar URL when a GitHub username is verified, otherwise undefined (monogram). */
export const memberAvatarUrl = (member: TeamMember): string | undefined =>
  member.githubUsername ? githubAvatarUrl(member.githubUsername) : undefined;
