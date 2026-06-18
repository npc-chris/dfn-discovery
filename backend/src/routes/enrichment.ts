/**
 * Enrichment Routes
 * Endpoints for Geo/Logistics, Market Intelligence, and Site/Real Estate services
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getGeoLogistics } from '../services/geo-logistics.ts';
import { getMarketIntelligence } from '../services/market-intelligence.ts';
import { getSiteRealEstate } from '../services/site-realestate.ts';
import { getJob } from '../services/job-intake.ts';
import { db } from '../db/client.ts';
import { factories } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.ts';

type DbClient = typeof db;

/**
 * Business Logic Handlers (Exported for Testing)
 */

export async function performLogisticsAssessment(
  jobId: string,
  factoryId: string,
  database: DbClient = db,
  jobLoader = getJob,
  geo = getGeoLogistics()
) {
  const job = await jobLoader(jobId);
  if (!job) {
    throw new AppError(404, `Job not found: ${jobId}`);
  }

  const [factory] = await database.select().from(factories).where(eq(factories.id, factoryId as any)).limit(1);
  if (!factory) {
    throw new AppError(404, `Factory not found: ${factoryId}`);
  }

  return geo.assessLogistics(job, factory as any);
}

export async function retrieveMarketSignals(
  factoryId: string,
  productType: string,
  database: DbClient = db,
  market = getMarketIntelligence()
) {
  const [factory] = await database.select().from(factories).where(eq(factories.id, factoryId as any)).limit(1);
  if (!factory) {
    throw new AppError(404, `Factory not found: ${factoryId}`);
  }

  return market.getMarketSignals(factory as any, productType);
}

export async function retrieveMarketOutlook(
  productType: string,
  market = getMarketIntelligence()
) {
  return market.getMarketOutlook(productType);
}

export async function retrieveSiteBrief(
  factoryId: string,
  database: DbClient = db,
  site = getSiteRealEstate()
) {
  const [factory] = await database.select().from(factories).where(eq(factories.id, factoryId as any)).limit(1);
  if (!factory) {
    throw new AppError(404, `Factory not found: ${factoryId}`);
  }

  return site.generateSiteBrief(factory as any);
}

export async function retrieveSiteVisitReport(
  factoryId: string,
  database: DbClient = db,
  site = getSiteRealEstate()
) {
  const [factory] = await database.select().from(factories).where(eq(factories.id, factoryId as any)).limit(1);
  if (!factory) {
    throw new AppError(404, `Factory not found: ${factoryId}`);
  }

  return site.getSiteVisitReport(factory as any);
}

export async function verifyFacilityAvailability(
  factoryId: string,
  requiredCapacityPercent: number,
  requiredLeadDays: number,
  database: DbClient = db,
  site = getSiteRealEstate()
) {
  const [factory] = await database.select().from(factories).where(eq(factories.id, factoryId as any)).limit(1);
  if (!factory) {
    throw new AppError(404, `Factory not found: ${factoryId}`);
  }

  return site.checkFacilityAvailability(
    factory as any,
    requiredCapacityPercent,
    requiredLeadDays
  );
}

const router: Router = Router();

/**
 * Geo & Logistics Endpoints
 */

/**
 * POST /enrichment/logistics-assessment
 * Assess logistics and routing between job location and factory
 */
router.post('/logistics-assessment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, factoryId } = req.body;
    if (!jobId || !factoryId) {
      throw new AppError(400, 'jobId and factoryId are required');
    }

    const assessment = await performLogisticsAssessment(jobId, factoryId);
    return res.json(assessment);
  } catch (error) {
    return next(error);
  }
});

/**
 * Market Intelligence Endpoints
 */

/**
 * GET /enrichment/market-signals/:factoryId
 * Get market signals and demand data for a factory
 */
router.get('/market-signals/:factoryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { factoryId } = req.params;
    const { productType } = req.query;

    if (!productType || typeof productType !== 'string') {
      throw new AppError(400, 'productType query parameter is required');
    }

    const signals = await retrieveMarketSignals(factoryId, productType);
    return res.json(signals);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /enrichment/market-outlook
 * Get market outlook and trends for a product
 */
router.get('/market-outlook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productType } = req.query;

    if (!productType || typeof productType !== 'string') {
      throw new AppError(400, 'productType query parameter is required');
    }

    const outlook = await retrieveMarketOutlook(productType);
    return res.json(outlook);
  } catch (error) {
    return next(error);
  }
});

/**
 * Site & Real Estate Endpoints
 */

/**
 * GET /enrichment/site-brief/:factoryId
 * Get comprehensive facility brief for a factory
 */
router.get('/site-brief/:factoryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { factoryId } = req.params;

    const brief = await retrieveSiteBrief(factoryId);
    return res.json(brief);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /enrichment/site-visit-report/:factoryId
 * Get most recent site visit report for a factory
 */
router.get('/site-visit-report/:factoryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { factoryId } = req.params;

    const report = await retrieveSiteVisitReport(factoryId);
    return res.json(report);
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /enrichment/check-availability
 * Check if factory has capacity and lead time availability
 */
router.post('/check-availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { factoryId, requiredCapacityPercent, requiredLeadDays } = req.body;

    if (!factoryId || requiredCapacityPercent == null || requiredLeadDays == null) {
      throw new AppError(400, 'factoryId, requiredCapacityPercent, and requiredLeadDays are required');
    }

    const availability = await verifyFacilityAvailability(
      factoryId,
      Number(requiredCapacityPercent),
      Number(requiredLeadDays)
    );
    return res.json(availability);
  } catch (error) {
    return next(error);
  }
});

export default router;
