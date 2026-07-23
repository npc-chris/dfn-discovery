import { Request, Response, NextFunction } from 'express';
import { AppError } from './error';
import { AuthContext } from './auth';

export const featureFlagMiddleware = (requiredFlag: string) => {
  return (_req: Request, res: Response, next: NextFunction) => {
    const auth: AuthContext = res.locals.auth;

    if (!auth) {
      return next(new AppError(401, 'Unauthorized: Context missing'));
    }

    if (!auth.features.includes(requiredFlag)) {
      return next(new AppError(403, `Forbidden: Requires '${requiredFlag}' feature flag. Please upgrade your plan.`));
    }

    next();
  };
};
