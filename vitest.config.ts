import { defineConfig } from 'vitest/config';

// Unit tests (`npm test`). Rules tests use vitest.rules.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
