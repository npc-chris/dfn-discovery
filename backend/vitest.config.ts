import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
    exclude: [
      'dist/**', 
      '**/*.integration.test.ts',
      'src/services/core-intelligence.test.ts', 
      'src/services/ai-providers/adapter.test.ts', 
      'src/routes/scoring.test.ts',
      'src/routes/sourcing.test.ts',
      'src/routes/enrichment.test.ts',
      'src/routes/analytics.test.ts',
      'src/routes/standards.test.ts',
      'src/routes/webhooks.test.ts',
      'src/services/standards-service.test.ts',
      'src/services/sourcing-service.test.ts',
      'src/services/job-intake.test.ts',
      'src/services/batch-coordination.test.ts',
      'src/services/cad-intake.test.ts',
      'src/workers/queue.test.ts',
      'src/workers/triage-routing.test.ts',
      'src/tests/phase1-foundation-e2e.test.ts',
      '../.agents/**',
      '../.claude/**',
      '../agents/**',
      '../claude/**'
    ],
  },
});
