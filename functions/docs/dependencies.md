# Dependency Details

This document provides detailed explanations for each dependency in `package.json` under the `functions` directory.

## Production Dependencies

### body-parser

- Purpose: Middleware to parse JSON and URL-encoded payloads in incoming requests.
- Reason: Simplifies access to request data via `req.body`.

### cors

- Purpose: Enables Cross-Origin Resource Sharing.
- Reason: Allows the frontend to interact with cloud functions across different domains safely.

### express

- Purpose: Web framework for building APIs and HTTP servers.
- Reason: Provides routing and middleware support for defining function endpoints.

### firebase-admin

- Purpose: Admin SDK for server-side Firebase interactions.
- Reason: Required for managing Firestore, Auth, and other Firebase services in cloud functions.

### firebase-functions

- Purpose: SDK for defining and configuring Firebase Cloud Functions.
- Reason: Core library to create functions and respond to Firebase events.

### graphql-request

- Purpose: Lightweight GraphQL client for making API requests.
- Reason: Used to query external GraphQL APIs with minimal configuration.

### graphql-tag

- Purpose: Parses GraphQL query strings into AST.
- Reason: Works alongside GraphQL clients to ensure proper query formatting.

### swagger-jsdoc

- Purpose: Generates Swagger/OpenAPI specs from JSDoc comments.
- Reason: Automates API documentation generation for easier client integration.

### uid-generator

- Purpose: Generates unique, URL-friendly IDs.
- Reason: Creates random identifiers for resources or short URLs.

## Development Dependencies

### @types/express

- Purpose: Adds TypeScript type definitions for Express.
- Reason: Enables static type checking and better autocompletion.

### @types/node

- Purpose: Adds Node.js core type definitions.
- Reason: Provides type definitions for built-in Node modules.

### @types/node-fetch

- Purpose: Type definitions for `node-fetch`.
- Reason: Ensures type safety when using the `node-fetch` library.

### @types/swagger-jsdoc

- Purpose: Type definitions for `swagger-jsdoc`.
- Reason: Provides IDE integration and static checks for documentation code.

### @types/uid-generator

- Purpose: Type definitions for `uid-generator`.
- Reason: Improves type safety when generating UIDs.

### @typescript-eslint/eslint-plugin

- Purpose: ESLint rules tailored for TypeScript.
- Reason: Enforces coding standards and catches errors in TypeScript code.

### @typescript-eslint/parser

- Purpose: Parses TypeScript syntax for ESLint.
- Reason: Allows ESLint to understand TypeScript language features.

### @vitest/coverage-istanbul

- Purpose: Istanbul coverage reporter for Vitest.
- Reason: Generates code coverage reports using Istanbul.

### @vitest/coverage-v8

- Purpose: V8 coverage reporter for Vitest.
- Reason: Generates code coverage reports using V8 engine.

### eslint

- Purpose: Linter for JavaScript/TypeScript.
- Reason: Identifies and reports code quality issues.

### firebase-functions-test

- Purpose: Library for testing Firebase Cloud Functions.
- Reason: Provides testing utilities and mock environments for unit tests.

### prettier

- Purpose: Code formatter.
- Reason: Ensures consistent code style across the project.

### typescript

- Purpose: Superset of JavaScript with types.
- Reason: Enables static type checking and modern JavaScript features.

### vitest

- Purpose: Test runner powered by Vite.
- Reason: Runs unit tests quickly with built-in support for ESM and TypeScript.
