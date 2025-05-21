import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueI18n from '@intlify/unplugin-vue-i18n/vite';
import vuetify from 'vite-plugin-vuetify';

// Get the directory name in an ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
  },
  define: {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    sourcemap: true,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Group specific large vendors into their own chunks
            if (id.includes('vuetify')) {
              return 'vuetify';
            }
            if (id.includes('@apollo') || id.includes('graphql')) {
              return 'apollo-graphql';
            }
            if (id.includes('firebase')) {
              return 'firebase';
            }
            if (id.includes('d3')) {
              return 'd3';
            }
            // Let Vite handle other node_modules with its default chunking strategy
          }
        },
      },
    },
  },
  plugins: [
    vue(),
    vueI18n({
      include: path.resolve(__dirname, './src/locales/**'),
    }),
    vuetify({ autoImport: true }),
  ],
  server: {
    port: 3000,
  },
});
