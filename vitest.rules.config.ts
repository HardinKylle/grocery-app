import { defineConfig } from 'vitest/config';

// Firestore security rules tests. Run through `npm run test:rules`,
// which starts the Firestore emulator first.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
