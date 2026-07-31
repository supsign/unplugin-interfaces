import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'lcov'],
      // Schwellen liegen knapp unter dem Ist-Stand: sie sollen einen Rueckbau
      // der Abdeckung stoppen, nicht bei jedem Refactoring rot werden.
      thresholds: { branches: 85, functions: 90, lines: 90, statements: 90 },
    },
  },
});
