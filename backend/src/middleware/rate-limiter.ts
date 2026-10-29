import rateLimit from 'express-rate-limit';

/**
 * Webhook rate limiter: protects inbound webhook receivers (SafetyCulture, UpKeep)
 * against DoS and HMAC brute-force attempts.
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests, please try again after 15 minutes' },
});

/**
 * Authorization and sensitive operations rate limiter:
 * Protects credential/signature verification, IAF certification checks, and facility audits.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // max 60 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts, please try again after 15 minutes' },
});

/**
 * General API rate limiter: 300 requests per 15 minutes per IP
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // max 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again after 15 minutes' },
});
