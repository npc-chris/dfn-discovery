/**
 * API Routes for Applications Engineer Triage Workbench [KAN-32]
 * Endpoints for BOM splitting, physics-based standard stock recommendations,
 * and parameter normalization with deterministic quote recalculation.
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import {
  ALL_STOCK_TYPES,
  DEFAULT_SHOP_RATE_CARD,
  getStandardStockCatalog,
  getMaterialReferenceTable,
  recommendStandardStock,
  splitJobBom,
  applyStockNormalization,
  getAeWorkbenchState,
  isValidStockType,
} from '../services/ae-bom-workbench';
import { AppError } from '../middleware/error';

const router: Router = express.Router();

/**
 * GET /stock-catalog
 * Returns standard metric stock size tables (mm), material reference specs, and default shop rates.
 */
router.get('/stock-catalog', (_req: Request, res: Response) => {
  res.json({
    catalog: getStandardStockCatalog(),
    materials: getMaterialReferenceTable(),
    defaultRateCard: DEFAULT_SHOP_RATE_CARD,
  });
});

/**
 * POST /stock-recommendations
 * Evaluates a specified dimension against standard stock tables and projects physical & cost savings.
 */
router.post('/stock-recommendations', (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      stockType,
      specifiedDimensionMm,
      lengthMm,
      widthMm,
      wallThicknessMm,
      materialGrade,
      quantity,
      rateCard,
    } = req.body || {};

    if (!isValidStockType(stockType)) {
      throw new AppError(
        400,
        `stockType is required and must be one of: ${ALL_STOCK_TYPES.join(', ')}`,
      );
    }

    if (specifiedDimensionMm === undefined || typeof specifiedDimensionMm !== 'number') {
      throw new AppError(400, 'specifiedDimensionMm is required and must be a number');
    }

    const recommendation = recommendStandardStock({
      stockType,
      specifiedDimensionMm,
      lengthMm,
      widthMm,
      wallThicknessMm,
      materialGrade,
      quantity,
      rateCard,
    });

    res.json(recommendation);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /jobs/:jobId
 * Retrieves current AE workbench state (triage metadata, work packages, quote, parameter changes).
 */
router.get('/jobs/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await getAeWorkbenchState(req.params.jobId);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /jobs/:jobId/split-bom
 * Splits a multi-body assembly job's BOM into discrete Work Packages and evaluates stock specs.
 */
router.post('/jobs/:jobId/split-bom', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const { workPackages, initialEstimatedQuoteNgn, rateCard, reviewedBy } = req.body || {};

    const result = await splitJobBom({
      jobId: req.params.jobId,
      workPackages,
      initialEstimatedQuoteNgn,
      rateCard,
      reviewedBy: reviewedBy || auth?.userId || 'applications-engineer',
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /jobs/:jobId/normalize-stock
 * Applies a stock dimension normalization change to a Work Package and updates the estimated quote.
 */
router.post(
  '/jobs/:jobId/normalize-stock',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = res.locals.auth;
      const {
        workPackageId,
        targetDimensionMm,
        stockType,
        lengthMm,
        widthMm,
        wallThicknessMm,
        materialGrade,
        rateCard,
        appliedBy,
        engineeringNote,
      } = req.body || {};

      if (targetDimensionMm === undefined || typeof targetDimensionMm !== 'number') {
        throw new AppError(400, 'targetDimensionMm is required and must be a number');
      }

      const result = await applyStockNormalization({
        jobId: req.params.jobId,
        workPackageId,
        targetDimensionMm,
        stockType,
        lengthMm,
        widthMm,
        wallThicknessMm,
        materialGrade,
        rateCard,
        appliedBy: appliedBy || auth?.userId || 'applications-engineer',
        engineeringNote,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
