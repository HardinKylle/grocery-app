import { defineConfig } from 'vitest/config';

// Runs through `npm test`, which starts the Firestore emulator first.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    fileParallelism: false,
  },
});
