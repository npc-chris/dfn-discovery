import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
    exclude: [
      'dist/**', 
      'src/services/core-intelligence.test.ts', 
      'src/services/ai-providers/adapter.test.ts', 
      'src/routes/scoring.test.ts',
      'src/routes/enrichment.test.ts',
      '../.agents/**',
      '../.claude/**',
      '../agents/**',
      '../claude/**'
    ],
  },
});
