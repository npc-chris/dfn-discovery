/**
 * Job State Transitions Tests
 *
 * Test coverage for Phase 3, Task 3.4:
 * - State machine validation
 * - State transition tracking
 * - Transition history
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createJob,
  submitJob,
  getJob,
  isValidStateTransition,
  transitionJobStatus,
  getJobStateTransitionHistory,
} from '../services/job-intake';
import type { JobInput } from '@dfn/shared';

const mockJobInput: JobInput = {
  company_name: 'Test Company',
  product_name: 'Test Product',
  location: { country: 'US', state: 'CA' },
};

describe('Job State Transitions - Task 3.4', () => {
  let testJobId: string;

  beforeEach(async () => {
    const job = await createJob(mockJobInput, 'test-org', 'test-user');
    testJobId = job.id;
  });

  describe('isValidStateTransition', () => {
    it('should allow draft → submitted', () => {
      expect(isValidStateTransition('draft', 'submitted')).toBe(true);
    });

    it('should allow draft → validation_failed', () => {
      expect(isValidStateTransition('draft', 'validation_failed')).toBe(true);
    });

    it('should allow submitted → normalized', () => {
      expect(isValidStateTransition('submitted', 'normalized')).toBe(true);
    });

    it('should allow submitted → analysis_failed', () => {
      expect(isValidStateTransition('submitted', 'analysis_failed')).toBe(true);
    });

    it('should allow normalized → analyzing', () => {
      expect(isValidStateTransition('normalized', 'analyzing')).toBe(true);
    });

    it('should allow analyzing → scored', () => {
      expect(isValidStateTransition('analyzing', 'scored')).toBe(true);
    });

    it('should allow scored → recommended', () => {
      expect(isValidStateTransition('scored', 'recommended')).toBe(true);
    });

    it('should allow recommended → published', () => {
      expect(isValidStateTransition('recommended', 'published')).toBe(true);
    });

    it('should allow published → archived', () => {
      expect(isValidStateTransition('published', 'archived')).toBe(true);
    });

    it('should allow failure states to be archived', () => {
      expect(isValidStateTransition('validation_failed', 'archived')).toBe(true);
      expect(isValidStateTransition('analysis_failed', 'archived')).toBe(true);
      expect(isValidStateTransition('scoring_failed', 'archived')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(isValidStateTransition('draft', 'analyzing')).toBe(false);
      expect(isValidStateTransition('submitted', 'published')).toBe(false);
      expect(isValidStateTransition('archived', 'submitted')).toBe(false);
    });

    it('should reject transitions from archived', () => {
      expect(isValidStateTransition('archived', 'analyzing')).toBe(false);
      expect(isValidStateTransition('archived', 'draft')).toBe(false);
    });
  });

  describe('transitionJobStatus', () => {
    it('should transition job from draft to submitted', async () => {
      await submitJob(testJobId);

      const job = await getJob(testJobId);
      expect(job?.status).toEqual('submitted');
    });

    it('should throw error on invalid transition', async () => {
      // Job starts as draft
      await expect(async () => {
        await transitionJobStatus(testJobId, 'analyzing', 'system');
      }).rejects.toThrow('Invalid state transition');
    });

    it('should throw error if job not found', async () => {
      await expect(async () => {
        await transitionJobStatus('non-existent-id', 'submitted', 'system');
      }).rejects.toThrow('Job not found');
    });

    it('should increment job version on transition', async () => {
      const job1 = await getJob(testJobId);
      expect(job1?.version).toEqual(1);

      // Transition via submitJob (which calls transitionJobStatus)
      await submitJob(testJobId);

      const job2 = await getJob(testJobId);
      expect(job2?.version).toEqual(2);
    });

    it('should record transition in metadata', async () => {
      await submitJob(testJobId);

      const job = await getJob(testJobId);
      const metadata = job?.metadata as Record<string, unknown>;
      const transitions = metadata?.state_transitions as Array<Record<string, unknown>>;

      expect(transitions).toBeDefined();
      expect(transitions.length).toBeGreaterThan(0);

      const lastTransition = transitions[transitions.length - 1];
      expect(lastTransition.from).toEqual('draft');
      expect(lastTransition.to).toEqual('submitted');
    });

    it('should record source (user, queue-worker, system)', async () => {
      await submitJob(testJobId);

      const history = await getJobStateTransitionHistory(testJobId);
      expect(history.length).toBeGreaterThan(0);

      const lastTransition = history[history.length - 1];
      expect(['user', 'queue-worker', 'system']).toContain(lastTransition.source);
    });

    it('should record timestamp on transition', async () => {
      await submitJob(testJobId);

      const history = await getJobStateTransitionHistory(testJobId);
      const lastTransition = history[history.length - 1];

      expect(lastTransition.timestamp).toBeDefined();
      // Verify it's a valid ISO date
      expect(new Date(lastTransition.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('getJobStateTransitionHistory', () => {
    it('should return empty array for new job', async () => {
      const history = await getJobStateTransitionHistory(testJobId);
      expect(history).toHaveLength(0);
    });

    it('should return all transitions in order', async () => {
      // Transition 1: draft → submitted
      await submitJob(testJobId);

      // Get transitions
      const history = await getJobStateTransitionHistory(testJobId);
      expect(history).toHaveLength(1);
      expect(history[0].from).toEqual('draft');
      expect(history[0].to).toEqual('submitted');
    });

    it('should return transitions with correct fields', async () => {
      await submitJob(testJobId);

      const history = await getJobStateTransitionHistory(testJobId);
      const transition = history[0];

      expect(transition).toHaveProperty('from');
      expect(transition).toHaveProperty('to');
      expect(transition).toHaveProperty('source');
      expect(transition).toHaveProperty('timestamp');
    });

    it('should return non-existent job as empty array', async () => {
      const history = await getJobStateTransitionHistory('non-existent-id');
      expect(history).toEqual([]);
    });
  });

  describe('State Machine Integration', () => {
    it('should enforce full happy-path state machine', async () => {
      // draft → submitted
      await submitJob(testJobId);
      let job = await getJob(testJobId);
      expect(job?.status).toEqual('submitted');

      // submitted → normalized (via queue worker)
      await transitionJobStatus(testJobId, 'normalized', 'queue-worker');
      job = await getJob(testJobId);
      expect(job?.status).toEqual('normalized');

      // normalized → analyzing (via queue worker)
      await transitionJobStatus(testJobId, 'analyzing', 'queue-worker');
      job = await getJob(testJobId);
      expect(job?.status).toEqual('analyzing');

      // analyzing → scored (via queue worker)
      await transitionJobStatus(testJobId, 'scored', 'queue-worker');
      job = await getJob(testJobId);
      expect(job?.status).toEqual('scored');

      // scored → recommended (via queue worker)
      await transitionJobStatus(testJobId, 'recommended', 'queue-worker');
      job = await getJob(testJobId);
      expect(job?.status).toEqual('recommended');

      // recommended → published (via user)
      await transitionJobStatus(testJobId, 'published', 'user');
      job = await getJob(testJobId);
      expect(job?.status).toEqual('published');

      // published → archived (via system)
      await transitionJobStatus(testJobId, 'archived', 'system');
      job = await getJob(testJobId);
      expect(job?.status).toEqual('archived');
    });

    it('should allow failure path: submitted → analysis_failed → archived', async () => {
      // draft → submitted
      await submitJob(testJobId);

      // submitted → analysis_failed (queue worker failure)
      await transitionJobStatus(testJobId, 'analysis_failed', 'queue-worker');
      let job = await getJob(testJobId);
      expect(job?.status).toEqual('analysis_failed');

      // analysis_failed → archived (system cleanup)
      await transitionJobStatus(testJobId, 'archived', 'system');
      job = await getJob(testJobId);
      expect(job?.status).toEqual('archived');
    });

    it('should track full transition history', async () => {
      // Perform multiple transitions
      await submitJob(testJobId);
      await transitionJobStatus(testJobId, 'normalized', 'queue-worker');
      await transitionJobStatus(testJobId, 'analyzing', 'queue-worker');

      const history = await getJobStateTransitionHistory(testJobId);
      expect(history.length).toBeGreaterThanOrEqual(3);

      // Verify sequence
      expect(history[0].from).toEqual('draft');
      expect(history[0].to).toEqual('submitted');

      expect(history[1].from).toEqual('submitted');
      expect(history[1].to).toEqual('normalized');

      expect(history[2].from).toEqual('normalized');
      expect(history[2].to).toEqual('analyzing');
    });
  });
});
