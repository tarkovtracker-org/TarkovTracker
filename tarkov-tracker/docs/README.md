# TarkovTracker Frontend Documentation

## Overview

The `tarkov-tracker` directory contains the Vue 3-based single-page application (SPA) that serves as the client UI for the TarkovTracker app. It uses Vite for bundling and dev server, Vuetify for Material Design components, Pinia for state management, and integrates with Firebase and GraphQL.

## Dependencies

### Production Dependencies

- **@apollo/client**: Core Apollo GraphQL client for sending queries and caching responses in the UI.
- **@mdi/font**: Material Design Icons as a web font for consistent iconography.
- **@vue/apollo-composable**: Vue Composition API integration for Apollo, simplifying GraphQL queries in components.
- **@vueuse/core**: Collection of Vue Composition API utilities (e.g., `useLocalStorage`, `useFetch`).
- **d3**: Data-driven documents library for creating interactive charts and visualizations.
- **firebase**: Firebase JS SDK for authentication, Firestore, and other Firebase services on the client.
- **graphology**: Graph theory library for building and analyzing network data structures.
- **graphql**: Core GraphQL library (parsing, validation) required by Apollo and tooling.
- **graphql-tag**: Parses GraphQL query strings into ASTs for use with GraphQL clients.
- **lodash-es**: ES module version of Lodash for utility functions (deep clone, debounce, etc.).
- **pinia**: Store management library for Vue, used for global state.
- **pinia-plugin-persistedstate**: Plugin to persist Pinia state (e.g., to `localStorage`).
- **qrcode**: Generates QR codes in the browser for sharing or invitations.
- **uuid**: Generates RFC-compliant UUIDs for unique identifiers.
- **vue**: Vue.js 3 framework core.
- **vue-i18n**: Internationalization plugin for Vue to support multiple languages.
- **vue-router**: Official Vue router for client-side navigation.
- **vuefire**: Vue bindings for Firebase, enabling reactive Firestore queries.
- **vuetify**: Material Design component framework for Vue.

### Development Dependencies

- **@intlify/unplugin-vue-i18n**: Vite plugin to load and compile i18n message files.
- **@vitejs/plugin-vue**: Enables Vue single-file component support in Vite.
- **eslint**: Linter for JavaScript/TypeScript to enforce code quality.
- **eslint-config-prettier**: Disables ESLint rules that conflict with Prettier formatting.
- **eslint-plugin-vue**: ESLint rules specific to Vue components.
- **prettier**: Code formatter to enforce consistent style.
- **sass**: SCSS preprocessor required by Vuetify styles.
- **typescript**: Adds static types and TS compilation.
- **vite**: Bundler and dev server for fast rebuilds.
- **vite-plugin-vuetify**: Integrates Vuetify with Vite for tree-shaking and styles.
- **vue-eslint-parser**: ESLint parser for Vue single-file components.
