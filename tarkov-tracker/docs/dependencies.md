# Dependency Details

This document provides detailed explanations for each dependency in `package.json` under the `tarkov-tracker` directory.

## Production Dependencies

### @apollo/client

- Purpose: Manages GraphQL queries, caching, and state management for UI data.
- Reason: Provides a robust GraphQL client for interacting with GraphQL backends.

### @mdi/font

- Purpose: Supplies Material Design Icons as a web font.
- Reason: Ensures consistent, scalable icons without additional HTTP requests.

### @vue/apollo-composable

- Purpose: Vue Composition API composables for GraphQL operations.
- Reason: Simplifies GraphQL calls within Vue components using Composition API.

### @vueuse/core

- Purpose: Utility library of Composition API functions.
- Reason: Reduces boilerplate for common tasks (reactive state, event listeners).

### d3

- Purpose: Data visualization library.
- Reason: Creates dynamic charts and graphs for analytics.

### firebase

- Purpose: Client SDK for Firebase services.
- Reason: Enables auth, database, storage, and messaging in the SPA.

### graphology

- Purpose: Graph data structure and algorithms library.
- Reason: Builds and analyzes network/graph data for advanced views.

### graphql

- Purpose: Core GraphQL definitions and parsing.
- Reason: Required by Apollo and tooling to process GraphQL documents.

### graphql-tag

- Purpose: Parses GraphQL query strings into AST.
- Reason: Lets you write queries as template literals in code.

### lodash-es

- Purpose: Modular JS utility functions as ES modules.
- Reason: Offers common helpers (clone, debounce) in a tree-shakeable way.

### pinia

- Purpose: State management library for Vue.
- Reason: Provides a type-safe, modular global store.

### pinia-plugin-persistedstate

- Purpose: Persists Pinia state across page reloads.
- Reason: Improves UX by remembering user preferences.

### qrcode

- Purpose: Browser QR code generator.
- Reason: Allows generating shareable codes for parties or invites.

### uuid

- Purpose: Generates unique identifiers.
- Reason: Ensures collision-free IDs for resources.

### vue

- Purpose: Reactive, component-based UI framework.
- Reason: Core of the SPA implementation.

### vue-i18n

- Purpose: Internationalization support.
- Reason: Enables multi-language UI.

### vue-router

- Purpose: Client-side routing library.
- Reason: Manages SPA navigation and URL mapping.

### vuefire

- Purpose: Vue bindings for Firebase.
- Reason: Provides reactive hooks for Firestore data.

### vuetify

- Purpose: Material Design component library.
- Reason: Supplies ready-to-use UI components styled to Material guidelines.

## Development Dependencies

### @intlify/unplugin-vue-i18n

- Purpose: Vite plugin for i18n file ingestion.
- Reason: Automates loading and compilation of translation files.

### @vitejs/plugin-vue

- Purpose: Vue SFC loader for Vite.
- Reason: Enables processing of `.vue` files.

### eslint

- Purpose: Static code analysis tool.
- Reason: Enforces best practices and catches errors early.

### eslint-config-prettier

- Purpose: Disables ESLint rules overlapping with Prettier.
- Reason: Prevents formatting conflicts.

### eslint-plugin-vue

- Purpose: Lint rules for Vue components.
- Reason: Ensures Vue code follows style and correctness guidelines.

### prettier

- Purpose: Code formatter.
- Reason: Maintains consistent style across codebase.

### sass

- Purpose: CSS preprocessor.
- Reason: Required for Vuetify theming and SCSS usage.

### typescript

- Purpose: Typed superset of JavaScript.
- Reason: Adds static type checking and modern JS features.

### vite

- Purpose: Modern build tool and dev server.
- Reason: Provides fast hot module replacement and optimized builds.

### vite-plugin-vuetify

- Purpose: Tree-shaking and style support for Vuetify in Vite.
- Reason: Reduces bundle size and integrates Vuetify theming.

### vue-eslint-parser

- Purpose: ESLint parser for Vue SFCs.
- Reason: Enables parsing `<template>` blocks and Vue syntax in linting.
