import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import http from 'http';
import { finworldClient, resolveFinworldBaseUrl } from '../services/finworld-client';

describe('Discovery RS256 JWKS Auth & Finworld Escrow Client', () => {
  const originalEnv = { ...process.env };
  let jwksServer: http.Server | null = null;
  let apiServer: http.Server | null = null;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    if (jwksServer) {
      await new Promise<void>((resolve) => jwksServer?.close(() => resolve()));
      jwksServer = null;
    }
    if (apiServer) {
      await new Promise<void>((resolve) => apiServer?.close(() => resolve()));
      apiServer = null;
    }
  });

  it('verifies dfn-digisec RS256 token when AUTH_ISSUER_URL has no trailing slash', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);

    jwksServer = http.createServer((req, res) => {
      if (req.url === '/.well-known/jwks.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [{ ...jwk, kid: 'digisec-k1', alg: 'RS256', use: 'sig' }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => jwksServer!.listen(0, '127.0.0.1', resolve));
    const addr = jwksServer.address() as { port: number };
    const issuerNoSlash = `http://127.0.0.1:${addr.port}`;

    process.env.AUTH_ISSUER_URL = issuerNoSlash;
    process.env.AUTH_AUDIENCE = 'dfn-discovery';

    const { authMiddleware } = await import('./auth');
    const app = express();
    app.get('/whoami', authMiddleware, (_req, res) => {
      res.json({ auth: res.locals.auth });
    });

    apiServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => apiServer!.once('listening', resolve));
    const apiAddr = apiServer.address() as { port: number };

    const token = await new SignJWT({
      'https://fabnetwork.com.ng/user_id': 88,
      'https://fabnetwork.com.ng/orgId': 'org_ogun_cnc',
      'https://fabnetwork.com.ng/orgRole': 'owner',
      'https://fabnetwork.com.ng/plan': 'business',
      'https://fabnetwork.com.ng/quotas': { jobsRemaining: 500, batchSizeLimit: 100, apiCallsRemaining: 20000 },
      'https://fabnetwork.com.ng/features': ['discovery:analytics'],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'digisec-k1', typ: 'JWT' })
      .setSubject('digisec|88')
      .setIssuer(issuerNoSlash)
      .setAudience('dfn-discovery')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);

    const res = await fetch(`http://127.0.0.1:${apiAddr.port}/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { auth: { userId: string; orgId: string; plan: string } };
    expect(body.auth.userId).toBe('88');
    expect(body.auth.orgId).toBe('org_ogun_cnc');
    expect(body.auth.plan).toBe('business');
  });

  it('defaults Finworld escrow integration URL cleanly and uses Flutterwave default', async () => {
    delete process.env.FINWORLD_API_URL;
    delete process.env.BILLING_API_URL;
    expect(resolveFinworldBaseUrl()).toBe('http://localhost:4200');

    process.env.FINWORLD_API_URL = 'https://finworld.fabnetwork.test/';
    expect(resolveFinworldBaseUrl()).toBe('https://finworld.fabnetwork.test');
    expect(typeof finworldClient.initializeEscrowDeposit).toBe('function');
  });
});
