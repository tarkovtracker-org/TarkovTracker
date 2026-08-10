type ResourceLinkType = 'website' | 'github' | 'discord' | 'api' | 'download';
export type ResourceCategory =
  'tarkovtracker_guides' | 'companion_apps' | 'data_and_apis' | 'calculators_and_reference';
type ResourcePrimaryAction = 'guide' | 'website' | 'api';
interface ResourceLink {
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
interface ResourceBase {
  slug: string;
  logo: string | null;
  category: ResourceCategory;
  videoId?: string;
  links: ResourceLink[];
  primaryAction: ResourcePrimaryAction;
  keywords: string[];
}
export interface ResourceWithGuide extends ResourceBase {
  hasGuide: true;
  guide: ResourceGuideConfig;
}
export interface ResourceWithoutGuide extends ResourceBase {
  hasGuide: false;
  guide?: never;
}
export type Resource = ResourceWithGuide | ResourceWithoutGuide;
export interface ResourceAction {
  kind: 'internal' | 'external';
  href: string;
  labelKey: string;
  labelFallback: string;
  icon: string;
  external: boolean;
}
export interface ResourceMetaItem {
  labelKey?: string;
  labelFallback?: string;
  useCategoryLabel?: boolean;
}
export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  'tarkovtracker_guides',
  'companion_apps',
  'data_and_apis',
  'calculators_and_reference',
];
export const CATEGORY_LABEL_FALLBACKS: Record<ResourceCategory, string> = {
  tarkovtracker_guides: 'TarkovTracker.org Guides',
  companion_apps: 'Companion Apps',
  data_and_apis: 'Data & Developer Tools',
  calculators_and_reference: 'Calculators & Reference',
};
export const CATEGORY_BADGE_FALLBACKS: Record<ResourceCategory, string> = {
  tarkovtracker_guides: 'Official Guide',
  companion_apps: 'Desktop App',
  data_and_apis: 'Data Platform',
  calculators_and_reference: 'Reference',
};
export const RESOURCE_META_ITEMS: Record<ResourceCategory, ResourceMetaItem[]> = {
  tarkovtracker_guides: [
    { labelKey: 'page.resources.meta.official_guide', labelFallback: 'Official guide' },
    {
      labelKey: 'page.resources.meta.maintained_by_team',
      labelFallback: 'Maintained by the TarkovTracker.org team',
    },
  ],
  companion_apps: [
    { labelKey: 'page.resources.meta.windows', labelFallback: 'Windows' },
    { labelKey: 'page.resources.meta.companion_app', labelFallback: 'Companion App' },
    { labelKey: 'page.resources.meta.setup_time', labelFallback: '5-minute setup' },
  ],
  data_and_apis: [
    { useCategoryLabel: true },
    { labelKey: 'page.resources.meta.community_data', labelFallback: 'Community maintained' },
  ],
  calculators_and_reference: [
    { useCategoryLabel: true },
    { labelKey: 'page.resources.meta.web_tool', labelFallback: 'Web tool' },
  ],
};
export const RESOURCES: Resource[] = [
  {
    slug: 'tarkovtracker_org_vs_io',
    logo: '/img/logos/tarkovtrackerlogo-mini.webp',
    category: 'tarkovtracker_guides',
    hasGuide: true,
    guide: { steps: 5, tips: 0, faq: 4 },
    primaryAction: 'guide',
    keywords: ['io', 'org', 'difference', 'domain', 'migration', 'official', 'faq'],
    links: [],
  },
  {
    slug: 'tarkovmonitor',
    videoId: 'HGwD4drUq0I',
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
    videoId: 'EIyZYFCLgNo',
    guide: { steps: 4, tips: 2, faq: 4, troubleshooting: 4, compatibility: true },
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
    keywords: ['api', 'json', 'data', 'developer', 'items', 'quests', 'market', 'traders'],
    links: [
      { type: 'api', url: 'https://json.tarkov.dev/endpoints' },
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
    'common.api_documentation',
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
const guideAction = (resource: Resource, useSetupLabel = true): ResourceAction => {
  const setupGuide = useSetupLabel && resource.category !== 'tarkovtracker_guides';
  return {
    kind: 'internal',
    href: `/resources/${resource.slug}`,
    labelKey: setupGuide
      ? 'page.resources.actions.setup_guide'
      : 'page.resources.actions.read_guide',
    labelFallback: setupGuide ? 'Setup guide' : 'Read guide',
    icon: 'i-mdi-book-open-page-variant',
    external: false,
  };
};
export const getPrimaryAction = (resource: Resource): ResourceAction | null => {
  if (resource.primaryAction === 'guide' && resource.hasGuide) {
    return guideAction(resource);
  }
  return defaultAction(resource);
};
export const getSecondaryActions = (resource: Resource): ResourceAction[] => {
  const primary = getPrimaryAction(resource);
  const guideActions =
    resource.hasGuide && resource.primaryAction !== 'guide' ? [guideAction(resource, false)] : [];
  const linkActions = resource.links
    .filter((link) => !(primary?.external && primary.href === link.url))
    .map((link) => linkAction(link));
  return [...guideActions, ...linkActions];
};
export const splitSecondaryActions = (
  resource: Resource
): { highlighted: ResourceAction | null; more: ResourceAction[] } => {
  const secondary = getSecondaryActions(resource);
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
