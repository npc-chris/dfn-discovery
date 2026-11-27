/**
 * API Routes for Quotes / Supplier Bids
 * Endpoints for bid submissions and contract awarding
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { createQuote, getQuoteById, getJobById } from '../db/queries';
import { awardQuote } from '../services/sourcing-service';
import { recordActivity } from '../services/activity-service';
import { finworldClient } from '../services/finworld-client';
import { AppError } from '../middleware/error';

const router: Router = express.Router();

// Submit a supplier bid/quote against an RFQ
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || req.body.org_id || 'unknown';

    const {
      job_id,
      factory_id,
      unit_price_ngn,
      total_price_ngn,
      lead_time_days,
      status,
      terms,
      notes,
      valid_until,
    } = req.body;

    if (!job_id || !factory_id || unit_price_ngn === undefined || total_price_ngn === undefined) {
      throw new AppError(400, 'Missing required quote fields (job_id, factory_id, unit_price_ngn, total_price_ngn)');
    }

    const quote = await createQuote({
      job_id,
      factory_id,
      org_id: orgId,
      unit_price_ngn: Number(unit_price_ngn),
      total_price_ngn: Number(total_price_ngn),
      lead_time_days: Number(lead_time_days || 7),
      status: status || 'submitted',
      terms,
      notes,
      valid_until: valid_until ? new Date(valid_until) : null,
    });

    const job = await getJobById(job_id, orgId);

    // Record activity
    await recordActivity({
      project_id: job?.project_id,
      job_id,
      orgId,
      eventType: 'quote_submitted',
      title: 'Quote Submitted',
      description: `Supplier submitted bid of ₦${Number(total_price_ngn).toLocaleString()} (${lead_time_days || 7} days lead time)`,
      severity: 'success',
      metadata: {
        quoteId: quote.id,
        factoryId: factory_id,
        unitPriceNgn: unit_price_ngn,
        totalPriceNgn: total_price_ngn,
      },
    });

    res.status(201).json(quote);
  } catch (error) {
    next(error);
  }
});

// Award contract to a specific supplier quote
router.post('/:quoteId/award', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const actor = auth?.userId || req.body.actor || 'Procurement Lead';

    const quote = await getQuoteById(req.params.quoteId, orgId);
    if (!quote) {
      throw new AppError(404, 'Quote not found');
    }

    const awardedQuote = await awardQuote(quote.id, quote.job_id, orgId, actor);
    res.json({
      success: true,
      message: 'Quote awarded successfully',
      quote: awardedQuote,
    });
  } catch (error) {
    next(error);
  }
});

// Initialize Flutterwave-default milestone escrow deposit via dfn-finworld
router.post('/:quoteId/escrow', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const quote = await getQuoteById(req.params.quoteId, orgId);
    if (!quote) {
      throw new AppError(404, 'Quote not found');
    }

    const totalAmount = Number(req.body.totalAmount || quote.total_price_ngn || 0);
    if (!totalAmount || totalAmount <= 0) {
      throw new AppError(400, 'Positive quote totalAmount is required to initialize escrow');
    }

    const escrowInit = await finworldClient.initializeEscrowDeposit(
      {
        rfqId: req.body.rfqId || quote.id,
        totalAmount,
        tenantId: req.body.tenantId || 1,
        callbackUrl: req.body.callbackUrl,
        paymentProvider: req.body.paymentProvider || 'flutterwave',
        currency: req.body.currency || 'NGN',
      },
      req.headers.authorization
    );

    res.status(200).json({
      quoteId: quote.id,
      orgId,
      escrow: escrowInit,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
