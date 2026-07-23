import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from './error';

const AUTH_ISSUER_URL = process.env.AUTH_ISSUER_URL;
const AUTH_AUDIENCE = process.env.AUTH_AUDIENCE || 'dfn-discovery';
const AUTH_CLAIM_NAMESPACE = process.env.AUTH_CLAIM_NAMESPACE || 'https://fabnetwork.com.ng/';

if (!AUTH_ISSUER_URL) {
  console.warn('AUTH_ISSUER_URL is not set. Auth middleware will fail if called.');
}

// Create a cached JWKS from Auth0's endpoint.
// jose handles the 24h caching and debounced retries under the hood automatically.
const JWKS = AUTH_ISSUER_URL 
  ? createRemoteJWKSet(new URL(`${AUTH_ISSUER_URL}.well-known/jwks.json`))
  : null;

export interface QuotaClaims {
  jobsRemaining: number;
  batchSizeLimit: number;
  apiCallsRemaining: number;
}

export interface AuthContext {
  userId: string;
  orgId: string;
  orgRole: 'owner' | 'admin' | 'member' | 'viewer';
  plan: 'free' | 'team' | 'business' | 'enterprise';
  quotas: QuotaClaims;
  features: string[];
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'Missing or malformed Authorization header');
    }

    const token = authHeader.split(' ')[1];

    if (!JWKS) {
      throw new AppError(500, 'Server is missing AUTH_ISSUER_URL configuration');
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_ISSUER_URL,
      audience: AUTH_AUDIENCE,
    });

    const orgId = payload[`${AUTH_CLAIM_NAMESPACE}orgId`] as string;
    if (!orgId) {
      throw new AppError(401, 'Token is missing orgId claim');
    }

    const authContext: AuthContext = {
      userId: payload.sub as string,
      orgId,
      orgRole: (payload[`${AUTH_CLAIM_NAMESPACE}orgRole`] as any) || 'viewer',
      plan: (payload[`${AUTH_CLAIM_NAMESPACE}plan`] as any) || 'free',
      quotas: (payload[`${AUTH_CLAIM_NAMESPACE}quotas`] as any) || { jobsRemaining: 0, batchSizeLimit: 0, apiCallsRemaining: 0 },
      features: (payload[`${AUTH_CLAIM_NAMESPACE}features`] as any) || [],
    };

    res.locals.auth = authContext;
    next();
  } catch (error: any) {
    // Return 401 for all auth failures
    if (error instanceof AppError && error.statusCode === 401) {
      // Instrument auth failures
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        import('../services/audit').then(({ emitAuditEvent }) => {
          emitAuditEvent({
            eventType: 'auth_failure',
            actorOrgId: 'unknown',
            status: 'failure',
            details: { reason: error.message, ip: req.ip },
          }).catch(console.error);
        });
      }
      return next(error);
    }
    return next(new AppError(401, `Unauthorized: ${error.message}`));
  }
};
