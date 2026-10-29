/**
 * API Routes for Standards & SDO Compliance Engine
 * Endpoints for catalog search, cross-reference resolution, bulk import, and factory certifications
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import {
  searchStandards,
  getStandard,
  resolveStandardEquivalents,
  importStandardsBulk,
  linkStandardEquivalence,
  recordFactoryCertification,
  verifyFactoryCertification,
} from '../services/standards-service';
import { getFactoryCertifications } from '../db/queries';
import { AppError } from '../middleware/error';
import { requireAdmin } from '../middleware/auth';

const router: Router = express.Router();


// Search the indexed standards catalog
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sdo = req.query.sdo as string | undefined;
    const category = req.query.category as any;
    const status = req.query.status as any;
    const q = req.query.q as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const result = await searchStandards({
      sdo,
      category,
      status,
      q,
      page,
      limit,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get standard details by ID

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const standard = await getStandard(req.params.id);
    if (!standard) {
      throw new AppError(404, 'Standard not found');
    }
    res.json(standard);
  } catch (error) {
    next(error);
  }
});

// Resolve standard cross-reference equivalents (e.g. BS EN 10025 -> NIS 102 / ASTM A36)
router.get('/code/:code/cross-references', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = decodeURIComponent(req.params.code);
    const resolution = await resolveStandardEquivalents(code);

    if (!resolution) {
      throw new AppError(404, `Standard code "${code}" not found in catalog`);
    }

    res.json(resolution);
  } catch (error) {
    next(error);
  }
});

// Bulk import standards (Internal / Admin only)
router.post('/bulk-import', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { standards, defaultSdo } = req.body;

    if (!Array.isArray(standards) || standards.length === 0) {
      throw new AppError(400, 'Request body must include an array of standards');
    }

    const result = await importStandardsBulk(standards, { defaultSdo });
    res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// Create an equivalence cross-reference link between two standards (Internal / Admin only)
router.post('/cross-references', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {

  try {
    const { sourceCode, targetCode, equivalenceLevel, technicalNotes, propertyMapping } = req.body;

    if (!sourceCode || !targetCode || !equivalenceLevel) {
      throw new AppError(400, 'Missing required fields (sourceCode, targetCode, equivalenceLevel)');
    }

    const crossRef = await linkStandardEquivalence({
      sourceCode,
      targetCode,
      equivalenceLevel,
      technicalNotes,
      propertyMapping,
    });

    res.status(201).json({
      success: true,
      crossRef,
    });
  } catch (error) {
    next(error);
  }
});

// Get certifications for a factory
router.get('/factories/:factoryId/certifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const certs = await getFactoryCertifications(req.params.factoryId, orgId);

    const formatted = certs.map((c) => ({
      id: c.certification.id,
      standardCode: c.standard.standard_code,
      standardTitle: c.standard.title,
      sdo: c.standard.sdo,
      certificateNumber: c.certification.certificate_number,
      certificationBody: c.certification.certification_body,
      isIafVerified: c.certification.is_iaf_verified,
      iafCertSearchId: c.certification.iaf_certsearch_id,
      verificationStatus: c.certification.verification_status,
      issuedAt: c.certification.issued_at,
      expiresAt: c.certification.expires_at,
    }));

    res.json({ data: formatted, total: formatted.length });
  } catch (error) {
    next(error);
  }
});

// Register a certification claim for a factory
router.post('/factories/:factoryId/certifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';

    const {
      standardCode,
      certificateNumber,
      certificationBody,
      iafCertSearchId,
      isIafVerified,
      issuedAt,
      expiresAt,
    } = req.body;

    if (!standardCode || !certificationBody) {
      throw new AppError(400, 'Missing required fields (standardCode, certificationBody)');
    }

    const cert = await recordFactoryCertification({
      factoryId: req.params.factoryId,
      standardCode,
      orgId,
      certificateNumber,
      certificationBody,
      iafCertSearchId,
      isIafVerified,
      issuedAt,
      expiresAt,
    });

    res.status(201).json({
      success: true,
      certification: cert,
    });
  } catch (error) {
    next(error);
  }
});

// Verify a factory certification (simulates IAF CertSearch / SON validation)
router.patch(
  '/factories/:factoryId/certifications/:certId/verify',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = res.locals.auth;
      const orgId = auth?.orgId || 'unknown';

      const updated = await verifyFactoryCertification(req.params.certId, orgId, {
        iafVerified: req.body.iafVerified ?? true,
        iafCertSearchId: req.body.iafCertSearchId,
      });

      res.json({
        success: true,
        message: 'Factory certification verified successfully',
        certification: updated,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
