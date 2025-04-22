# TarkovTracker Functions Testing Guide

This directory contains tests for the Firebase Cloud Functions in the TarkovTracker application.

## Testing Approach

We use [Vitest](https://vitest.dev/) as our testing framework, which provides a modern, fast testing experience similar to Jest.

### Types of Tests

1. **Unit Tests**: For isolated testing of function logic without external dependencies.
2. **Integration Tests**: For testing function logic with mocked Firebase services.

## Test Structure and Organization

The test directory is organized by functionality:

### Core Test Files

- **apiv2.test.js** - Tests for the v2 REST API
- **token-consolidated.test.js** - Consolidated token management tests
- **team-consolidated.test.js** - Consolidated team management tests
- **updateTarkovdata-consolidated.test.js** - Consolidated tests for the Tarkov data update functionality

### Support Files

- **setup.js** - Global setup for tests including mock configurations
- **mocks.js** - Common mock implementations
- ****mocks**/** - Directory for module mocks

## Cleanup Status

**Consolidated Files** (KEEP)

- token-consolidated.test
- team-consolidated.test
- updateTarkovdata-consolidated.test.js
- apiv2.test
**Files to Remove** (once consolidated tests are fixed)
- token-unit.test
- token-simple.test
- fixed-token.test
- working-token.test
- token.mock.test
- simple-token.test
- token-fixed.test
- token-improved.test
- token.test
- leaveTeam.test
- team.test
- updateTarkovdata.test
- basic.test
- minimal.test
- mock.test

## Current Issues

1. **Token Consolidated Tests**: Failing due to issues with mock implementations for Firestore
2. **Team and Tarkovdata Imports**: Issues with importing functions that use `functions.schedule`
3. **API Tests**: Some API endpoints need additional coverage

## Mocking Issues

The current mocks may need updates to handle ESM imports properly. The main issues are:

1. Firestore mocks are not being properly used in token tests (collection not found)
2. Functions schedule related errors in team and Tarkovdata imports

## Writing Effective Tests

### Unit Testing Functions

For unit testing function logic in isolation, follow this approach:

1. Mock external dependencies (Firebase Admin, Firebase Functions) minimally.
2. Test the core validation or business logic of the function.
3. Avoid importing the actual function if it has complex dependencies.

Example:

```javascript
// 1. Mock dependencies
vi.mock('firebase-functions', () => ({
  default: {
    https: {
      HttpsError: vi.fn((code, message) => {
        const error = new Error(message);
        error.code = code;
        return error;
      }),
      onCall: vi.fn(fn => fn)
    },
    logger: { log: vi.fn(), error: vi.fn() }
  }
}));

// 2. Define and test a simplified version of the function
const validationFunction = (data, context) => {
  if (!context?.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  if (!data.requiredField) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing field');
  }
  return { success: true };
};
```

### Integration Testing with Firebase Mocks

For testing functions with Firebase dependencies:

1. Create chainable mock objects for Firestore.
2. Mock transactions properly to handle promises.
3. Place mocks before any imports that use them.
4. Watch for hoisting issues with `vi.mock()`.

Example:

```javascript
// 1. Define mocks before imports
vi.mock('firebase-admin', () => {
  // Create a chainable mock
  const firestoreMock = {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({
      exists: false,
      data: () => ({})
    }),
    runTransaction: vi.fn(async cb => {
      return cb({
        get: vi.fn().mockResolvedValue({
          exists: false,
          data: () => ({})
        }),
        set: vi.fn(),
        update: vi.fn()
      });
    })
  };

  return {
    default: {
      firestore: vi.fn().mockReturnValue(firestoreMock)
    }
  };
});
```

## Running Tests

Run a specific test file:

```bash
npx vitest run test/token-consolidated.test
```

Run all tests:

```bash
npx vitest run
```

Run tests in watch mode during development:

```bash
npx vitest
```
