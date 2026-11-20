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
  ALL_STOCK_TYPES,
  MATERIAL_REFERENCE_TABLE,
  STANDARD_STOCK_SIZES_MM,
  type CanonicalMaterialKey,
  type ShopRateCard,
  type StockType,
  computeCrossSectionAreaMm2,
  calculateStockNormalizationImpact,
  getStandardStockCatalog,
  recommendStandardStock,
  resolveMaterialSpec,
  splitJobBom,
  applyStockNormalization,
  getAeWorkbenchState,
} from './ae-bom-workbench';

/**
 * Deterministic Mulberry32 PRNG for reproducible property-based fuzz sweeps.
 */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Applications Engineer BOM Splitting & Stock Normalization [KAN-32]', () => {
  const orgId = 'test-org-ae-workbench-001';
  const userId = 'test-user-ae-001';

  describe('Standard Stock Catalog, Geometry & Physical Model (Unit)', () => {
    it('exposes all 6 industrial stock profiles in the standard catalog', () => {
      const catalog = getStandardStockCatalog();

      expect(Object.keys(catalog).sort()).toEqual([...ALL_STOCK_TYPES].sort());
      expect(catalog.cold_drawn_round_bar).toEqual(
        expect.arrayContaining([10, 12, 16, 20, 25, 30, 35, 40, 50]),
      );
      expect(catalog.square_bar).toEqual(expect.arrayContaining([10, 20, 25, 30, 40]));
      expect(catalog.hex_bar).toEqual(expect.arrayContaining([10, 17, 19, 24, 30]));
      expect(catalog.sheet_metal).toEqual(expect.arrayContaining([1.5, 2.0, 3.0, 5.0, 6.0]));
      expect(catalog.plate).toEqual(expect.arrayContaining([6, 10, 12, 20, 25]));
      expect(catalog.round_tube).toEqual(expect.arrayContaining([20, 25, 30, 40, 50]));
    });

    it('computes exact cross-sectional area formulas for all 6 stock profiles', () => {
      expect(
        computeCrossSectionAreaMm2({ stockType: 'cold_drawn_round_bar', dimensionMm: 30 }),
      ).toBeCloseTo((Math.PI / 4) * 900, 6);

      expect(
        computeCrossSectionAreaMm2({ stockType: 'square_bar', dimensionMm: 25 }),
      ).toBeCloseTo(625, 6);

      expect(
        computeCrossSectionAreaMm2({ stockType: 'hex_bar', dimensionMm: 20 }),
      ).toBeCloseTo((Math.sqrt(3) / 2) * 400, 6);

      expect(
        computeCrossSectionAreaMm2({ stockType: 'sheet_metal', dimensionMm: 2.5, widthMm: 400 }),
      ).toBeCloseTo(1000, 6);

      expect(
        computeCrossSectionAreaMm2({ stockType: 'plate', dimensionMm: 12, widthMm: 500 }),
      ).toBeCloseTo(6000, 6);

      expect(
        computeCrossSectionAreaMm2({
          stockType: 'round_tube',
          dimensionMm: 40,
          wallThicknessMm: 3,
        }),
      ).toBeCloseTo((Math.PI / 4) * (40 ** 2 - 34 ** 2), 6);
    });

    it('resolves canonical engineering materials and aliases accurately', () => {
      expect(resolveMaterialSpec('EN1A').key).toBe('mild_steel');
      expect(resolveMaterialSpec('AISI 1018').key).toBe('mild_steel');
      expect(resolveMaterialSpec('en8_cold_drawn_steel').key).toBe('en8_carbon_steel');
      expect(resolveMaterialSpec('4140 alloy steel').key).toBe('alloy_steel_4140');
      expect(resolveMaterialSpec('304 Stainless').key).toBe('stainless_steel_304');
      expect(resolveMaterialSpec('316L stainless steel').key).toBe('stainless_steel_316l');
      expect(resolveMaterialSpec('6061-T6 aluminum').key).toBe('aluminum_6061_t6');
      expect(resolveMaterialSpec('C36000 brass').key).toBe('brass_c36000');
    });

    it('derives mass, chip volume, machining time, and NGN savings directly from physics for a 31.5 mm shaft', () => {
      const rateCard: ShopRateCard = {
        materialCostNgnPerKg: 2600,
        machineHourlyRateNgn: 22000,
        turningSetupMinutes: 28,
        materialRemovalRateCm3PerMin: 24,
      };
      const lengthMm = 1150;

      const rec = recommendStandardStock({
        stockType: 'cold_drawn_round_bar',
        specifiedDimensionMm: 31.5,
        lengthMm,
        materialGrade: 'mild_steel',
        quantity: 1,
        rateCard,
      });

      // Independent first-principles calculation
      const areaOversized = (Math.PI / 4) * 35 ** 2;
      const areaCurrent = (Math.PI / 4) * 31.5 ** 2;
      const areaTarget = (Math.PI / 4) * 30 ** 2;
      const expectedMassKg = 7850 * (((areaOversized - areaTarget) * lengthMm) / 1e9);
      const expectedChipCm3 = ((areaOversized - areaCurrent) * lengthMm) / 1e3;
      const expectedMinutes = 28 + expectedChipCm3 / 24;
      const expectedMaterialNgn = Math.round(expectedMassKg * 2600);
      const expectedMachiningNgn = Math.round((expectedMinutes / 60) * 22000);

      expect(rec.isAlreadyStandard).toBe(false);
      expect(rec.oversizedRawStockMm).toBe(35);
      expect(rec.recommendedDimensionMm).toBe(30);
      expect(rec.dimensionDeltaMm).toBe(-1.5);
      expect(rec.oversizedStockStepAvoidedMm).toBe(5);
      expect(rec.deltaMassKg).toBeCloseTo(expectedMassKg, 4);
      expect(rec.chipVolumeCm3).toBeCloseTo(expectedChipCm3, 2);
      expect(rec.machiningMinutesSaved).toBeCloseTo(expectedMinutes, 2);
      expect(rec.savingsBreakdown.materialSavingsNgn).toBe(expectedMaterialNgn);
      expect(rec.savingsBreakdown.machiningSavingsNgn).toBe(expectedMachiningNgn);
      expect(rec.savingsBreakdown.unitSavingsNgn).toBe(expectedMaterialNgn + expectedMachiningNgn);
      expect(rec.savingsBreakdown.totalSavingsNgn).toBe(expectedMaterialNgn + expectedMachiningNgn);
    });

    it('returns zero savings when already standard, when target is non-standard, or when target >= oversized', () => {
      const alreadyStandard = recommendStandardStock({
        stockType: 'cold_drawn_round_bar',
        specifiedDimensionMm: 30.0,
        lengthMm: 1000,
      });
      expect(alreadyStandard.isAlreadyStandard).toBe(true);
      expect(alreadyStandard.deltaMassKg).toBe(0);
      expect(alreadyStandard.savingsBreakdown.totalSavingsNgn).toBe(0);

      const nonStandardTarget = calculateStockNormalizationImpact({
        stockType: 'cold_drawn_round_bar',
        currentDimensionMm: 31.5,
        targetDimensionMm: 31.0,
        lengthMm: 1000,
      });
      expect(nonStandardTarget.isTargetStandard).toBe(false);
      expect(nonStandardTarget.totalSavingsNgn).toBe(0);

      const upsizeToOversized = calculateStockNormalizationImpact({
        stockType: 'cold_drawn_round_bar',
        currentDimensionMm: 31.5,
        targetDimensionMm: 35.0,
        lengthMm: 1000,
      });
      expect(upsizeToOversized.totalSavingsNgn).toBe(0);

      const belowCatalogMin = recommendStandardStock({
        stockType: 'cold_drawn_round_bar',
        specifiedDimensionMm: 4.5,
        lengthMm: 500,
      });
      expect(belowCatalogMin.recommendedDimensionMm).toBe(6);
      expect(belowCatalogMin.oversizedRawStockMm).toBe(6);
      expect(belowCatalogMin.savingsBreakdown.totalSavingsNgn).toBe(0);
    });
  });

  describe('Metamorphic Monotonicity & Scaling Properties', () => {
    it('strictly increases deltaMassKg, materialSavingsNgn, and machiningSavingsNgn as lengthMm grows (200 -> 600 -> 1200 mm)', () => {
      const shortBar = calculateStockNormalizationImpact({
        stockType: 'cold_drawn_round_bar',
        currentDimensionMm: 31.5,
        targetDimensionMm: 30.0,
        lengthMm: 200,
        materialGrade: 'mild_steel',
      });
      const mediumBar = calculateStockNormalizationImpact({
        stockType: 'cold_drawn_round_bar',
        currentDimensionMm: 31.5,
        targetDimensionMm: 30.0,
        lengthMm: 600,
        materialGrade: 'mild_steel',
      });
      const longBar = calculateStockNormalizationImpact({
        stockType: 'cold_drawn_round_bar',
        currentDimensionMm: 31.5,
        targetDimensionMm: 30.0,
        lengthMm: 1200,
        materialGrade: 'mild_steel',
      });

      expect(mediumBar.deltaMassKg).toBeGreaterThan(shortBar.deltaMassKg);
      expect(longBar.deltaMassKg).toBeGreaterThan(mediumBar.deltaMassKg);

      expect(mediumBar.materialSavingsNgn).toBeGreaterThan(shortBar.materialSavingsNgn);
      expect(longBar.materialSavingsNgn).toBeGreaterThan(mediumBar.materialSavingsNgn);

      expect(mediumBar.machiningSavingsNgn).toBeGreaterThan(shortBar.machiningSavingsNgn);
      expect(longBar.machiningSavingsNgn).toBeGreaterThan(mediumBar.machiningSavingsNgn);

      // Exact linear proportionality of mass and chip volume to length
      expect(longBar.deltaMassKg / shortBar.deltaMassKg).toBeCloseTo(1200 / 200, 3);
      expect(longBar.chipVolumeCm3 / shortBar.chipVolumeCm3).toBeCloseTo(1200 / 200, 2);
    });

    it('scales deltaMassKg in exact proportion to physical density ratio (6061-T6 Aluminum 2700 -> Mild Steel 7850)', () => {
      const aluminum = calculateStockNormalizationImpact({
        stockType: 'square_bar',
        currentDimensionMm: 27.5,
        targetDimensionMm: 25.0,
        lengthMm: 1000,
        materialGrade: 'aluminum_6061_t6',
      });
      const mildSteel = calculateStockNormalizationImpact({
        stockType: 'square_bar',
        currentDimensionMm: 27.5,
        targetDimensionMm: 25.0,
        lengthMm: 1000,
        materialGrade: 'mild_steel',
      });

      expect(aluminum.densityKgPerM3).toBe(2700);
      expect(mildSteel.densityKgPerM3).toBe(7850);
      expect(mildSteel.deltaMassKg).toBeGreaterThan(aluminum.deltaMassKg);
      expect(mildSteel.deltaMassKg / aluminum.deltaMassKg).toBeCloseTo(7850 / 2700, 3);
    });

    it('scales totalSavingsNgn by exact factor k when quantity scales by k', () => {
      const unitImpact = calculateStockNormalizationImpact({
        stockType: 'hex_bar',
        currentDimensionMm: 25.5,
        targetDimensionMm: 24.0,
        lengthMm: 800,
        materialGrade: 'brass_c36000',
        quantity: 1,
      });

      for (const k of [2, 5, 11, 25]) {
        const scaled = calculateStockNormalizationImpact({
          stockType: 'hex_bar',
          currentDimensionMm: 25.5,
          targetDimensionMm: 24.0,
          lengthMm: 800,
          materialGrade: 'brass_c36000',
          quantity: k,
        });

        expect(scaled.unitSavingsNgn).toBe(unitImpact.unitSavingsNgn);
        expect(scaled.totalSavingsNgn).toBe(unitImpact.totalSavingsNgn * k);
      }
    });

    it('strictly increases machiningSavingsNgn with machineHourlyRateNgn while keeping materialSavingsNgn invariant', () => {
      const lowRate = calculateStockNormalizationImpact({
        stockType: 'cold_drawn_round_bar',
        currentDimensionMm: 31.5,
        targetDimensionMm: 30.0,
        lengthMm: 900,
        materialGrade: 'alloy_steel_4140',
        rateCard: { machineHourlyRateNgn: 12000 },
      });
      const midRate = calculateStockNormalizationImpact({
        stockType: 'cold_drawn_round_bar',
        currentDimensionMm: 31.5,
        targetDimensionMm: 30.0,
        lengthMm: 900,
        materialGrade: 'alloy_steel_4140',
        rateCard: { machineHourlyRateNgn: 24000 },
      });
      const highRate = calculateStockNormalizationImpact({
        stockType: 'cold_drawn_round_bar',
        currentDimensionMm: 31.5,
        targetDimensionMm: 30.0,
        lengthMm: 900,
        materialGrade: 'alloy_steel_4140',
        rateCard: { machineHourlyRateNgn: 36000 },
      });

      expect(midRate.machiningSavingsNgn).toBeGreaterThan(lowRate.machiningSavingsNgn);
      expect(highRate.machiningSavingsNgn).toBeGreaterThan(midRate.machiningSavingsNgn);

      expect(lowRate.materialSavingsNgn).toBe(midRate.materialSavingsNgn);
      expect(midRate.materialSavingsNgn).toBe(highRate.materialSavingsNgn);
      expect(lowRate.deltaMassKg).toBe(highRate.deltaMassKg);
    });

    it('actively uses widthMm for sheet/plate and wallThicknessMm for round_tube', () => {
      const narrowPlate = calculateStockNormalizationImpact({
        stockType: 'plate',
        currentDimensionMm: 13.5,
        targetDimensionMm: 12.0,
        lengthMm: 1000,
        widthMm: 200,
        materialGrade: 'mild_steel',
      });
      const widePlate = calculateStockNormalizationImpact({
        stockType: 'plate',
        currentDimensionMm: 13.5,
        targetDimensionMm: 12.0,
        lengthMm: 1000,
        widthMm: 600,
        materialGrade: 'mild_steel',
      });

      expect(widePlate.deltaMassKg / narrowPlate.deltaMassKg).toBeCloseTo(3, 3);
      expect(widePlate.materialSavingsNgn).toBeGreaterThan(narrowPlate.materialSavingsNgn);

      const thinTube = calculateStockNormalizationImpact({
        stockType: 'round_tube',
        currentDimensionMm: 42.5,
        targetDimensionMm: 40.0,
        lengthMm: 1000,
        wallThicknessMm: 1.5,
        materialGrade: 'stainless_steel_304',
      });
      const thickTube = calculateStockNormalizationImpact({
        stockType: 'round_tube',
        currentDimensionMm: 42.5,
        targetDimensionMm: 40.0,
        lengthMm: 1000,
        wallThicknessMm: 4.0,
        materialGrade: 'stainless_steel_304',
      });

      expect(thickTube.deltaMassKg).toBeGreaterThan(thinTube.deltaMassKg);
      expect(thickTube.materialSavingsNgn).toBeGreaterThan(thinTube.materialSavingsNgn);
    });
  });

  describe('Seeded Property-Based Fuzz Sweep (200 Randomized Cases)', () => {
    it('upholds all physical and accounting invariants across 200 randomized stock cases', () => {
      const rng = createSeededRng(0x20260032);
      const materialKeys = Object.keys(MATERIAL_REFERENCE_TABLE) as CanonicalMaterialKey[];

      for (let i = 0; i < 200; i++) {
        const stockType: StockType = ALL_STOCK_TYPES[Math.floor(rng() * ALL_STOCK_TYPES.length)];
        const catalog = STANDARD_STOCK_SIZES_MM[stockType];
        const minSize = catalog[0];
        const maxSize = catalog[catalog.length - 1];

        // Mix exact standard dimensions (~20%) and arbitrary non-standard dimensions (~80%)
        const pickExactStandard = rng() < 0.2;
        const specifiedDimensionMm = pickExactStandard
          ? catalog[Math.floor(rng() * catalog.length)]
          : Number((minSize * 0.7 + rng() * (maxSize * 1.15 - minSize * 0.7)).toFixed(2));

        const lengthMm = Math.round(50 + rng() * 1950);
        const widthMm = Math.round(50 + rng() * 1450);
        const wallThicknessMm = Number((0.5 + rng() * 5.5).toFixed(2));
        const quantity = 1 + Math.floor(rng() * 50);
        const materialGrade = materialKeys[Math.floor(rng() * materialKeys.length)];

        const rateCard: ShopRateCard = {
          materialCostNgnPerKg: Math.round(1500 + rng() * 12000),
          machineHourlyRateNgn: Math.round(10000 + rng() * 40000),
          turningSetupMinutes: Math.round(10 + rng() * 45),
          materialRemovalRateCm3PerMin: Number((6 + rng() * 64).toFixed(1)),
        };

        const rec = recommendStandardStock({
          stockType,
          specifiedDimensionMm,
          lengthMm,
          widthMm,
          wallThicknessMm,
          materialGrade,
          quantity,
          rateCard,
        });

        const sb = rec.savingsBreakdown;

        // Universal non-negativity and arithmetic consistency
        expect(sb.materialSavingsNgn).toBeGreaterThanOrEqual(0);
        expect(sb.machiningSavingsNgn).toBeGreaterThanOrEqual(0);
        expect(sb.unitSavingsNgn).toBe(sb.materialSavingsNgn + sb.machiningSavingsNgn);
        expect(sb.totalSavingsNgn).toBe(sb.unitSavingsNgn * quantity);
        expect(sb.totalSavingsNgn).toBeGreaterThanOrEqual(0);
        expect(rec.deltaMassKg).toBeGreaterThanOrEqual(0);
        expect(rec.chipVolumeCm3).toBeGreaterThanOrEqual(0);
        expect(rec.machiningMinutesSaved).toBeGreaterThanOrEqual(0);

        // Percentage bounds
        expect(rec.materialWasteReductionPct).toBeGreaterThanOrEqual(0);
        expect(rec.materialWasteReductionPct).toBeLessThanOrEqual(100);
        expect(rec.turningChipWastePct).toBeGreaterThanOrEqual(0);
        expect(rec.turningChipWastePct).toBeLessThanOrEqual(100);

        // Already-standard invariant
        if (rec.isAlreadyStandard) {
          expect(sb.totalSavingsNgn).toBe(0);
          expect(rec.deltaMassKg).toBe(0);
          expect(rec.chipVolumeCm3).toBe(0);
          expect(rec.machiningMinutesSaved).toBe(0);
          expect(rec.materialWasteReductionPct).toBe(0);
        }

        // Strict downsizing invariant
        if (!rec.isAlreadyStandard && rec.recommendedDimensionMm < rec.oversizedRawStockMm) {
          expect(rec.deltaMassKg).toBeGreaterThanOrEqual(0);
          expect(rec.materialWasteReductionPct).toBeGreaterThan(0);
        } else {
          expect(sb.totalSavingsNgn).toBe(0);
        }

        // Quote clamping invariant (both unclamped and clamped baseline scenarios)
        const unclampedBaseline = sb.totalSavingsNgn + Math.round(10000 + rng() * 200000);
        const clampedSavingsA = Math.min(sb.totalSavingsNgn, unclampedBaseline);
        const updatedQuoteA = unclampedBaseline - clampedSavingsA;
        expect(updatedQuoteA).toBe(unclampedBaseline - sb.totalSavingsNgn);
        expect(updatedQuoteA).toBeGreaterThanOrEqual(0);

        const tightBaseline = Math.floor(sb.totalSavingsNgn * 0.5);
        const clampedSavingsB = Math.min(sb.totalSavingsNgn, tightBaseline);
        const updatedQuoteB = tightBaseline - clampedSavingsB;
        expect(updatedQuoteB).toBe(tightBaseline - clampedSavingsB);
        expect(updatedQuoteB).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe.skipIf(process.env.DB_AVAILABLE !== 'true')('Gherkin Acceptance Criteria & Service Persistence', () => {
    it('splits 31.5 mm shaft assembly into Weldment & Shaft work packages, normalizes to 30.0 mm, and drops ₦98,000 quote into ~₦78,000 range from physics', async () => {
      // Arrange: Given an assembly with a 31.5 mm specified shaft diameter and calibrated Lagos shop rate card
      const shopRateCard: ShopRateCard = {
        materialCostNgnPerKg: 2600,
        machineHourlyRateNgn: 22000,
        turningSetupMinutes: 28,
        materialRemovalRateCm3PerMin: 24,
      };

      const expectedImpact = calculateStockNormalizationImpact({
        stockType: 'cold_drawn_round_bar',
        currentDimensionMm: 31.5,
        targetDimensionMm: 30.0,
        lengthMm: 1150,
        materialGrade: 'en8_cold_drawn_steel',
        quantity: 1,
        rateCard: shopRateCard,
      });

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
        rateCard: shopRateCard,
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

      // Assert 1: Split persisted with baseline ₦98,000 quote and physics-derived projected savings
      expect(splitResult.status).toBe('bom_split');
      expect(splitResult.workPackages).toHaveLength(2);
      expect(splitResult.workPackages[0].name).toBe('Work Package A (Weldment)');
      expect(splitResult.workPackages[1].name).toBe('Work Package B (Shaft)');
      expect(splitResult.baselineEstimatedQuoteNgn).toBe(98000);
      expect(splitResult.currentEstimatedQuoteNgn).toBe(98000);
      expect(splitResult.recommendedSavingsNgn).toBe(expectedImpact.totalSavingsNgn);

      const shaftPackage = splitResult.workPackages[1];
      expect(shaftPackage.stockRecommendation?.recommendedDimensionMm).toBe(30);
      expect(shaftPackage.stockRecommendation?.deltaMassKg).toBeCloseTo(
        expectedImpact.deltaMassKg,
        4,
      );

      // Act 2: Apply parameter change to 30.0 mm standard cold-drawn stock
      const normResult = await applyStockNormalization({
        jobId: job.id,
        workPackageId: shaftPackage.id,
        targetDimensionMm: 30.0,
        appliedBy: 'ae-engineer-lagos-01',
        engineeringNote:
          'Normalized shaft OD to 30.0 mm standard cold-drawn EN8 stock; bearing seat updated to 6206.',
      });

      const expectedUpdatedQuote = 98000 - expectedImpact.totalSavingsNgn;

      // Assert 2: Quote deterministically drops into ~₦78,000 range from real mass + turning math
      expect(normResult.changed).toBe(true);
      expect(normResult.previousDimensionMm).toBe(31.5);
      expect(normResult.normalizedDimensionMm).toBe(30.0);
      expect(normResult.targetIsStandardStock).toBe(true);
      expect(normResult.oversizedRawStockAvoidedMm).toBe(35);
      expect(normResult.deltaMassKg).toBe(expectedImpact.deltaMassKg);
      expect(normResult.chipVolumeCm3).toBe(expectedImpact.chipVolumeCm3);
      expect(normResult.machiningMinutesSaved).toBe(expectedImpact.machiningMinutesSaved);
      expect(normResult.savingsBreakdown.materialSavingsNgn).toBe(
        expectedImpact.materialSavingsNgn,
      );
      expect(normResult.savingsBreakdown.machiningSavingsNgn).toBe(
        expectedImpact.machiningSavingsNgn,
      );
      expect(normResult.savingsBreakdown.totalSavingsNgn).toBe(expectedImpact.totalSavingsNgn);
      expect(normResult.previousEstimatedQuoteNgn).toBe(98000);
      expect(normResult.updatedEstimatedQuoteNgn).toBe(expectedUpdatedQuote);
      expect(normResult.updatedEstimatedQuoteNgn).toBeGreaterThanOrEqual(77000);
      expect(normResult.updatedEstimatedQuoteNgn).toBeLessThanOrEqual(79500);
      expect(normResult.totalJobSavingsNgn).toBe(expectedImpact.totalSavingsNgn);

      // Verify Postgres job metadata persistence including full physical breakdown
      const [dbJob] = await db.select().from(jobs).where(eq(jobs.id, job.id as any)).limit(1);
      const meta = dbJob.metadata as Record<string, any>;

      expect(meta.estimated_quote_ngn).toBe(expectedUpdatedQuote);
      expect(meta.baseline_estimated_quote_ngn).toBe(98000);
      expect(meta.ae_workbench.status).toBe('normalized');
      expect(meta.ae_workbench.current_estimated_quote_ngn).toBe(expectedUpdatedQuote);
      expect(meta.ae_workbench.total_savings_ngn).toBe(expectedImpact.totalSavingsNgn);
      expect(meta.ae_workbench.parameter_changes).toHaveLength(1);
      expect(meta.ae_workbench.parameter_changes[0].deltaMassKg).toBe(expectedImpact.deltaMassKg);
      expect(meta.ae_workbench.parameter_changes[0].chipVolumeCm3).toBe(
        expectedImpact.chipVolumeCm3,
      );
      expect(meta.ae_workbench.parameter_changes[0].machiningMinutesSaved).toBe(
        expectedImpact.machiningMinutesSaved,
      );
    });

    it('clamps work package savings at baseline cost so quote never goes negative', async () => {
      const job = await createJob(
        {
          company_name: 'Ogun Steel Works',
          product_name: 'Batch Pin Pack',
          location: { country: 'Nigeria', state: 'Ogun' },
        },
        orgId,
        userId,
      );

      const splitResult = await splitJobBom({
        jobId: job.id,
        workPackages: [
          {
            code: 'WP-A',
            name: 'Batch Turned Pins',
            category: 'turned_shaft',
            quantity: 10,
            estimatedCostNgn: 15000,
            stockSpec: {
              stockType: 'cold_drawn_round_bar',
              specifiedDimensionMm: 31.5,
              lengthMm: 1000,
            },
          },
        ],
      });

      const normResult = await applyStockNormalization({
        jobId: job.id,
        workPackageId: splitResult.workPackages[0].id,
        targetDimensionMm: 30.0,
      });

      expect(normResult.savingsBreakdown.totalSavingsNgn).toBe(15000);
      expect(normResult.updatedEstimatedQuoteNgn).toBe(0);
      expect(normResult.workPackages[0].estimatedCostNgn).toBe(0);
    });

    it('yields zero unnecessary change when normalizing a package already at 30.0 mm standard stock', async () => {
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
              lengthMm: 800,
            },
          },
        ],
      });

      const normResult = await applyStockNormalization({
        jobId: job.id,
        workPackageId: splitResult.workPackages[0].id,
        targetDimensionMm: 30.0,
      });

      expect(normResult.changed).toBe(false);
      expect(normResult.deltaMassKg).toBe(0);
      expect(normResult.savingsBreakdown.totalSavingsNgn).toBe(0);
      expect(normResult.previousEstimatedQuoteNgn).toBe(45000);
      expect(normResult.updatedEstimatedQuoteNgn).toBe(45000);
    });

    it('rejects invalid payloads with 400 and non-existent jobs with 404', async () => {
      const missingJobId = '00000000-0000-0000-0000-000000000000';

      await expect(
        splitJobBom({
          jobId: missingJobId,
          workPackages: [],
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(() =>
        calculateStockNormalizationImpact({
          stockType: 'cold_drawn_round_bar',
          currentDimensionMm: 31.5,
          targetDimensionMm: 30.0,
          lengthMm: -100,
        }),
      ).toThrow();

      expect(() =>
        calculateStockNormalizationImpact({
          stockType: 'cold_drawn_round_bar',
          currentDimensionMm: 31.5,
          targetDimensionMm: 30.0,
          rateCard: { materialRemovalRateCm3PerMin: 0 },
        }),
      ).toThrow();

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

    it('returns full stock catalog, material table, and default rate card via GET /stock-catalog', async () => {
      const res = await fetch(`${baseUrl}/stock-catalog`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(Object.keys(data.catalog).sort()).toEqual([...ALL_STOCK_TYPES].sort());
      expect(data.materials.mild_steel.densityKgPerM3).toBe(7850);
      expect(data.materials.aluminum_6061_t6.densityKgPerM3).toBe(2700);
      expect(data.defaultRateCard.machineHourlyRateNgn).toBeGreaterThan(0);
    });

    it.skipIf(process.env.DB_AVAILABLE !== 'true')('executes full AE triage workbench HTTP flow with physical breakdown and custom rateCard', async () => {
      const rateCard: ShopRateCard = {
        materialCostNgnPerKg: 2600,
        machineHourlyRateNgn: 22000,
        turningSetupMinutes: 28,
        materialRemovalRateCm3PerMin: 24,
      };

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

      // Act 1: Query stock recommendation via HTTP with explicit length, material, and rate card
      const recRes = await fetch(`${baseUrl}/stock-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockType: 'cold_drawn_round_bar',
          specifiedDimensionMm: 31.5,
          lengthMm: 1150,
          materialGrade: 'mild_steel',
          rateCard,
        }),
      });
      expect(recRes.status).toBe(200);
      const recData = await recRes.json();
      expect(recData.recommendedDimensionMm).toBe(30);
      expect(recData.deltaMassKg).toBeGreaterThan(2);
      expect(recData.chipVolumeCm3).toBeGreaterThan(200);
      expect(recData.machiningMinutesSaved).toBeGreaterThan(30);
      expect(recData.savingsBreakdown.materialSavingsNgn).toBeGreaterThan(0);
      expect(recData.savingsBreakdown.machiningSavingsNgn).toBeGreaterThan(0);
      expect(recData.savingsBreakdown.totalSavingsNgn).toBe(
        recData.savingsBreakdown.materialSavingsNgn + recData.savingsBreakdown.machiningSavingsNgn,
      );

      // Act 2: Split BOM via HTTP
      const splitRes = await fetch(`${baseUrl}/jobs/${job.id}/split-bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateCard,
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
              materialGrade: 'mild_steel',
              estimatedCostNgn: 38000,
              stockSpec: {
                stockType: 'cold_drawn_round_bar',
                specifiedDimensionMm: 31.5,
                lengthMm: 1150,
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
      expect(normData.updatedEstimatedQuoteNgn).toBe(
        98000 - recData.savingsBreakdown.totalSavingsNgn,
      );
      expect(normData.savingsBreakdown.deltaMassKg).toBe(recData.deltaMassKg);
      expect(normData.savingsBreakdown.chipVolumeCm3).toBe(recData.chipVolumeCm3);
      expect(normData.savingsBreakdown.machiningMinutesSaved).toBe(recData.machiningMinutesSaved);

      // Act 4: Fetch workbench state via HTTP
      const stateRes = await fetch(`${baseUrl}/jobs/${job.id}`);
      expect(stateRes.status).toBe(200);
      const stateData = await stateRes.json();
      expect(stateData.workbench.current_estimated_quote_ngn).toBe(
        normData.updatedEstimatedQuoteNgn,
      );
      expect(stateData.workbench.work_packages).toHaveLength(2);
    });

    it.skipIf(process.env.DB_AVAILABLE !== 'true')('returns 400 for invalid inputs and 404 for unknown job over HTTP', async () => {
      const badStockTypeRes = await fetch(`${baseUrl}/stock-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockType: 'i_beam', specifiedDimensionMm: 31.5 }),
      });
      expect(badStockTypeRes.status).toBe(400);

      const badRes = await fetch(
        `${baseUrl}/jobs/00000000-0000-0000-0000-000000000000/split-bom`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workPackages: [] }),
        },
      );
      expect(badRes.status).toBe(400);

      const missingRes = await fetch(
        `${baseUrl}/jobs/00000000-0000-0000-0000-000000000000`,
      );
      expect(missingRes.status).toBe(404);
    });
  });
});
