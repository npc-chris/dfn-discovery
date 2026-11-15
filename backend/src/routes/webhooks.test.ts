import assert from 'assert';
import crypto from 'crypto';
import express, { Express } from 'express';
import router from './webhooks';
import type { PrismReportManifest } from '@dfn/shared/types';

// Create test express app
const app: Express = express();
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use('/webhooks', router);

async function testPrismWebhook() {
  console.log('Testing POST /webhooks/prism handling...');

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

  // Test 1: Missing job_id or report_id returns 400
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/webhooks`;

  try {
    // 1. Invalid payload missing job_id
    const resBad = await fetch(`${baseUrl}/prism`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: true }),
    });
    assert.strictEqual(resBad.status, 400, 'Expected 400 for missing job_id');
    const badData = await resBad.json();
    assert.ok(badData.error.includes('Missing required manifest fields'));
    console.log('  ✓ 400 returned for missing manifest fields');

    // 2. Valid payload without secret (dev mode fallback)
    delete process.env.PRISM_WEBHOOK_SECRET;
    const resDev = await fetch(`${baseUrl}/prism`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadStr,
    });
    assert.strictEqual(resDev.status, 200, 'Expected 200 in dev mode');
    const devData = await resDev.json();
    assert.strictEqual(devData.received, true);
    assert.strictEqual(devData.job_id, 'job-uuid-101');
    assert.strictEqual(devData.report_id, 'rep-uuid-001');
    assert.strictEqual(devData.complexity_score, 4.8);
    console.log('  ✓ 200 returned in dev mode with extracted manifest telemetry');

    // 3. HMAC signature verification with secret set
    const testSecret = 'secret-prism-token-2026';
    process.env.PRISM_WEBHOOK_SECRET = testSecret;

    const validSig = 'sha256=' + crypto.createHmac('sha256', testSecret).update(payloadStr).digest('hex');

    // 3a. Invalid signature returns 401
    const resInvalidSig = await fetch(`${baseUrl}/prism`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-prism-signature': 'sha256=badbadbadbadbadbadbadbad',
      },
      body: payloadStr,
    });
    assert.strictEqual(resInvalidSig.status, 401, 'Expected 401 for invalid HMAC');
    console.log('  ✓ 401 returned for mismatched HMAC signature');

    // 3b. Valid signature returns 200
    const resValidSig = await fetch(`${baseUrl}/prism`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-prism-signature': validSig,
      },
      body: payloadStr,
    });
    assert.strictEqual(resValidSig.status, 200, 'Expected 200 for valid HMAC signature');
    const validData = await resValidSig.json();
    assert.strictEqual(validData.received, true);
    console.log('  ✓ 200 returned for valid HMAC signature');

    console.log('\nAll Prism Webhook contract tests passed successfully!\n');
  } finally {
    server.close();
  }
}

testPrismWebhook().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
