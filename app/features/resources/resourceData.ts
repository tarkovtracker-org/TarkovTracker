export type ResourceLinkType = 'website' | 'github' | 'discord' | 'api' | 'download';
export type ResourceCategory = 'companion_apps' | 'data_and_apis' | 'calculators_and_reference';
export type ResourcePrimaryAction = 'guide' | 'website' | 'api';
export interface ResourceLink {
  type: ResourceLinkType;
  url: string;
}
export interface ResourceGuideConfig {
  steps: number;
  tips: number;
  faq: number;
  troubleshooting?: number;
  compatibility?: boolean;
}
export interface Resource {
  slug: string;
  logo: string | null;
  category: ResourceCategory;
  hasGuide: boolean;
  guide?: ResourceGuideConfig;
  links: ResourceLink[];
  primaryAction: ResourcePrimaryAction;
  keywords: string[];
}
export interface ResourceAction {
  kind: 'internal' | 'external';
  href: string;
  labelKey: string;
  labelFallback: string;
  icon: string;
  external: boolean;
}
export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  'companion_apps',
  'data_and_apis',
  'calculators_and_reference',
];
export const CATEGORY_LABEL_FALLBACKS: Record<ResourceCategory, string> = {
  companion_apps: 'Companion Apps',
  data_and_apis: 'Data & Developer Tools',
  calculators_and_reference: 'Calculators & Reference',
};
export const CATEGORY_BADGE_FALLBACKS: Record<ResourceCategory, string> = {
  companion_apps: 'Desktop App',
  data_and_apis: 'Data Platform',
  calculators_and_reference: 'Reference',
};
export const RESOURCES: Resource[] = [
  {
    slug: 'tarkovmonitor',
    logo: '/img/logos/tarkovmonitorlogo.avif',
    category: 'companion_apps',
    hasGuide: true,
    guide: { steps: 4, tips: 2, faq: 3, troubleshooting: 3, compatibility: true },
    primaryAction: 'guide',
    keywords: ['desktop', 'raid', 'sync', 'companion', 'progress', 'logs', 'quest'],
    links: [
      { type: 'website', url: 'https://tarkov.dev/tarkov-monitor' },
      { type: 'github', url: 'https://github.com/the-hideout/TarkovMonitor' },
      { type: 'discord', url: 'https://discord.gg/bgpejCuFDf' },
    ],
  },
  {
    slug: 'ratscanner',
    logo: '/img/logos/ratscannerlogo.webp',
    category: 'companion_apps',
    hasGuide: true,
    guide: { steps: 4, tips: 2, faq: 3, troubleshooting: 4, compatibility: true },
    primaryAction: 'guide',
    keywords: ['scanner', 'desktop', 'market', 'barter', 'tooltip', 'price', 'quest'],
    links: [
      { type: 'website', url: 'https://ratscanner.com' },
      { type: 'github', url: 'https://github.com/RatScanner/RatScanner' },
      { type: 'discord', url: 'https://discord.gg/VagecDrcsW' },
    ],
  },
  {
    slug: 'tarkovdev',
    logo: '/img/logos/tarkovdevlogo.webp',
    category: 'data_and_apis',
    hasGuide: true,
    guide: { steps: 3, tips: 2, faq: 2 },
    primaryAction: 'api',
    keywords: ['api', 'graphql', 'data', 'developer', 'items', 'quests', 'market', 'traders'],
    links: [
      { type: 'api', url: 'https://api.tarkov.dev/' },
      { type: 'website', url: 'https://tarkov.dev/' },
      { type: 'github', url: 'https://github.com/the-hideout' },
      { type: 'discord', url: 'https://discord.gg/bgpejCuFDf' },
    ],
  },
  {
    slug: 'cultistcircle',
    logo: null,
    category: 'calculators_and_reference',
    hasGuide: true,
    guide: { steps: 2, tips: 2, faq: 2 },
    primaryAction: 'website',
    keywords: ['calculator', 'cultist', 'circle', 'recipe', 'rewards', 'sacrifice'],
    links: [{ type: 'website', url: 'https://cultistcircle.com' }],
  },
  {
    slug: 'tarkovchanges',
    logo: '/img/logos/tarkovchangeslogo.svg',
    category: 'calculators_and_reference',
    hasGuide: false,
    primaryAction: 'website',
    keywords: ['changes', 'patch', 'wipe', 'updates', 'diff', 'reference', 'changelog'],
    links: [{ type: 'website', url: 'https://tarkov-changes.com/' }],
  },
];
export const getResourceBySlug = (slug: string): Resource | undefined =>
  RESOURCES.find((r) => r.slug === slug);
