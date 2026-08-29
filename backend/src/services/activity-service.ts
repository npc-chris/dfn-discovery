/**
 * Activity Service
 *
 * Manages project and RFQ activity events, providing real-time telemetry
 * and audit stream tracking with relative timestamps for the UI dashboard.
 */

import { insertActivity, listActivities } from '../db/queries';

export interface ActivityEntry {
  id?: string;
  projectId?: string | null;
  jobId?: string | null;
  orgId: string;
  eventType: string;
  title: string;
  description: string;
  severity?: 'info' | 'success' | 'warning' | 'danger';
  metadata?: Record<string, any> | null;
  actor?: string | null;
  createdAt?: Date;
}

export interface FormattedActivity {
  id: string;
  timestamp: string;
  timeRelative: string;
  title: string;
  description: string;
  severity: 'info' | 'success' | 'warning' | 'danger';
  eventType: string;
  projectId?: string | null;
  jobId?: string | null;
  actor?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Convert Date to relative time string (e.g., '2m ago', '1h ago', '3d ago')
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return 'just now';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 0 || diffMs < 60000) {
    return 'just now';
  }

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }

  return d.toLocaleDateString();
}

/**
 * Record an activity event
 */
export async function recordActivity(entry: ActivityEntry) {
  return insertActivity({
    project_id: entry.projectId ?? null,
    job_id: entry.jobId ?? null,
    org_id: entry.orgId,
    event_type: entry.eventType,
    title: entry.title,
    description: entry.description,
    severity: entry.severity ?? 'info',
    metadata: entry.metadata ?? null,
    actor: entry.actor ?? null,
  });
}

/**
 * Fetch and format activities for an organization, optionally filtered by project or job
 */
export async function getFormattedActivities(
  orgId: string,
  options?: {
    projectId?: string;
    jobId?: string;
    limit?: number;
  },
): Promise<FormattedActivity[]> {
  const rows = await listActivities(orgId, options);

  return rows.map((row) => ({
    id: row.id,
    timestamp: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    timeRelative: formatRelativeTime(row.created_at),
    title: row.title,
    description: row.description,
    severity: (row.severity as 'info' | 'success' | 'warning' | 'danger') ?? 'info',
    eventType: row.event_type,
    projectId: row.project_id,
    jobId: row.job_id,
    actor: row.actor,
    metadata: (row.metadata as Record<string, any>) ?? null,
  }));
}
