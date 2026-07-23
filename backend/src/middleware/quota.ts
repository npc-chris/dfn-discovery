import { Request, Response, NextFunction } from 'express';
import { AppError } from './error';
import { AuthContext } from './auth';
import { getRedisClient } from '../services/redis-client';
import axios from 'axios';

const BILLING_API_URL = process.env.BILLING_API_URL || 'https://billing.fabnetwork.com.ng';

export const quotaMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth: AuthContext = res.locals.auth;

    if (!auth) {
      throw new AppError(401, 'Unauthorized: Context missing');
    }

    const { orgId, quotas } = auth;

    // Check fast-path negative cache
    const cacheKey = `quota:exhausted:${orgId}`;
    const redis = getRedisClient();
    const isExhaustedCached = redis ? await redis.get(cacheKey) : null;

    if (isExhaustedCached === 'true') {
      throw new AppError(402, 'Payment Required: Quota exhausted');
    }

    // Check token claim first
    if (quotas.jobsRemaining > 0) {
      // Fast path: decrement a local redis counter to prevent burst bypass
      // (Simplified for now, in prod you'd atomically decrement `quota:remaining:${orgId}`)
      return next();
    }

    // Token claim says 0, need live check against platform billing API
    const response = await axios.get(`${BILLING_API_URL}/v1/quotas/verify`, {
      params: { orgId },
      headers: {
        Authorization: `Bearer ${req.headers.authorization?.split(' ')[1]}`, // Pass user token
        // If it requires internal M2M token, we would use that instead
      },
    });

    const data = response.data;
    if (data.is_exceeded) {
      // Cache negative response for 2 minutes (120s)
      if (redis) await redis.setex(cacheKey, 120, 'true');
      throw new AppError(402, 'Payment Required: Quota exhausted');
    }

    next();
  } catch (error: any) {
    if (error instanceof AppError) {
      return next(error);
    }
    // If billing API fails, we could choose to fail open or closed. Let's fail with 500 for now.
    return next(new AppError(500, `Quota verification failed: ${error.message}`));
  }
};
