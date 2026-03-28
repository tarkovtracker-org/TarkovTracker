// https://nuxt.com/docs/api/configuration/nuxt-config
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTrustProxySetting } from './app/utils/apiProtectionConfig';
import { SUPPORTED_LOCALES } from './app/utils/locales';
import {
  buildContentSecurityPolicyRouteRules,
  resolveNitroPreset,
} from './app/utils/nuxtSecurityConfig';
import {
  GITHUB_IMAGE_DOMAINS,
  resolvePublicAppUrl,
  resolveSupabaseRuntimeConfig,
  TARKOV_IMAGE_DOMAINS,
} from './app/utils/runtimeConfig';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const appDir = resolve(__dirname, 'app');
const testsDir = resolve(__dirname, 'tests');
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version ?? 'dev';
const isNonProduction = process.env.NODE_ENV !== 'production';
const CONFIGURED_NITRO_PRESET = process.env.NITRO_PRESET;
const NITRO_PRESET = resolveNitroPreset(CONFIGURED_NITRO_PRESET);
const {
  privateAnonKey: PRIVATE_SUPABASE_ANON_KEY,
  privateUrl: PRIVATE_SUPABASE_URL,
  publicAnonKey: PUBLIC_SUPABASE_ANON_KEY,
  publicUrl: PUBLIC_SUPABASE_URL,
} = resolveSupabaseRuntimeConfig(process.env);
if (
  process.env.NUXT_PUBLIC_GA_MEASUREMENT_ID &&
  process.env.NUXT_PUBLIC_GOOGLE_ANALYTICS_MEASUREMENT_ID &&
  process.env.NUXT_PUBLIC_GA_MEASUREMENT_ID !==
    process.env.NUXT_PUBLIC_GOOGLE_ANALYTICS_MEASUREMENT_ID
) {
  console.warn('[Config] Conflicting GA measurement IDs - using NUXT_PUBLIC_GA_MEASUREMENT_ID');
}
if (
  process.env.NUXT_PUBLIC_CLARITY_PROJECT_ID &&
  process.env.NUXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID &&
  process.env.NUXT_PUBLIC_CLARITY_PROJECT_ID !==
    process.env.NUXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID
) {
  console.warn('[Config] Conflicting Clarity project IDs - using NUXT_PUBLIC_CLARITY_PROJECT_ID');
}
const cspRouteRules = buildContentSecurityPolicyRouteRules({
  clientLogSinkUrl: process.env.NUXT_PUBLIC_CLIENT_LOG_SINK_URL || '/api/logs/client',
  clarityInstrumentationKey:
    process.env.NUXT_PUBLIC_CLARITY_PROJECT_ID ||
    process.env.NUXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID ||
    '',
  gaMeasurementId:
    process.env.NUXT_PUBLIC_GA_MEASUREMENT_ID ||
    process.env.NUXT_PUBLIC_GOOGLE_ANALYTICS_MEASUREMENT_ID ||
    '',
  supabaseUrl: PUBLIC_SUPABASE_URL,
  teamGatewayUrl: process.env.NUXT_PUBLIC_TEAM_GATEWAY_URL,
  tokenGatewayUrl: process.env.NUXT_PUBLIC_TOKEN_GATEWAY_URL,
});
const webApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Tarkov Tracker',
  alternateName: 'TarkovTracker',
  url: 'https://tarkovtracker.org',
  applicationCategory: 'GameApplication',
  operatingSystem: 'Web',
  description:
    'Tarkov Tracker helps you track Escape from Tarkov quest progress, storyline, hideout upgrades, and needed items.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  author: {
    '@type': 'Organization',
    name: 'Tarkov Tracker',
    url: 'https://tarkovtracker.org',
  },
  sameAs: ['https://github.com/tarkovtracker-org/TarkovTracker'],
};
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  spaLoadingTemplate: true,
  srcDir: 'app',
  ignore: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'],
  runtimeConfig: {
    // Server-only (private) runtime config
    supabaseUrl: PRIVATE_SUPABASE_URL,
    supabaseServiceKey:
      process.env.NUXT_SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SB_SERVICE_ROLE_KEY ||
      '',
    supabaseAnonKey: PRIVATE_SUPABASE_ANON_KEY,
    githubToken:
      process.env.NUXT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '',
    githubContributorsExclude:
      process.env.NUXT_GITHUB_CONTRIBUTORS_EXCLUDE ||
      process.env.GITHUB_CONTRIBUTORS_EXCLUDE ||
      'claude,claude[bot],semantic-release-bot,semantic-release[bot]',
    githubContributorsCacheTtlMs:
      Number(
        process.env.NUXT_GITHUB_CONTRIBUTORS_CACHE_TTL_MS ||
          process.env.GITHUB_CONTRIBUTORS_CACHE_TTL_MS ||
          '1800000'
      ) || 1800000,
    githubTimeoutMs:
      Number(process.env.NUXT_GITHUB_TIMEOUT_MS || process.env.GITHUB_TIMEOUT_MS || '8000') || 8000,
    logSinkUrl: process.env.NUXT_LOG_SINK_URL || process.env.LOG_SINK_URL || '',
    teamMembersCacheTtlMs:
      Number(
        process.env.NUXT_TEAM_MEMBERS_CACHE_TTL_MS ||
          process.env.TEAM_MEMBERS_CACHE_TTL_MS ||
          '5000'
      ) || 5000,
    teamMembersRateLimitPerMinute:
      Number(
        process.env.NUXT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE ||
          process.env.TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE ||
          '120'
      ) || 120,
    sharedProfileCacheTtlMs:
      Number(
        process.env.NUXT_SHARED_PROFILE_CACHE_TTL_MS ||
          process.env.SHARED_PROFILE_CACHE_TTL_MS ||
          '5000'
      ) || 5000,
    sharedProfileRateLimitPerMinute:
      Number(
        process.env.NUXT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE ||
          process.env.SHARED_PROFILE_RATE_LIMIT_PER_MINUTE ||
          '120'
      ) || 120,
    // API protection configuration (server-only)
    apiProtection: {
      // Comma-separated list of allowed hosts (e.g., "tarkovtracker.org,www.tarkovtracker.org")
      allowedHosts: process.env.API_ALLOWED_HOSTS || '',
      // Comma-separated list of internal/trusted IP ranges (CIDR notation or single IPs)
      // e.g., "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1"
      trustedIpRanges: process.env.API_TRUSTED_IP_RANGES || '',
      // Whether to require authentication for protected API routes
      requireAuth: process.env.API_REQUIRE_AUTH !== 'false', // defaults to true
      // Routes that are exempt from auth requirement (comma-separated, supports wildcards)
      // e.g., "/api/tarkov/*" for public data endpoints
      publicRoutes:
        process.env.API_PUBLIC_ROUTES?.trim() ||
        '/api/tarkov/*,/api/changelog,/api/contributors,/api/logs/client,/api/profile/*,/api/streamer/*',
      // Whether to trust proxy headers (X-Forwarded-For, etc.)
      // ONLY enable this if the server is behind a trusted proxy like Cloudflare
      trustProxy: resolveTrustProxySetting({
        API_TRUST_PROXY: process.env.API_TRUST_PROXY,
        NITRO_PRESET,
      }),
    },
    public: {
      NODE_ENV: process.env.NODE_ENV || 'production',
      VITE_LOG_LEVEL: process.env.NUXT_PUBLIC_LOG_LEVEL || process.env.VITE_LOG_LEVEL || '',
      appUrl: resolvePublicAppUrl(process.env),
      appVersion,
      googleAnalyticsMeasurementId:
        process.env.NUXT_PUBLIC_GA_MEASUREMENT_ID ||
        process.env.NUXT_PUBLIC_GOOGLE_ANALYTICS_MEASUREMENT_ID ||
        '',
      microsoftClarityProjectId:
        process.env.NUXT_PUBLIC_CLARITY_PROJECT_ID ||
        process.env.NUXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID ||
        '',
      supabaseAnonKey: PUBLIC_SUPABASE_ANON_KEY,
      supabaseUrl: PUBLIC_SUPABASE_URL,
      clientLogSinkUrl: process.env.NUXT_PUBLIC_CLIENT_LOG_SINK_URL || '/api/logs/client',
      teamGatewayUrl: process.env.NUXT_PUBLIC_TEAM_GATEWAY_URL || '',
      tokenGatewayUrl: process.env.NUXT_PUBLIC_TOKEN_GATEWAY_URL || '',
      adminWatchTimeoutMs: Number(process.env.ADMIN_WATCH_TIMEOUT_MS || '5000') || 5000,
      githubOwner: process.env.GITHUB_OWNER || 'tarkovtracker-org',
      githubRepo: process.env.GITHUB_REPO || 'TarkovTracker',
    },
  },
  devtools: {
    enabled: process.env.NODE_ENV === 'development',
    timeline: {
      enabled: true,
    },
  },
  serverDir: resolve(__dirname, 'app/server'),
  nitro: {
    preset: NITRO_PRESET,
    cloudflare: {
      pages: {
        routes: {
          include: ['/*'],
          exclude: ['/_fonts/*', '/_nuxt/*', '/img/*', '/favicon.ico', '/robots.txt'],
        },
      },
    },
  },
  routeRules: {
    '/neededitems': { redirect: { to: '/needed-items', statusCode: 301 } },
    // Explicit long-term caching for build assets
    '/_nuxt/**': {
      headers: { 'cache-control': 'public,max-age=31536000,immutable' },
    },
    '/_fonts/**': {
      headers: { 'cache-control': 'public,max-age=31536000,immutable' },
    },
    ...cspRouteRules,
  },
  app: {
    baseURL: '/',
    buildAssetsDir: '/_nuxt/',
    head: {
      titleTemplate: '%s | Tarkov Tracker',
      title: 'Escape from Tarkov Quest, Hideout, and Item Tracker',
      script: [
        {
          type: 'application/ld+json',
          textContent: JSON.stringify(webApplicationSchema),
        },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'index, follow, max-image-preview:large' },
        {
          name: 'description',
          content:
            'Tarkov Tracker helps you track Escape from Tarkov quest progress, storyline, hideout upgrades, and needed items. Plan raids, share progression with your team, and stay ready for wipe updates.',
        },
        {
          name: 'keywords',
          content:
            'tarkov tracker, tarkov quest tracker, escape from tarkov tasks, eft hideout tracker, eft needed items',
        },
        { name: 'theme-color', content: '#c8a882' },
        // OpenGraph tags
        { property: 'og:site_name', content: 'Tarkov Tracker' },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: 'Tarkov Tracker - Escape from Tarkov Progress Tracker' },
        {
          property: 'og:description',
          content:
            'Tarkov Tracker helps you track Escape from Tarkov quest progress, storyline, hideout upgrades, and needed items. Plan raids, share progression with your team, and stay ready for wipe updates.',
        },
        {
          property: 'og:image',
          content: 'https://tarkovtracker.org/img/logos/tarkovtrackerlogo-light.webp',
        },
        { property: 'og:url', content: 'https://tarkovtracker.org' },
        // Twitter Card tags
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Tarkov Tracker - Escape from Tarkov Progress Tracker' },
        {
          name: 'twitter:description',
          content:
            'Tarkov Tracker helps you track Escape from Tarkov quest progress, storyline, hideout upgrades, and needed items. Plan raids, share progression with your team, and stay ready for wipe updates.',
        },
        {
          name: 'twitter:image',
          content: 'https://tarkovtracker.org/img/logos/tarkovtrackerlogo-light.webp',
        },
      ],
    },
  },
  css: ['~/assets/css/tailwind.css'],
  alias: {
    '@': appDir,
    '#tests': testsDir,
    '~': appDir,
  },
  modules: [
    isNonProduction ? '@nuxt/eslint' : undefined,
    isNonProduction ? '@nuxt/test-utils/module' : undefined,
    '@pinia/nuxt',
    '@nuxt/ui',
    '@nuxt/image',
    '@nuxtjs/i18n',
    process.env.NODE_ENV === 'test' ? undefined : '@nuxtjs/sitemap',
  ].filter(Boolean) as string[],
  site: {
    url: 'https://tarkovtracker.org',
    name: 'Tarkov Tracker',
  },
  sitemap: {
    xslColumns: [
      { label: 'URL', width: '65%' },
      { label: 'Last Modified', select: 'sitemap:lastmod', width: '25%' },
    ],
    exclude: [
      '/account',
      '/admin',
      '/auth/**',
      '/login',
      '/not-found',
      '/oauth/**',
      '/profile',
      '/settings',
      '/team',
    ],
    defaults: {
      changefreq: 'weekly',
      priority: 0.8,
    },
  },
  i18n: {
    bundle: {
      compositionOnly: true,
      runtimeOnly: true,
    },
    compilation: {
      strictMessage: false,
      escapeHtml: true,
    },
    strategy: 'no_prefix',
    defaultLocale: 'en',
    restructureDir: 'app',
    langDir: 'locales',
    locales: SUPPORTED_LOCALES.map((code) => ({ code, file: `${code}.json5` })),
    vueI18n: 'i18n.config.ts',
  },
  hooks: {
    'imports:extend': (imports: Array<{ as?: string; from?: string; name: string }>) => {
      const blockedImports = [
        { names: new Set(['meta']), sourcePattern: '/app/utils/perf' },
        { names: new Set(['string']), sourcePattern: '/app/utils/constants' },
        { names: new Set(['string']), sourcePattern: '/app/utils/mapTime' },
        { names: new Set(['string']), sourcePattern: '/app/utils/skillHelpers' },
        { names: new Set(['getters']), sourcePattern: '/app/stores/useApp' },
        { names: new Set(['actions']), sourcePattern: '/app/stores/useTarkov' },
        {
          names: new Set(['options']),
          sourcePattern: '@nuxt/ui/dist/runtime/composables/useResizable',
        },
      ];
      for (let index = imports.length - 1; index >= 0; index -= 1) {
        const imported = imports[index];
        if (!imported) continue;
        const source = imported.from ?? '';
        const exposedName = imported.as ?? imported.name;
        const shouldBlock = blockedImports.some(
          ({ names, sourcePattern }) =>
            source.includes(sourcePattern) && (names.has(imported.name) || names.has(exposedName))
        );
        if (shouldBlock) imports.splice(index, 1);
      }
    },
  },
  image: {
    domains: [...GITHUB_IMAGE_DOMAINS, ...TARKOV_IMAGE_DOMAINS],
  },
  ui: {
    theme: {
      colors: [
        'primary',
        'secondary',
        'neutral',
        'brand',
        'accent',
        'pvp',
        'pve',
        'info',
        'success',
        'warning',
        'error',
        'kappa',
        'lightkeeper',
      ],
    },
  },
  components: [
    {
      path: '~/components',
      pathPrefix: false,
      extensions: ['vue'],
    },
    {
      path: '~/features',
      pathPrefix: false,
      extensions: ['vue'],
    },
    {
      path: '~/shell',
      pathPrefix: false,
      extensions: ['vue'],
    },
  ],
  typescript: {
    tsConfig: {
      compilerOptions: {
        paths: {
          '@/*': ['./app/*'],
          '#tests/*': ['./tests/*'],
          '#tests': ['./tests'],
          '~/*': ['./app/*'],
        },
      },
    },
  },
  postcss: {
    plugins: {
      '@tailwindcss/postcss': {},
      autoprefixer: {},
    },
  },
  vite: {
    plugins: [
      {
        enforce: 'pre',
        name: 'nuxt-ui-use-resizable-options-shim',
        transform(code, id) {
          if (!id.includes('@nuxt/ui/dist/runtime/composables/useResizable.js')) {
            return;
          }
          if (code.includes('export const options')) {
            return;
          }
          return `${code}\nexport const options = {};\n`;
        },
      },
    ],
    base: '/',
    optimizeDeps: {
      exclude: ['better-sqlite3'],
    },
    define: {
      // Suppress Suspense experimental feature warning
      __VUE_PROD_SUSPENSE__: 'false',
    },
    vue: {
      // Forwarded to @vitejs/plugin-vue
      template: {
        compilerOptions: {
          isCustomElement: (tag: string) => tag === 'suspense',
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules/leaflet')) {
              return 'vendor-leaflet';
            }
            if (id.includes('node_modules/@supabase')) {
              return 'vendor-supabase';
            }
            if (
              id.includes('node_modules/vue') ||
              id.includes('node_modules/pinia') ||
              id.includes('node_modules/ufo') ||
              id.includes('node_modules/ofetch') ||
              id.includes('node_modules/defu') ||
              id.includes('node_modules/h3')
            ) {
              return 'vendor-core';
            }
          },
        },
      },
    },
  },
});
