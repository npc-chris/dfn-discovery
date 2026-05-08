// Core Intelligence Service
// Computes fit scores, feasibility, and recommendation ranking

import { Recommendation, ScoringInput } from '@dfn/shared';

export async function scoreJob(input: ScoringInput): Promise<Recommendation> {
  // TODO: implement scoring logic
  // 1. Load job and factory profile
  // 2. Compute component scores (process, material, capacity, etc.)
  // 3. Apply confidence penalty
  // 4. Return recommendation with evidence
  throw new Error('Not implemented');
}

export async function rankRecommendations(jobId: string): Promise<Recommendation[]> {
  // TODO: get all recommendations for a job and rank them
  throw new Error('Not implemented');
}
