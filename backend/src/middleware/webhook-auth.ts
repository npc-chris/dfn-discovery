import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './error';

export function verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  const normalised = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Avoid timing attacks by using constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(normalised, 'hex'),
      Buffer.from(computed, 'hex')
    );
  } catch {
    return false;
  }
}

export const requireWebhookSignature = (headerName: string, secretEnvVar: string) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const signature = req.headers[headerName.toLowerCase()] as string;
    const secret = process.env[secretEnvVar] as string;

    if (!signature) {
      return next(new AppError(401, `Missing ${headerName} signature header`));
    }
    if (!secret) {
      return next(new AppError(500, `Missing ${secretEnvVar} configuration`));
    }

    // req.body needs to be the raw buffer to correctly compute HMAC.
    // Express must be configured with express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      return next(new AppError(500, 'Server is not configured to parse raw body for webhooks'));
    }

    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return next(new AppError(401, 'Invalid webhook signature'));
    }

    next();
  };
};
