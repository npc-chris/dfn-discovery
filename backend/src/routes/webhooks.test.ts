import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import express, { Express } from 'express';
import type { Server } from 'http';
import router from './webhooks';
import type { PrismReportManifest } from '@dfn/shared/types';

describe('Prism Webhook Handler [KAN-12]', () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  const manifest: PrismReportManifest = {
    schema_version: '1.1',
    report_id: 'rep-uuid-001',
    job_id: 'job-uuid-101',
    created_at: new Date().toISOString(),
    source_file: {
      filename: 'chassis-bracket.step',
      format: 'STEP',
      size_bytes: 1048576,
      hash_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    geometry: {
      volume_mm3: 15420.5,
      surface_area_mm2: 8900.2,
      bounding_box: { x_mm: 120.0, y_mm: 85.0, z_mm: 32.5 },
      is_watertight: true,
      face_count: 42,
    },
    features: [
      { type: 'through_hole', diameter_mm: 6.5, depth_mm: 32.5, confidence: 0.98 },
      { type: 'fillet', confidence: 0.92 },
    ],
    material: {
      inferred: 'aluminum_alloy',
      confidence: 0.95,
      source: 'step_metadata',
    },
    workflows: [
      {
        steps: [
          { process: 'cnc_milling_3axis', confidence: 0.95, is_primary: true },
          { process: 'deburring', confidence: 0.88, is_primary: false },
        ],
        estimated_complexity: 'Medium',
      },
    ],
    dfm_issues: [],
    complexity_score: 4.8,
  };

  const payloadStr = JSON.stringify(manifest);

  beforeAll(async () => {
    app = express();
    app.use(express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      }
    }));
    app.use('/webhooks', router);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}/webhooks`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('returns 400 when required manifest fields are missing', async () => {
    const resBad = await fetch(`${baseUrl}/prism`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: true }),
    });
    expect(resBad.status).toBe(400);
    const badData = await resBad.json();
    expect(badData.error).toContain('Missing required manifest fields');
  });

  it('returns 200 and extracts telemetry in dev mode without secret', async () => {
    delete process.env.PRISM_WEBHOOK_SECRET;
    const resDev = await fetch(`${baseUrl}/prism`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadStr,
    });
    expect(resDev.status).toBe(200);
    const devData = await resDev.json();
    expect(devData.received).toBe(true);
    expect(devData.job_id).toBe('job-uuid-101');
    expect(devData.report_id).toBe('rep-uuid-001');
    expect(devData.complexity_score).toBe(4.8);
  });

  it('verifies HMAC signature and rejects mismatched signatures with 401', async () => {
    const testSecret = 'secret-prism-token-2026';
    process.env.PRISM_WEBHOOK_SECRET = testSecret;

    const resInvalidSig = await fetch(`${baseUrl}/prism`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-prism-signature': 'sha256=badbadbadbadbadbadbadbad',
      },
      body: payloadStr,
    });
    expect(resInvalidSig.status).toBe(401);

    const validSig = 'sha256=' + crypto.createHmac('sha256', testSecret).update(payloadStr).digest('hex');
    const resValidSig = await fetch(`${baseUrl}/prism`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-prism-signature': validSig,
      },
      body: payloadStr,
    });
    expect(resValidSig.status).toBe(200);
    const validData = await resValidSig.json();
    expect(validData.received).toBe(true);
  });
});
