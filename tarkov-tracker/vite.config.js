import path from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueI18n from "@intlify/unplugin-vue-i18n/vite";
import vuetify from "vite-plugin-vuetify";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Enable / disable compatibility flags
    // -> https://v3-migration.vuejs.org/breaking-changes/runtime-compiler.html#compat-configuration
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  build: {
    sourcemap: true,
  },
  plugins: [
    vue(),
    vueI18n({
      include: path.resolve(__dirname, "./src/locales/**"),
    }),
    vuetify({ autoImport: true }),
  ],
  server: {
    port: 5173, // Default Vite port
  },
});
