import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import type { Server } from 'http';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { jobs } from '../db/schema';
import { errorHandler } from '../middleware/error';
import aeWorkbenchRouter from '../routes/ae-workbench';
import { createJob } from './job-intake';
import {
  getStandardStockCatalog,
  recommendStandardStock,
  splitJobBom,
  applyStockNormalization,
  getAeWorkbenchState,
} from './ae-bom-workbench';

describe('Applications Engineer BOM Splitting & Stock Normalization [KAN-32]', () => {
  const orgId = 'test-org-ae-workbench-001';
  const userId = 'test-user-ae-001';

  describe('Standard Stock Catalog & Recommendations (Unit)', () => {
    it('recommends 30.0 mm standard cold-drawn stock for a 31.5 mm specified shaft diameter', () => {
      // Arrange
      const specifiedDimensionMm = 31.5;

      // Act
      const rec = recommendStandardStock({
        stockType: 'cold_drawn_round_bar',
        specifiedDimensionMm,
        quantity: 1,
      });

      // Assert
      expect(rec.isAlreadyStandard).toBe(false);
      expect(rec.oversizedRawStockMm).toBe(35);
      expect(rec.recommendedDimensionMm).toBe(30);
      expect(rec.dimensionDeltaMm).toBe(-1.5);
      expect(rec.oversizedStockStepAvoidedMm).toBe(5);
      expect(rec.turningChipWastePct).toBeGreaterThan(0);
      expect(rec.materialWasteReductionPct).toBeGreaterThan(0);
      expect(rec.savingsBreakdown.turningSetupAndPassEliminationNgn).toBe(14000);
      expect(rec.savingsBreakdown.oversizedStockPremiumNgn).toBe(6000);
      expect(rec.savingsBreakdown.totalSavingsNgn).toBe(20000);
    });

    it('returns zero unnecessary change when shaft diameter is already 30.0 mm standard stock', () => {
      // Arrange
      const specifiedDimensionMm = 30.0;

      // Act
      const rec = recommendStandardStock({
        stockType: 'cold_drawn_round_bar',
        specifiedDimensionMm,
        quantity: 1,
      });

      // Assert
      expect(rec.isAlreadyStandard).toBe(true);
      expect(rec.recommendedDimensionMm).toBe(30);
      expect(rec.dimensionDeltaMm).toBe(0);
      expect(rec.oversizedStockStepAvoidedMm).toBe(0);
      expect(rec.materialWasteReductionPct).toBe(0);
      expect(rec.savingsBreakdown.totalSavingsNgn).toBe(0);
    });

    it('includes standard metric cold-drawn round bar and sheet metal gauges in catalog', () => {
      // Act
      const catalog = getStandardStockCatalog();

      // Assert
      expect(catalog.cold_drawn_round_bar).toEqual(
        expect.arrayContaining([10, 12, 16, 20, 25, 30, 35, 40, 50]),
      );
      expect(catalog.sheet_metal).toEqual(expect.arrayContaining([1.5, 2.0, 3.0, 5.0, 6.0]));
    });
  });

  describe('Gherkin Acceptance Criteria & Service Persistence', () => {
    it('splits 31.5 mm shaft assembly into Weldment & Shaft work packages, normalizes to 30.0 mm, and updates quote from ₦98,000 to ₦78,000', async () => {
      // Arrange: Given an assembly with a 31.5 mm specified shaft diameter
      const job = await createJob(
        {
          company_name: 'AgroTech Processing Ltd',
          product_name: 'Cassava Peeling Drum Assembly',
          location: { country: 'Nigeria', state: 'Ogun' },
          target_ceiling_ngn: 85000,
          metadata: {
            triage_queue: 'applications_engineering',
            cad_telemetry: {
              discrete_bodies: 4,
              is_assembly: true,
              envelope_mm: { x: 1100, y: 650, z: 500 },
            },
          },
        },
        orgId,
        userId,
      );

      // Act 1: Split assembly into Work Package A (Weldment) and Work Package B (Shaft)
      const splitResult = await splitJobBom({
        jobId: job.id,
        reviewedBy: 'ae-engineer-lagos-01',
        workPackages: [
          {
            code: 'WP-A',
            name: 'Work Package A (Weldment)',
            category: 'weldment',
            processType: 'welding_fabrication',
            materialGrade: 'mild_steel_s235',
            quantity: 1,
            estimatedCostNgn: 60000,
            partNames: ['Drum Shell', 'End Flange L', 'End Flange R'],
            bodyIndices: [0, 1, 2],
          },
          {
            code: 'WP-B',
            name: 'Work Package B (Shaft)',
            category: 'turned_shaft',
            processType: 'cnc_turning',
            materialGrade: 'en8_cold_drawn_steel',
            quantity: 1,
            estimatedCostNgn: 38000,
            partNames: ['Drive Shaft 31.5mm'],
            bodyIndices: [3],
            stockSpec: {
              stockType: 'cold_drawn_round_bar',
              specifiedDimensionMm: 31.5,
              lengthMm: 1150,
            },
          },
        ],
      });

      // Assert 1: Split persisted with baseline ₦98,000 quote
      expect(splitResult.status).toBe('bom_split');
      expect(splitResult.workPackages).toHaveLength(2);
      expect(splitResult.workPackages[0].name).toBe('Work Package A (Weldment)');
      expect(splitResult.workPackages[1].name).toBe('Work Package B (Shaft)');
      expect(splitResult.baselineEstimatedQuoteNgn).toBe(98000);
      expect(splitResult.currentEstimatedQuoteNgn).toBe(98000);
      expect(splitResult.recommendedSavingsNgn).toBe(20000);

      const shaftPackage = splitResult.workPackages[1];
      expect(shaftPackage.stockRecommendation?.recommendedDimensionMm).toBe(30);

      // Act 2: Apply parameter change to 30.0 mm standard cold-drawn stock
      const normResult = await applyStockNormalization({
        jobId: job.id,
        workPackageId: shaftPackage.id,
        targetDimensionMm: 30.0,
        appliedBy: 'ae-engineer-lagos-01',
        engineeringNote: 'Normalized shaft OD to 30.0 mm standard cold-drawn EN8 stock; bearing seat updated to 6206.',
      });

      // Assert 2: Quote deterministically updates from ₦98,000 to ₦78,000
      expect(normResult.changed).toBe(true);
      expect(normResult.previousDimensionMm).toBe(31.5);
      expect(normResult.normalizedDimensionMm).toBe(30.0);
      expect(normResult.targetIsStandardStock).toBe(true);
      expect(normResult.oversizedRawStockAvoidedMm).toBe(35);
      expect(normResult.savingsBreakdown.totalSavingsNgn).toBe(20000);
      expect(normResult.previousEstimatedQuoteNgn).toBe(98000);
      expect(normResult.updatedEstimatedQuoteNgn).toBe(78000);
      expect(normResult.totalJobSavingsNgn).toBe(20000);

      // Verify Postgres job metadata persistence
      const [dbJob] = await db.select().from(jobs).where(eq(jobs.id, job.id as any)).limit(1);
      const meta = dbJob.metadata as Record<string, any>;

      expect(meta.estimated_quote_ngn).toBe(78000);
      expect(meta.baseline_estimated_quote_ngn).toBe(98000);
      expect(meta.ae_workbench.status).toBe('normalized');
      expect(meta.ae_workbench.current_estimated_quote_ngn).toBe(78000);
      expect(meta.ae_workbench.total_savings_ngn).toBe(20000);
      expect(meta.ae_workbench.parameter_changes).toHaveLength(1);
      expect(meta.ae_workbench.parameter_changes[0].previousDimensionMm).toBe(31.5);
      expect(meta.ae_workbench.parameter_changes[0].normalizedDimensionMm).toBe(30.0);
    });

    it('yields zero unnecessary change when normalizing a package already at 30.0 mm standard stock', async () => {
      // Arrange
      const job = await createJob(
        {
          company_name: 'Delta Precision Works',
          product_name: 'Conveyor Roller Shaft Assembly',
          location: { country: 'Nigeria', state: 'Lagos' },
        },
        orgId,
        userId,
      );

      const splitResult = await splitJobBom({
        jobId: job.id,
        workPackages: [
          {
            code: 'WP-A',
            name: 'Work Package A (Shaft)',
            category: 'turned_shaft',
            estimatedCostNgn: 45000,
            stockSpec: {
              stockType: 'cold_drawn_round_bar',
              specifiedDimensionMm: 30.0,
            },
          },
        ],
      });

      // Act
      const normResult = await applyStockNormalization({
        jobId: job.id,
        workPackageId: splitResult.workPackages[0].id,
        targetDimensionMm: 30.0,
      });

      // Assert
      expect(normResult.changed).toBe(false);
      expect(normResult.savingsBreakdown.totalSavingsNgn).toBe(0);
      expect(normResult.previousEstimatedQuoteNgn).toBe(45000);
      expect(normResult.updatedEstimatedQuoteNgn).toBe(45000);
    });

    it('rejects empty work packages with 400 and non-existent jobs with 404', async () => {
      // Arrange
      const missingJobId = '00000000-0000-0000-0000-000000000000';

      // Act & Assert: empty workPackages -> 400
      await expect(
        splitJobBom({
          jobId: missingJobId,
          workPackages: [],
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      // Act & Assert: non-existent job -> 404
      await expect(
        splitJobBom({
          jobId: missingJobId,
          workPackages: [
            {
              name: 'Work Package A (Weldment)',
              category: 'weldment',
              estimatedCostNgn: 50000,
            },
          ],
        }),
      ).rejects.toMatchObject({ statusCode: 404 });

      await expect(getAeWorkbenchState(missingJobId)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('AE Workbench REST API Integration', () => {
    let app: Express;
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/ae-workbench', aeWorkbenchRouter);
      app.use(errorHandler);

      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const port = (server.address() as any).port;
          baseUrl = `http://127.0.0.1:${port}/api/v1/ae-workbench`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it('executes full AE triage workbench HTTP flow from BOM split to stock normalization', async () => {
      // Arrange
      const job = await createJob(
        {
          company_name: 'Kano Agro Fabricators',
          product_name: 'Hammer Mill Rotor Assembly',
          location: { country: 'Nigeria', state: 'Kano' },
          target_ceiling_ngn: 85000,
        },
        orgId,
        userId,
      );

      // Act 1: Query stock recommendation via HTTP
      const recRes = await fetch(`${baseUrl}/stock-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockType: 'cold_drawn_round_bar',
          specifiedDimensionMm: 31.5,
        }),
      });
      expect(recRes.status).toBe(200);
      const recData = await recRes.json();
      expect(recData.recommendedDimensionMm).toBe(30);
      expect(recData.savingsBreakdown.totalSavingsNgn).toBe(20000);

      // Act 2: Split BOM via HTTP
      const splitRes = await fetch(`${baseUrl}/jobs/${job.id}/split-bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workPackages: [
            {
              code: 'WP-A',
              name: 'Work Package A (Weldment)',
              category: 'weldment',
              estimatedCostNgn: 60000,
            },
            {
              code: 'WP-B',
              name: 'Work Package B (Shaft)',
              category: 'turned_shaft',
              estimatedCostNgn: 38000,
              stockSpec: {
                stockType: 'cold_drawn_round_bar',
                specifiedDimensionMm: 31.5,
              },
            },
          ],
        }),
      });
      expect(splitRes.status).toBe(200);
      const splitData = await splitRes.json();
      expect(splitData.currentEstimatedQuoteNgn).toBe(98000);

      // Act 3: Apply 30.0 mm stock normalization via HTTP
      const normRes = await fetch(`${baseUrl}/jobs/${job.id}/normalize-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workPackageId: 'WP-B',
          targetDimensionMm: 30.0,
        }),
      });
      expect(normRes.status).toBe(200);
      const normData = await normRes.json();
      expect(normData.previousEstimatedQuoteNgn).toBe(98000);
      expect(normData.updatedEstimatedQuoteNgn).toBe(78000);

      // Act 4: Fetch workbench state via HTTP
      const stateRes = await fetch(`${baseUrl}/jobs/${job.id}`);
      expect(stateRes.status).toBe(200);
      const stateData = await stateRes.json();
      expect(stateData.workbench.current_estimated_quote_ngn).toBe(78000);
      expect(stateData.workbench.work_packages).toHaveLength(2);
    });

    it('returns 400 for empty workPackages and 404 for unknown job over HTTP', async () => {
      // Act 1: Empty work packages -> 400
      const badRes = await fetch(
        `${baseUrl}/jobs/00000000-0000-0000-0000-000000000000/split-bom`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workPackages: [] }),
        },
      );
      expect(badRes.status).toBe(400);

      // Act 2: Non-existent job -> 404
      const missingRes = await fetch(
        `${baseUrl}/jobs/00000000-0000-0000-0000-000000000000`,
      );
      expect(missingRes.status).toBe(404);
    });
  });
});
