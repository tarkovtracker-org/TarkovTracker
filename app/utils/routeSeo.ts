import { RESOURCES } from '../features/resources/resourceData';
import english from '../locales/en.json';
export const SEO_ORIGIN = 'https://tarkovtracker.org';
const PUBLIC_PAGE_KEYS = {
  '/': 'home',
  '/tasks': 'tasks',
  '/hideout': 'hideout',
  '/needed-items': 'needed_items',
  '/kappa': 'kappa',
  '/storyline': 'storyline',
  '/resources': 'resources',
  '/about': 'about',
  '/credits': 'credits',
  '/changelog': 'changelog',
  '/supporter': 'supporter',
  '/privacy': 'privacy',
  '/terms-of-service': 'terms_of_service',
} as const;
const GUIDES = RESOURCES.filter((resource) => resource.hasGuide);
export const PUBLIC_SEO_ROUTES: string[] = [
  ...Object.keys(PUBLIC_PAGE_KEYS),
  ...GUIDES.map((resource) => `/resources/${resource.slug}`),
];
const CLIENT_PAGE_KEYS = {
  '/settings': 'settings',
  '/progression': 'progression',
  '/prestige': 'prestige',
  '/preferences': 'preferences',
  '/account': 'account',
  '/team': 'team',
  '/admin': 'admin',
  '/profile': 'profile',
  '/login': 'login',
  '/auth/callback': 'auth_callback',
  '/oauth/consent': 'oauth_consent',
  '/not-found': 'not_found',
} as const;
export const CLIENT_DOCUMENT_ROUTES: string[] = Object.keys(CLIENT_PAGE_KEYS);
export interface RouteSeoImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}
export interface RouteSeo {
  title: string;
  description: string;
  indexable: boolean;
  canonical?: string;
  image?: RouteSeoImage;
  guide: boolean;
}
type SeoCopyKey = keyof typeof english.seo.routes;
const readEnglishKey = (key: string): string => {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, english);
  if (typeof value === 'string') return value;
  // Nuxt i18n compiles locale imports into message ASTs; Node receives plain JSON.
  const message = value as
    { body?: { static?: string }; b?: { s?: string }; loc?: { source?: string } } | undefined;
  const candidates = [message?.body?.static, message?.b?.s, message?.loc?.source, 'TarkovTracker'];
  return candidates.find((candidate) => typeof candidate === 'string')!;
};
const normalizePath = (path: string): string => path.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
const fallbackKey = (path: string): SeoCopyKey =>
  CLIENT_PAGE_KEYS[path as keyof typeof CLIENT_PAGE_KEYS] ??
  (path.startsWith('/profile/') ? 'profile' : 'not_found');
const canonicalFields = (path: string): Pick<RouteSeo, 'canonical'> =>
  path === '/profile' || path.startsWith('/profile/') ? {} : { canonical: `${SEO_ORIGIN}${path}` };
const resolveCopyKey = (path: string, guideSlug?: string): SeoCopyKey =>
  (PUBLIC_PAGE_KEYS[path as keyof typeof PUBLIC_PAGE_KEYS] ??
    guideSlug ??
    fallbackKey(path)) as SeoCopyKey;
const resolveImageFields = (shareImage?: {
  src: string;
  width: number;
  height: number;
  altKey: string;
}): Pick<RouteSeo, 'image'> => {
  if (!shareImage) return {};
  return {
    image: {
      src: new URL(shareImage.src, SEO_ORIGIN).href,
      width: shareImage.width,
      height: shareImage.height,
      alt: readEnglishKey(shareImage.altKey),
    },
  };
};
export const resolveRouteSeo = (path: string): RouteSeo => {
  const normalized = normalizePath(path);
  const guide = GUIDES.find((resource) => `/resources/${resource.slug}` === normalized);
  const key = resolveCopyKey(normalized, guide?.slug);
  return {
    title: readEnglishKey(`seo.routes.${key}.title`),
    description: readEnglishKey(`seo.routes.${key}.description`),
    indexable: PUBLIC_SEO_ROUTES.includes(normalized),
    ...canonicalFields(normalized),
    guide: Boolean(guide),
    ...resolveImageFields(guide?.guide.shareImage),
  };
};
const createSchema = (seo: RouteSeo) => {
  const organization = {
    '@type': 'Organization',
    '@id': `${SEO_ORIGIN}/#organization`,
    name: readEnglishKey('seo.site_name'),
    url: SEO_ORIGIN,
  };
  const website = {
    '@type': 'WebSite',
    '@id': `${SEO_ORIGIN}/#website`,
    name: readEnglishKey('seo.site_name'),
    url: SEO_ORIGIN,
    publisher: { '@id': organization['@id'] },
  };
  const graph: Record<string, unknown>[] = [organization, website];
  if (seo.canonical === `${SEO_ORIGIN}/`)
    graph.push({
      '@type': 'WebApplication',
      name: readEnglishKey('seo.site_name'),
      url: seo.canonical,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web browser',
      description: readEnglishKey('seo.application_description'),
    });
  if (seo.guide)
    graph.push(
      {
        '@type': 'Article',
        headline: seo.title,
        description: seo.description,
        mainEntityOfPage: seo.canonical,
        author: { '@id': organization['@id'] },
        publisher: { '@id': organization['@id'] },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: readEnglishKey('seo.routes.home.title'),
            item: `${SEO_ORIGIN}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: readEnglishKey('seo.routes.resources.title'),
            item: `${SEO_ORIGIN}/resources`,
          },
          { '@type': 'ListItem', position: 3, name: seo.title, item: seo.canonical },
        ],
      }
    );
  return { '@context': 'https://schema.org', '@graph': graph };
};
const imageMeta = (image: RouteSeoImage) => [
  { property: 'og:image', content: image.src },
  { property: 'og:image:width', content: String(image.width) },
  { property: 'og:image:height', content: String(image.height) },
  { property: 'og:image:alt', content: image.alt },
  { name: 'twitter:image', content: image.src },
  { name: 'twitter:image:alt', content: image.alt },
];
const optionalImageMeta = (image?: RouteSeoImage) => (image ? imageMeta(image) : []);
const canonicalMeta = (canonical?: string) =>
  canonical ? [{ property: 'og:url', content: canonical }] : [];
const createMeta = (seo: RouteSeo) =>
  [
    { name: 'description', content: seo.description },
    { name: 'robots', content: seo.indexable ? 'index, follow' : 'noindex, nofollow' },
    { property: 'og:title', content: seo.title },
    { property: 'og:description', content: seo.description },
    ...canonicalMeta(seo.canonical),
    { property: 'og:site_name', content: readEnglishKey('seo.site_name') },
    { property: 'og:type', content: seo.guide ? 'article' : 'website' },
    { name: 'twitter:card', content: seo.image ? 'summary_large_image' : 'summary' },
    { name: 'twitter:title', content: seo.title },
    { name: 'twitter:description', content: seo.description },
    ...optionalImageMeta(seo.image),
  ].map((tag) => ({ ...tag, key: 'property' in tag ? tag.property : tag.name }));
export const createRouteSeoHead = (path: string) => {
  const seo = resolveRouteSeo(path);
  return {
    title: seo.title,
    titleTemplate: null,
    link: seo.canonical
      ? [{ key: 'canonical', rel: 'canonical' as const, href: seo.canonical }]
      : [],
    meta: createMeta(seo),
    script: [
      {
        key: 'route-schema',
        type: 'application/ld+json' as const,
        innerHTML: JSON.stringify(createSchema(seo)).replace(/</g, '\\u003c'),
      },
    ],
  };
};
