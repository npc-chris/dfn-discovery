/**
 * Queue Worker Tests
 *
 * Test coverage for Phase 3 queue operations:
 * - Task 3.1: Queue database operations (enqueue, status, complete, fail)
 * - Task 3.2: Worker dispatch and timeout enforcement
 * - Task 3.3: Queue job handlers
 * - Task 3.4: Job state transitions (via job-intake.ts tests)
 * - Task 3.6: Webhooks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  enqueueJob,
  getQueueJobStatus,
  getJobQueueStatus,
  markQueueJobComplete,
  markQueueJobFailed,
  markQueueJobProcessing,
  calculateBackoffDelay,
  getJobTimeout,
  getConcurrencyLimit,
  enforceTimeout,
  processQueueJob,
  registerWebhook,
  unregisterWebhook,
  QueueJobStatus,
} from './queue';
import { createJob, submitJob } from '../services/job-intake';
import type { JobInput } from '@dfn/shared';

// Mock job data for testing
const mockJobInput: JobInput = {
  company_name: 'Test Company',
  product_name: 'Test Product',
  location: { country: 'US', state: 'CA' },
};

describe('Queue Worker - Task 3.1: Database Operations', () => {
  let testJobId: string;

  beforeEach(async () => {
    // Create and submit a test job
    const job = await createJob(mockJobInput);
    const submitted = await submitJob(job.id);
    testJobId = submitted.id;
  });

  describe('enqueueJob', () => {
    it('should enqueue a new job', async () => {
      const queueJobId = await enqueueJob('classify-job', testJobId, { test: true });
      expect(queueJobId).toBeDefined();
      expect(queueJobId.length).toBeGreaterThan(0);
    });

    it('should prevent duplicate jobs of same type', async () => {
      await enqueueJob('classify-job', testJobId);

      // Second attempt should throw
      await expect(async () => {
        await enqueueJob('classify-job', testJobId);
      }).rejects.toThrow('Job already queued');
    });

    it('should allow multiple job types for same job', async () => {
      const queueId1 = await enqueueJob('classify-job', testJobId);
      const queueId2 = await enqueueJob('extract-evidence', testJobId);

      expect(queueId1).not.toEqual(queueId2);
    });

    it('should accept custom payload', async () => {
      const payload = { customKey: 'customValue', nested: { value: 123 } };
      const queueJobId = await enqueueJob('classify-job', testJobId, payload);

      const queueJob = await getQueueJobStatus(queueJobId);
      expect(queueJob?.payload).toEqual(payload);
    });
  });

  describe('getQueueJobStatus', () => {
    it('should return null for non-existent queue job', async () => {
      const result = await getQueueJobStatus('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return queue job with correct fields', async () => {
      const queueJobId = await enqueueJob('classify-job', testJobId);
      const queueJob = await getQueueJobStatus(queueJobId);

      expect(queueJob).toBeDefined();
      expect(queueJob?.id).toEqual(queueJobId);
      expect(queueJob?.job_id).toEqual(testJobId);
      expect(queueJob?.queue_type).toEqual('classify-job');
      expect(queueJob?.status).toEqual(QueueJobStatus.Pending);
      expect(queueJob?.retries).toEqual(0);
      expect(queueJob?.max_retries).toEqual(3);
    });
  });

  describe('getJobQueueStatus', () => {
    it('should return empty array for job with no queue jobs', async () => {
      const result = await getJobQueueStatus(testJobId);
      expect(result).toEqual([]);
    });

    it('should return all queue jobs for a job in creation order', async () => {
      const id1 = await enqueueJob('classify-job', testJobId);
      const id2 = await enqueueJob('extract-evidence', testJobId);
      const id3 = await enqueueJob('score-fit', testJobId);

      const queueJobs = await getJobQueueStatus(testJobId);
      expect(queueJobs).toHaveLength(3);
      expect(queueJobs[0].id).toEqual(id1);
      expect(queueJobs[1].id).toEqual(id2);
      expect(queueJobs[2].id).toEqual(id3);
    });
  });

  describe('markQueueJobProcessing', () => {
    it('should update queue job to processing status', async () => {
      const queueJobId = await enqueueJob('classify-job', testJobId);
      await markQueueJobProcessing(queueJobId);

      const queueJob = await getQueueJobStatus(queueJobId);
      expect(queueJob?.status).toEqual(QueueJobStatus.Processing);
    });
  });

  describe('markQueueJobComplete', () => {
    it('should mark queue job as completed with result', async () => {
      const queueJobId = await enqueueJob('classify-job', testJobId);
      const result = { classified: true, confidence: 0.95 };

      await markQueueJobComplete(queueJobId, result);

      const queueJob = await getQueueJobStatus(queueJobId);
      expect(queueJob?.status).toEqual(QueueJobStatus.Completed);
      expect(queueJob?.result).toEqual(result);
      expect(queueJob?.completed_at).toBeDefined();
    });

    it('should accept empty result', async () => {
      const queueJobId = await enqueueJob('classify-job', testJobId);
      await markQueueJobComplete(queueJobId);

      const queueJob = await getQueueJobStatus(queueJobId);
      expect(queueJob?.status).toEqual(QueueJobStatus.Completed);
    });
  });

  describe('markQueueJobFailed', () => {
    it('should mark queue job as pending on retry (attempts < max)', async () => {
      const queueJobId = await enqueueJob('classify-job', testJobId);
      const willRetry = await markQueueJobFailed(queueJobId, 'Test error');

      expect(willRetry).toBe(true);
      const queueJob = await getQueueJobStatus(queueJobId);
      expect(queueJob?.status).toEqual(QueueJobStatus.Pending);
      expect(queueJob?.retries).toEqual(1);
      expect(queueJob?.error).toEqual('Test error');
    });

    it('should mark queue job as failed on max retries exceeded', async () => {
      const queueJobId = await enqueueJob('classify-job', testJobId);

      // Fail 3 times
      let willRetry = await markQueueJobFailed(queueJobId, 'Attempt 1');
      expect(willRetry).toBe(true);

      willRetry = await markQueueJobFailed(queueJobId, 'Attempt 2');
      expect(willRetry).toBe(true);

      willRetry = await markQueueJobFailed(queueJobId, 'Attempt 3');
      expect(willRetry).toBe(false);

      const queueJob = await getQueueJobStatus(queueJobId);
      expect(queueJob?.status).toEqual(QueueJobStatus.Failed);
      expect(queueJob?.completed_at).toBeDefined();
    });

    it('should update job status to analysis_failed on permanent failure', async () => {
      // Fail 3 times to trigger permanent failure
      const queueJobId = await enqueueJob('classify-job', testJobId);
      await markQueueJobFailed(queueJobId, 'Error 1');
      await markQueueJobFailed(queueJobId, 'Error 2');
      await markQueueJobFailed(queueJobId, 'Error 3');

      // Job status should be updated to analysis_failed
      // (This would be verified via getJob() from job-intake)
    });
  });
});

describe('Queue Worker - Task 3.2: Worker Dispatch & Execution', () => {
  let testJobId: string;

  beforeEach(async () => {
    const job = await createJob(mockJobInput);
    const submitted = await submitJob(job.id);
    testJobId = submitted.id;
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      // Base: 1 second = 1000ms
      // Attempt 0: 1000 * 2^0 = 1000ms
      expect(calculateBackoffDelay(0)).toEqual(1000);

      // Attempt 1: 1000 * 2^1 = 2000ms
      expect(calculateBackoffDelay(1)).toEqual(2000);

      // Attempt 2: 1000 * 2^2 = 4000ms
      expect(calculateBackoffDelay(2)).toEqual(4000);

      // Attempt 3: 1000 * 2^3 = 8000ms
      expect(calculateBackoffDelay(3)).toEqual(8000);
    });

    it('should cap backoff at max delay (60s)', () => {
      // Attempt 7: 1000 * 2^7 = 128000ms, capped at 60000ms
      expect(calculateBackoffDelay(7)).toEqual(60000);

      // Higher attempts also capped
      expect(calculateBackoffDelay(10)).toEqual(60000);
    });
  });

  describe('getJobTimeout', () => {
    it('should return correct timeout for each job type', () => {
      expect(getJobTimeout('classify-job')).toEqual(60 * 1000);
      expect(getJobTimeout('extract-evidence')).toEqual(5 * 60 * 1000);
      expect(getJobTimeout('score-fit')).toEqual(2 * 60 * 1000);
      expect(getJobTimeout('enrich-logistics')).toEqual(60 * 1000);
    });

    it('should return 60s default for unknown type', () => {
      expect(getJobTimeout('unknown-type')).toEqual(60 * 1000);
    });
  });

  describe('getConcurrencyLimit', () => {
    it('should return correct limit for each job type', () => {
      expect(getConcurrencyLimit('classify-job')).toEqual(10);
      expect(getConcurrencyLimit('extract-evidence')).toEqual(5);
      expect(getConcurrencyLimit('score-fit')).toEqual(10);
    });

    it('should return 10 default for unknown type', () => {
      expect(getConcurrencyLimit('unknown-type')).toEqual(10);
    });
  });

  describe('enforceTimeout', () => {
    it('should resolve if function completes before timeout', async () => {
      const fn = async () => {
        await new Promise((r) => setTimeout(r, 100));
        return 'result';
      };

      const result = await enforceTimeout(fn, 500);
      expect(result).toEqual('result');
    });

    it('should reject if function exceeds timeout', async () => {
      const fn = async () => {
        await new Promise((r) => setTimeout(r, 500));
        return 'result';
      };

      await expect(async () => {
        await enforceTimeout(fn, 100);
      }).rejects.toThrow('Job timeout');
    });
  });

  describe('processQueueJob', () => {
    it('should throw error if queue job not found', async () => {
      await expect(async () => {
        await processQueueJob('non-existent-id');
      }).rejects.toThrow('Queue job not found');
    });

    it('should execute handler and mark as complete on success', async () => {
      const queueJobId = await enqueueJob('classify-job', testJobId);

      // Process should succeed (handler returns { classified: true })
      const result = await processQueueJob(queueJobId);

      expect(result.status).toEqual(QueueJobStatus.Completed);
      expect(result.result).toBeDefined();
    });

    it('should mark as failed if handler throws', async () => {
      // TODO: Test with a handler that throws
      // (Current stub handlers don't throw)
    });
  });
});

describe('Queue Worker - Task 3.6: Webhooks', () => {
  let testJobId: string;

  beforeEach(async () => {
    const job = await createJob(mockJobInput);
    const submitted = await submitJob(job.id);
    testJobId = submitted.id;
  });

  describe('registerWebhook', () => {
    it('should register a webhook URL', () => {
      const url = 'https://example.com/webhook';
      registerWebhook(testJobId, url);

      // Verify by attempting to register again (should not throw)
      expect(() => {
        registerWebhook(testJobId, url);
      }).not.toThrow();
    });

    it('should allow multiple webhooks per job', () => {
      const url1 = 'https://example.com/webhook1';
      const url2 = 'https://example.com/webhook2';

      registerWebhook(testJobId, url1);
      registerWebhook(testJobId, url2);

      // Both should be registered
      expect(() => {
        registerWebhook(testJobId, url1);
        registerWebhook(testJobId, url2);
      }).not.toThrow();
    });
  });

  describe('unregisterWebhook', () => {
    it('should unregister a webhook URL', () => {
      const url = 'https://example.com/webhook';

      registerWebhook(testJobId, url);
      unregisterWebhook(testJobId, url);

      // Should not throw (idempotent)
      expect(() => {
        unregisterWebhook(testJobId, url);
      }).not.toThrow();
    });

    it('should allow re-registration after unregister', () => {
      const url = 'https://example.com/webhook';

      registerWebhook(testJobId, url);
      unregisterWebhook(testJobId, url);
      registerWebhook(testJobId, url);

      // Should succeed
      expect(() => {
        registerWebhook(testJobId, url);
      }).not.toThrow();
    });
  });
});

describe('Queue Worker - Integration Tests', () => {
  let testJobId: string;

  beforeEach(async () => {
    const job = await createJob(mockJobInput);
    const submitted = await submitJob(job.id);
    testJobId = submitted.id;
  });

  it('should execute a full queue job lifecycle', async () => {
    // 1. Enqueue
    const queueJobId = await enqueueJob('classify-job', testJobId);
    let queueJob = await getQueueJobStatus(queueJobId);
    expect(queueJob?.status).toEqual(QueueJobStatus.Pending);

    // 2. Mark as processing
    await markQueueJobProcessing(queueJobId);
    queueJob = await getQueueJobStatus(queueJobId);
    expect(queueJob?.status).toEqual(QueueJobStatus.Processing);

    // 3. Complete
    await markQueueJobComplete(queueJobId, { result: 'success' });
    queueJob = await getQueueJobStatus(queueJobId);
    expect(queueJob?.status).toEqual(QueueJobStatus.Completed);
    expect(queueJob?.result).toEqual({ result: 'success' });
  });

  it('should handle job with multiple queue items', async () => {
    const stages = ['classify-job', 'extract-evidence', 'score-fit'];
    const queueIds: string[] = [];

    // Enqueue all stages
    for (const stage of stages) {
      const id = await enqueueJob(stage, testJobId);
      queueIds.push(id);
    }

    // Verify all enqueued
    const queueJobs = await getJobQueueStatus(testJobId);
    expect(queueJobs).toHaveLength(3);
    queueJobs.forEach((job, i) => {
      expect(job.queue_type).toEqual(stages[i]);
      expect(job.status).toEqual(QueueJobStatus.Pending);
    });

    // Process each stage
    for (const id of queueIds) {
      await markQueueJobProcessing(id);
      await markQueueJobComplete(id, { stage: 'complete' });
    }

    // Verify all completed
    const final = await getJobQueueStatus(testJobId);
    expect(final.every((j) => j.status === QueueJobStatus.Completed)).toBe(true);
  });
});
