// https://nuxt.com/docs/api/configuration/nuxt-config
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_LOCALES } from './app/utils/locales';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const appDir = resolve(__dirname, 'app');
const testsDir = resolve(__dirname, 'tests');
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version ?? 'dev';
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  srcDir: 'app',
  ignore: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'],
  runtimeConfig: {
    // Server-only (private) runtime config
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    supabaseServiceKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_SERVICE_ROLE_KEY || '',
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    githubToken: process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '',
    githubTimeoutMs: Number(process.env.GITHUB_TIMEOUT_MS || '8000') || 8000,
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
        '/api/tarkov/*,/api/changelog,/api/profile/*,/api/streamer/*',
      // Whether to trust proxy headers (X-Forwarded-For, etc.)
      // ONLY enable this if the server is behind a trusted proxy like Cloudflare
      trustProxy: process.env.API_TRUST_PROXY === 'true',
    },
    public: {
      NODE_ENV: process.env.NODE_ENV || 'production',
      VITE_LOG_LEVEL: process.env.VITE_LOG_LEVEL || '',
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
      appVersion: process.env.NUXT_PUBLIC_APP_VERSION || appVersion,
      tarkovVersion: process.env.NUXT_PUBLIC_TARKOV_VERSION || '1.0.2.0',
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
    preset: 'cloudflare-pages',
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
  },
  app: {
    baseURL: '/',
    buildAssetsDir: '/_nuxt/',
    head: {
      titleTemplate: '%s | TarkovTracker',
      title: 'TarkovTracker',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Complete Escape from Tarkov progress tracker for patch 1.0+. Track quests, storyline, hideout, and needed items. Team collaboration features and API integration with TarkovMonitor and RatScanner.',
        },
        { name: 'theme-color', content: '#c8a882' },
        // OpenGraph tags
        { property: 'og:site_name', content: 'TarkovTracker' },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: 'TarkovTracker - Escape from Tarkov Progress Tracker' },
        {
          property: 'og:description',
          content:
            'Complete Escape from Tarkov progress tracker for patch 1.0+. Track quests, storyline, hideout, and needed items. Team collaboration features and API integration with TarkovMonitor and RatScanner.',
        },
        {
          property: 'og:image',
          content: 'https://tarkovtracker.org/img/logos/tarkovtrackerlogo-light.webp',
        },
        { property: 'og:url', content: 'https://tarkovtracker.org' },
        // Twitter Card tags
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'TarkovTracker - Escape from Tarkov Progress Tracker' },
        {
          name: 'twitter:description',
          content:
            'Complete Escape from Tarkov progress tracker for patch 1.0+. Track quests, storyline, hideout, and needed items. Team collaboration features and API integration with TarkovMonitor and RatScanner.',
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
    '@nuxt/eslint',
    // Only load test utils during local dev/test so production builds don't try to resolve devDependency
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
      ? '@nuxt/test-utils/module'
      : undefined,
    '@pinia/nuxt',
    '@nuxt/ui',
    '@nuxt/image',
    '@nuxtjs/i18n',
    process.env.NODE_ENV === 'test' ? undefined : '@nuxtjs/sitemap',
  ].filter(Boolean) as string[],
  site: {
    url: 'https://tarkovtracker.org',
    name: 'TarkovTracker',
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
  image: {
    domains: ['avatars.githubusercontent.com', 'github.com'],
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
    },
    {
      path: '~/features',
      pathPrefix: false,
    },
    {
      path: '~/shell',
      pathPrefix: false,
    },
  ],
  typescript: {
    tsConfig: {
      compilerOptions: {
        baseUrl: '.',
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
            if (id.includes('node_modules/d3')) {
              return 'vendor-d3';
            }
            if (id.includes('node_modules/graphology')) {
              return 'vendor-graphology';
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
