#!/usr/bin/env node
import { aggregateResults } from './validation-plan.mjs';
try {
  const errors = aggregateResults(
    JSON.parse(process.env.VALIDATION_PLAN || 'null'),
    JSON.parse(process.env.CI_NEEDS || '{}')
  );
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('All selected CI jobs passed.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
