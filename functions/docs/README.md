# TarkovTracker Cloud Functions Documentation

## Overview

The `tarkovtracker-cloud-functions` directory contains Firebase Cloud Functions that power the backend for the TarkovTracker app. These functions handle HTTP requests, integrate with Firebase services, and generate API documentation.

## Dependencies

### Production Dependencies

- **body-parser**: Middleware to parse incoming JSON request bodies and make them available under `req.body`.
- **cors**: Enables Cross-Origin Resource Sharing so the frontend can call these functions from different origins.
- **express**: A fast, unopinionated web framework used to define HTTP routes and middleware.
- **firebase-admin**: The Firebase Admin SDK for interacting with Firebase services (Firestore, Auth, Storage) on the server side.
- **firebase-functions**: Firebase SDK for defining Cloud Functions and handling Firebase lifecycle events.
- **graphql-request**: A minimal GraphQL client for sending queries and mutations to GraphQL APIs.
- **graphql-tag**: Utility to parse GraphQL query strings into DocumentNode objects for use with GraphQL clients.
- **swagger-jsdoc**: Generates Swagger (OpenAPI) documentation from JSDoc comments in the codebase.
- **uid-generator**: Utility for generating short, random, URL-friendly unique identifiers.

### Development Dependencies

- **@types/express**: TypeScript type definitions for Express.
- **@types/node**: TypeScript type definitions for Node.js core modules.
- **@types/node-fetch**: Type definitions for the `node-fetch` package.
- **@types/swagger-jsdoc**: Type definitions for the `swagger-jsdoc` package.
- **@types/uid-generator**: Type definitions for the `uid-generator` package.
- **@typescript-eslint/eslint-plugin**: ESLint rules specific to TypeScript code.
- **@typescript-eslint/parser**: ESLint parser that supports TypeScript syntax.
- **@vitest/coverage-istanbul**: Coverage reporter integration for Vitest using Istanbul.
- **@vitest/coverage-v8**: Coverage reporter integration for Vitest using V8.
- **eslint**: Linter for identifying and reporting on patterns in JavaScript/TypeScript code.
- **firebase-functions-test**: Utilities for unit testing Firebase Cloud Functions locally.
- **prettier**: Opinionated code formatter to enforce consistent code style.
- **typescript**: Language and compiler for TypeScript, enabling static type checking.
- **vitest**: Vite-native test runner for writing and executing unit tests.
