// API client for frontend
// Handles all backend API calls

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function createJob(input: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Failed to create job');
  }

  return response.json();
}

export async function getJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch job');
  }

  return response.json();
}

export async function submitJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/submit`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to submit job');
  }

  return response.json();
}

export async function getRecommendation(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/recommendation`);

  if (!response.ok) {
    throw new Error('Failed to fetch recommendation');
  }

  return response.json();
}