const LINK_ICONS: Record<ResourceLinkType, string> = {
  website: 'i-mdi-web',
  github: 'i-mdi-github',
  discord: 'i-mdi-discord',
  api: 'i-mdi-api',
  download: 'i-mdi-download',
};
const LINK_LABEL_FALLBACKS: Record<ResourceLinkType, string> = {
  website: 'Open website',
  github: 'View source',
  discord: 'Community support',
  api: 'API documentation',
  download: 'Download',
};
const PRIMARY_WEBSITE_LABELS: Record<string, { key: string; fallback: string }> = {
  cultistcircle: {
    key: 'page.resources.actions.open_calculator',
    fallback: 'Open calculator',
  },
  tarkovchanges: {
    key: 'page.resources.actions.view_changes',
    fallback: 'View changes',
  },
};
const externalAction = (
  href: string,
  labelKey: string,
  labelFallback: string,
  icon: string
): ResourceAction => ({
  kind: 'external',
  href,
  labelKey,
  labelFallback,
  icon,
  external: true,
});
const apiAction = (resource: Resource): ResourceAction | null => {
  const apiLink = resource.links.find((link) => link.type === 'api');
  if (!apiLink) return null;
  return externalAction(
    apiLink.url,
    'page.resources.actions.api_documentation',
    'API documentation',
    LINK_ICONS.api
  );
};
const websiteAction = (resource: Resource): ResourceAction | null => {
  const websiteLink = resource.links.find((link) => link.type === 'website');
  if (!websiteLink) return null;
  const websiteLabel = PRIMARY_WEBSITE_LABELS[resource.slug] ?? {
    key: 'page.resources.actions.open_tool',
    fallback: 'Open tool',
  };
  return externalAction(
    websiteLink.url,
    websiteLabel.key,
    websiteLabel.fallback,
    LINK_ICONS.website
  );
};
const linkAction = (link: ResourceLink, projectWebsite = false): ResourceAction => {
  if (projectWebsite && link.type === 'website') {
    return externalAction(
      link.url,
      'page.resources.link_types.project_website',
      'Project website',
      LINK_ICONS.website
    );
  }
  return externalAction(
    link.url,
    `page.resources.link_types.${link.type}`,
    LINK_LABEL_FALLBACKS[link.type],
    LINK_ICONS[link.type]
  );
};
const defaultAction = (resource: Resource): ResourceAction | null => {
  if (resource.primaryAction === 'api') {
    const action = apiAction(resource);
    if (action) return action;
  }
  return websiteAction(resource);
};
export const getPrimaryAction = (resource: Resource): ResourceAction | null => {
  if (resource.primaryAction === 'guide' && resource.hasGuide) {
    return {
      kind: 'internal',
      href: `/resources/${resource.slug}`,
      labelKey: 'page.resources.actions.setup_guide',
      labelFallback: 'Setup guide',
      icon: 'i-mdi-book-open-page-variant',
      external: false,
    };
  }
  return defaultAction(resource);
};
export const getSecondaryActions = (resource: Resource): ResourceAction[] => {
  const primary = getPrimaryAction(resource);
  const secondary: ResourceAction[] = [];
  if (resource.hasGuide && resource.primaryAction !== 'guide') {
    secondary.push({
      kind: 'internal',
      href: `/resources/${resource.slug}`,
      labelKey: 'page.resources.actions.read_guide',
      labelFallback: 'Read guide',
      icon: 'i-mdi-book-open-page-variant',
      external: false,
    });
  }
  for (const link of resource.links) {
    if (primary?.external && primary.href === link.url) continue;
    secondary.push(linkAction(link));
  }
  return secondary;
};
export const splitSecondaryActions = (
  resource: Resource
): { highlighted: ResourceAction | null; more: ResourceAction[] } => {
  const secondary = getSecondaryActions(resource);
  if (secondary.length === 0) {
    return { highlighted: null, more: [] };
  }
  if (secondary.length === 1) {
    return { highlighted: secondary[0] ?? null, more: [] };
  }
  return {
    highlighted: secondary[0] ?? null,
    more: secondary.slice(1),
  };
};
export const getGuidePrimaryAction = (resource: Resource): ResourceAction | null => {
  if (resource.category === 'companion_apps') {
    const github = resource.links.find((link) => link.type === 'github');
    if (github) {
      return externalAction(
        `${github.url.replace(/\/$/, '')}/releases`,
        'page.resources.actions.download_release',
        'Download latest release',
        'i-mdi-download'
      );
    }
  }
  return defaultAction(resource);
};
export const getGuideSecondaryLinks = (resource: Resource): ResourceAction[] => {
  const primary = getGuidePrimaryAction(resource);
  return resource.links
    .filter((link) => !(primary?.external && primary.href === link.url))
    .map((link) => linkAction(link, true));
};
export const matchesResourceSearch = (
  resource: Resource,
  query: string,
  name: string,
  description: string,
  categoryLabel: string
): boolean => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    resource.slug,
    name,
    description,
    resource.category,
    categoryLabel,
    ...resource.keywords,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalized);
};
