import path from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import eslintPlugin from "vite-plugin-eslint";
import vueI18n from "@intlify/vite-plugin-vue-i18n";
import vuetify from "vite-plugin-vuetify";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true,
  },
  plugins: [
    vue(),
    eslintPlugin(),
    vueI18n({
      include: path.resolve(__dirname, "./src/locales/**"),
    }),
    vuetify({ autoImport: true }),
  ],
  server: {
    port: 5173, // Default Vite port
  },
});
