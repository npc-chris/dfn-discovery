/**
 * Webhook Routes
 *
 * Inbound event receivers for third-party CMMS and inspection integrations.
 * Each endpoint receives raw body for HMAC signature verification, then
 * enqueues a refresh job for the affected factory.
 *
 * Supported integrations:
 * - POST /webhooks/safetyculture  (SafetyCulture / iAuditor audit events)
 * - POST /webhooks/upkeep         (UpKeep work-order create/update events)
 *
 * HMAC verification:
 *   - SafetyCulture: x-iauditor-signature header, SAFETYCULTURE_WEBHOOK_SECRET env var
 *   - UpKeep:        x-upkeep-signature header,   UPKEEP_WEBHOOK_SECRET env var
 *
 * When the secret is absent the signature check is skipped with a warning
 * (allows local development without credentials). When the secret is present
 * and the signature does not match, the request is rejected with HTTP 401.
 */

import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { enqueueJob } from '../workers/queue';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verify an HMAC-SHA256 signature against a raw request body.
 *
 * @param rawBody   - The raw body buffer from the request
 * @param secret    - Shared webhook secret (env var)
 * @param signature - Value of the signature header (may include a prefix like 'sha256=')
 * @returns true if signature is valid, false otherwise
 */
function verifyHmacSignature(rawBody: Buffer, secret: string, signature: string): boolean {
  // Some providers prefix the hex digest with 'sha256='
  const normalised = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(normalised, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    // Mismatched lengths (invalid hex) → not equal
    return false;
  }
}

/**
 * Extract a factory ID from an inbound webhook payload.
 *
 * Both SafetyCulture and UpKeep payloads are expected to contain an
 * object with a nested `factory_id` or `location.id` field that maps
 * to the DFN factory UUID. If neither is found, returns null.
 */
function extractFactoryId(payload: Record<string, unknown>): string | null {
  if (typeof payload.factory_id === 'string') return payload.factory_id;
  const asset = payload.asset as Record<string, unknown> | undefined;
  if (typeof (asset?.location as any)?.id === 'string') return (asset?.location as any).id as string;
  const data = payload.data as Record<string, unknown> | undefined;
  if (typeof data?.siteId === 'string') return data.siteId as string;
  return null;
}

// ---------------------------------------------------------------------------
// POST /webhooks/safetyculture
// ---------------------------------------------------------------------------

/**
 * Receive SafetyCulture (iAuditor) audit completion events.
 *
 * Expected headers:
 *   x-iauditor-signature: sha256=<hmac-hex>
 *
 * Expected body shape (minimal):
 *   {
 *     "factory_id": "<dfn-factory-uuid>",   // DFN-specific extension field
 *     "audit": { "audit_id": "...", "score": 85, "maxScore": 100, ... }
 *   }
 *
 * On success: enqueues a 'refresh-site-brief' job and returns HTTP 200.
 */
router.post('/safetyculture', async (req: Request, res: Response): Promise<void> => {
  const rawBody: Buffer = (req as any).rawBody;
  const signature = req.headers['x-iauditor-signature'] as string | undefined;
  const secret = process.env.SAFETYCULTURE_WEBHOOK_SECRET;

  // HMAC verification
  if (secret) {
    if (!signature) {
      res.status(401).json({ error: 'Missing x-iauditor-signature header' });
      return;
    }
    if (!rawBody || !verifyHmacSignature(rawBody, secret, signature)) {
      res.status(401).json({ error: 'Invalid SafetyCulture webhook signature' });
      return;
    }
  } else {
    console.warn('[webhooks/safetyculture] SAFETYCULTURE_WEBHOOK_SECRET not set — skipping HMAC verification (dev mode)');
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? JSON.parse(rawBody.toString('utf8')) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const factoryId = extractFactoryId(payload);
  if (!factoryId) {
    // Accept the event but skip queuing — factory not mapped
    console.warn('[webhooks/safetyculture] No factory_id found in payload; skipping queue enqueue');
    res.status(200).json({ received: true, queued: false, reason: 'factory_id not found in payload' });
    return;
  }

  try {
    const queueJobId = await enqueueJob('refresh-site-brief', factoryId, {
      factory_id: factoryId,
      trigger: 'safetyculture-webhook',
      event: payload,
    });
    res.status(200).json({ received: true, queued: true, queueJobId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If already queued, still acknowledge — webhook delivery should not retry
    if (msg.includes('already queued')) {
      res.status(200).json({ received: true, queued: false, reason: 'already queued' });
      return;
    }
    console.error('[webhooks/safetyculture] Failed to enqueue job:', msg);
    res.status(500).json({ error: 'Failed to enqueue refresh job' });
  }
});

// ---------------------------------------------------------------------------
// POST /webhooks/upkeep
// ---------------------------------------------------------------------------

/**
 * Receive UpKeep work-order create/update events.
 *
 * Expected headers:
 *   x-upkeep-signature: sha256=<hmac-hex>
 *
 * Expected body shape (minimal):
 *   {
 *     "factory_id": "<dfn-factory-uuid>",   // DFN-specific extension field
 *     "workOrder": { "id": "...", "status": "open", "priority": "high", ... }
 *   }
 *
 * On success: enqueues a 'refresh-site-brief' job and returns HTTP 200.
 */
router.post('/upkeep', async (req: Request, res: Response): Promise<void> => {
  const rawBody: Buffer = (req as any).rawBody;
  const signature = req.headers['x-upkeep-signature'] as string | undefined;
  const secret = process.env.UPKEEP_WEBHOOK_SECRET;

  // HMAC verification
  if (secret) {
    if (!signature) {
      res.status(401).json({ error: 'Missing x-upkeep-signature header' });
      return;
    }
    if (!rawBody || !verifyHmacSignature(rawBody, secret, signature)) {
      res.status(401).json({ error: 'Invalid UpKeep webhook signature' });
      return;
    }
  } else {
    console.warn('[webhooks/upkeep] UPKEEP_WEBHOOK_SECRET not set — skipping HMAC verification (dev mode)');
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? JSON.parse(rawBody.toString('utf8')) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const factoryId = extractFactoryId(payload);
  if (!factoryId) {
    console.warn('[webhooks/upkeep] No factory_id found in payload; skipping queue enqueue');
    res.status(200).json({ received: true, queued: false, reason: 'factory_id not found in payload' });
    return;
  }

  try {
    const queueJobId = await enqueueJob('refresh-site-brief', factoryId, {
      factory_id: factoryId,
      trigger: 'upkeep-webhook',
      event: payload,
    });
    res.status(200).json({ received: true, queued: true, queueJobId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already queued')) {
      res.status(200).json({ received: true, queued: false, reason: 'already queued' });
      return;
    }
    console.error('[webhooks/upkeep] Failed to enqueue job:', msg);
    res.status(500).json({ error: 'Failed to enqueue refresh job' });
  }
});

export default router;
