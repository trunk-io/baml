import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // CI hands junit.xml to Trunk Flaky Tests (docs/flaky-tests.md); locally
    // the extra reporter would only litter the package root.
    reporters: process.env.CI
      ? ['default', ['junit', { outputFile: 'junit.xml' }]]
      : ['default'],
  },
});
