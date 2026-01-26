// https://nuxt.com/docs/api/configuration/nuxt-config
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const appDir = resolve(__dirname, 'app');
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  srcDir: 'app',
  ignore: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'],
  runtimeConfig: {
    // Server-only (private) runtime config
    supabaseUrl:
      process.env.SB_URL || process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL || '',
    supabaseServiceKey:
      process.env.SB_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseAnonKey:
      process.env.SB_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NUXT_SUPABASE_ANON_KEY ||
      '',
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
      publicRoutes: process.env.API_PUBLIC_ROUTES || '/api/tarkov/*',
      // Whether to trust proxy headers (X-Forwarded-For, etc.)
      // ONLY enable this if the server is behind a trusted proxy like Cloudflare
      trustProxy: process.env.API_TRUST_PROXY === 'true',
    },
    public: {
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
      teamGatewayUrl: process.env.NUXT_PUBLIC_TEAM_GATEWAY_URL || '',
      tokenGatewayUrl: process.env.NUXT_PUBLIC_TOKEN_GATEWAY_URL || '',
      supabaseUrl:
        process.env.SB_URL || process.env.SUPABASE_URL || process.env.NUXT_SUPABASE_URL || '',
      supabaseAnonKey:
        process.env.SB_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.NUXT_SUPABASE_ANON_KEY ||
        '',
      adminWatchTimeoutMs: Number(process.env.ADMIN_WATCH_TIMEOUT_MS || '5000') || 5000,
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
    // Prerender the index page for zero-invocation loading of the SPA shell
    '/': { prerender: true },
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
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap',
        },
      ],
    },
  },
  css: ['~/assets/css/tailwind.css'],
  alias: {
    '@': appDir,
    '~': appDir,
  },
  modules: [
    '@nuxt/eslint',
    // Only load test utils during local dev/test so production builds don't try to resolve devDependency
    process.env.NODE_ENV === 'development' ? '@nuxt/test-utils/module' : undefined,
    '@pinia/nuxt',
    '@nuxt/ui',
    '@nuxt/image',
  ].filter(Boolean) as string[],
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
            if (id.includes('node_modules/@nuxt/ui') || id.includes('node_modules/@vueuse')) {
              return 'vendor-ui';
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
    plugins: [
      VueI18nPlugin({
        include: [resolve(appDir, 'locales/**/*.json5')],
        runtimeOnly: false,
        compositionOnly: false,
        strictMessage: false,
        escapeHtml: true,
      }),
    ],
  },
});
