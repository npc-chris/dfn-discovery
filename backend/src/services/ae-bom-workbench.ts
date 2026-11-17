/**
 * Applications Engineer BOM Splitting & Stock Normalization Service [KAN-32]
 *
 * Provides deterministic engineering workbench operations for triaged multi-body assemblies:
 * - Standard metric cold-drawn round bar and sheet metal stock catalog & lookup
 * - Oversized raw stock & turning waste reduction calculations
 * - Assembly BOM decomposition into discrete manufacturable Work Packages
 * - Parameter normalization with deterministic customer quote recalculation & audit trail
 */

import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { jobs } from '../db/schema';
import { AppError } from '../middleware/error';
import { recordActivity } from './activity-service';

// ============================================================================
// STANDARD STOCK CATALOG & COST MODEL CONSTANTS
// ============================================================================

export type StockType = 'cold_drawn_round_bar' | 'sheet_metal';

export type WorkPackageCategory =
  | 'weldment'
  | 'turned_shaft'
  | 'cnc_machined'
  | 'sheet_metal'
  | 'cast_part'
  | 'assembly'
  | 'other';

/**
 * Standard metric stock sizes (mm) commonly stocked across Nigerian / ISO metalworking hubs.
 */
export const STANDARD_STOCK_SIZES_MM: Record<StockType, readonly number[]> = {
  cold_drawn_round_bar: [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60, 65, 75, 80, 90, 100],
  sheet_metal: [1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 16.0, 20.0, 25.0],
};

interface StockCostModelParams {
  /** Base per-unit machining setup & full-length OD turning / grinding elimination savings (NGN). */
  processEliminationBaseNgn: number;
  /** Per-mm raw stock step & chip waste savings when avoiding oversized stock purchase (NGN/mm). */
  oversizedStockStepRateNgn: number;
}

const STOCK_COST_MODEL: Record<StockType, StockCostModelParams> = {
  cold_drawn_round_bar: {
    processEliminationBaseNgn: 14000,
    oversizedStockStepRateNgn: 1200,
  },
  sheet_metal: {
    processEliminationBaseNgn: 8000,
    oversizedStockStepRateNgn: 4000,
  },
};

const DIMENSION_EPSILON_MM = 0.001;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// TYPES
// ============================================================================

export interface StockSpecInput {
  stockType: StockType;
  specifiedDimensionMm: number;
  lengthMm?: number;
  materialGrade?: string;
}

export interface StockRecommendation {
  stockType: StockType;
  specifiedDimensionMm: number;
  isAlreadyStandard: boolean;
  oversizedRawStockMm: number;
  recommendedDimensionMm: number;
  dimensionDeltaMm: number;
  dimensionDeltaPct: number;
  oversizedStockStepAvoidedMm: number;
  turningChipWastePct: number;
  materialWasteReductionPct: number;
  savingsBreakdown: {
    turningSetupAndPassEliminationNgn: number;
    oversizedStockPremiumNgn: number;
    unitSavingsNgn: number;
    totalSavingsNgn: number;
  };
  rationale: string;
}

export interface WorkPackageInput {
  code?: string;
  name: string;
  category: WorkPackageCategory;
  processType?: string;
  materialGrade?: string;
  quantity?: number;
  estimatedCostNgn?: number;
  partNames?: string[];
  bodyIndices?: number[];
  stockSpec?: StockSpecInput;
  notes?: string;
}

export interface WorkPackageStockSpec {
  stockType: StockType;
  originalDimensionMm: number;
  specifiedDimensionMm: number;
  lengthMm?: number;
  materialGrade?: string;
  isStandardStock: boolean;
}

export interface WorkPackageRecord {
  id: string;
  code: string;
  name: string;
  category: WorkPackageCategory;
  processType: string;
  materialGrade: string | null;
  quantity: number;
  baselineEstimatedCostNgn: number;
  estimatedCostNgn: number;
  partNames: string[];
  bodyIndices: number[];
  stockSpec: WorkPackageStockSpec | null;
  stockRecommendation: StockRecommendation | null;
  notes: string | null;
}

export interface ParameterChangeRecord {
  id: string;
  workPackageId: string;
  workPackageCode: string;
  workPackageName: string;
  parameter: string;
  stockType: StockType;
  previousDimensionMm: number;
  normalizedDimensionMm: number;
  oversizedRawStockAvoidedMm: number;
  savingsNgn: number;
  previousJobQuoteNgn: number;
  updatedJobQuoteNgn: number;
  engineeringNote: string | null;
  appliedBy: string;
  appliedAt: string;
}

export interface AeWorkbenchMetadata {
  status: 'bom_split' | 'normalized';
  baseline_estimated_quote_ngn: number;
  current_estimated_quote_ngn: number;
  total_savings_ngn: number;
  work_packages: WorkPackageRecord[];
  parameter_changes: ParameterChangeRecord[];
  reviewed_by: string;
  split_at: string;
  updated_at: string;
}

export interface SplitBomInput {
  jobId: string;
  workPackages: WorkPackageInput[];
  initialEstimatedQuoteNgn?: number;
  reviewedBy?: string;
}

export interface SplitBomResult {
  jobId: string;
  status: 'bom_split';
  baselineEstimatedQuoteNgn: number;
  currentEstimatedQuoteNgn: number;
  workPackages: WorkPackageRecord[];
  recommendedSavingsNgn: number;
  updatedAt: string;
}

export interface ApplyStockNormalizationInput {
  jobId: string;
  workPackageId: string;
  targetDimensionMm: number;
  stockType?: StockType;
  appliedBy?: string;
  engineeringNote?: string;
}

export interface ApplyStockNormalizationResult {
  jobId: string;
  workPackageId: string;
  workPackageCode: string;
  workPackageName: string;
  changed: boolean;
  previousDimensionMm: number;
  normalizedDimensionMm: number;
  targetIsStandardStock: boolean;
  oversizedRawStockAvoidedMm: number;
  materialWasteReductionPct: number;
  savingsBreakdown: {
    turningSetupAndPassEliminationNgn: number;
    oversizedStockPremiumNgn: number;
    unitSavingsNgn: number;
    totalSavingsNgn: number;
  };
  previousEstimatedQuoteNgn: number;
  updatedEstimatedQuoteNgn: number;
  totalJobSavingsNgn: number;
  workPackages: WorkPackageRecord[];
  message: string;
}

export interface AeWorkbenchStateResult {
  jobId: string;
  productName: string;
  companyName: string;
  triageQueue: string | null;
  cadTelemetry: Record<string, unknown> | null;
  targetCeilingNgn: number | null;
  workbench: AeWorkbenchMetadata | null;
}

// ============================================================================
// PURE STOCK CATALOG & NORMALIZATION CALCULATIONS
// ============================================================================

export function isValidStockType(value: unknown): value is StockType {
  return value === 'cold_drawn_round_bar' || value === 'sheet_metal';
}

export function getStandardStockCatalog(): Record<StockType, readonly number[]> {
  return {
    cold_drawn_round_bar: [...STANDARD_STOCK_SIZES_MM.cold_drawn_round_bar],
    sheet_metal: [...STANDARD_STOCK_SIZES_MM.sheet_metal],
  };
}

export function isStandardStockSize(dimensionMm: number, stockType: StockType): boolean {
  const catalog = STANDARD_STOCK_SIZES_MM[stockType];
  return catalog.some((size) => Math.abs(size - dimensionMm) <= DIMENSION_EPSILON_MM);
}

/**
 * Returns the smallest standard stock size strictly greater than the specified dimension
 * (the oversized raw bar/sheet a shop would have to purchase and turn/grind down).
 */
function findOversizedRawStockMm(dimensionMm: number, stockType: StockType): number {
  const catalog = STANDARD_STOCK_SIZES_MM[stockType];
  const exact = catalog.find((size) => Math.abs(size - dimensionMm) <= DIMENSION_EPSILON_MM);
  if (exact !== undefined) return exact;

  const nextLarger = catalog.find((size) => size > dimensionMm);
  if (nextLarger !== undefined) return nextLarger;

  // Above catalog max: round up to next 5 mm increment
  return Math.ceil(dimensionMm / 5) * 5;
}

/**
 * Returns the closest standard stock size suitable for direct cold-drawn / standard gauge usage,
 * preferring the nearest standard size <= specifiedDimensionMm to avoid oversized bar turning.
 */
function findRecommendedStandardSizeMm(dimensionMm: number, stockType: StockType): number {
  const catalog = STANDARD_STOCK_SIZES_MM[stockType];
  const exact = catalog.find((size) => Math.abs(size - dimensionMm) <= DIMENSION_EPSILON_MM);
  if (exact !== undefined) return exact;

  let nearestLower: number | undefined;
  for (const size of catalog) {
    if (size < dimensionMm) {
      nearestLower = size;
    } else {
      break;
    }
  }

  return nearestLower ?? catalog[0];
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes material waste percentages and deterministic cost savings for moving
 * from `currentDimensionMm` to `targetDimensionMm`.
 */
export function calculateStockNormalizationImpact(params: {
  stockType: StockType;
  currentDimensionMm: number;
  targetDimensionMm: number;
  quantity?: number;
}): {
  isCurrentStandard: boolean;
  isTargetStandard: boolean;
  oversizedRawStockMm: number;
  oversizedStockStepAvoidedMm: number;
  turningChipWastePct: number;
  materialWasteReductionPct: number;
  turningSetupAndPassEliminationNgn: number;
  oversizedStockPremiumNgn: number;
  unitSavingsNgn: number;
  totalSavingsNgn: number;
} {
  const { stockType, currentDimensionMm, targetDimensionMm } = params;
  const quantity = params.quantity ?? 1;

  if (!isValidStockType(stockType)) {
    throw new AppError(400, `Unsupported stockType: ${String(stockType)}`);
  }
  if (!Number.isFinite(currentDimensionMm) || currentDimensionMm <= 0) {
    throw new AppError(400, 'currentDimensionMm must be a positive number');
  }
  if (!Number.isFinite(targetDimensionMm) || targetDimensionMm <= 0) {
    throw new AppError(400, 'targetDimensionMm must be a positive number');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'quantity must be a positive integer');
  }

  const isCurrentStandard = isStandardStockSize(currentDimensionMm, stockType);
  const isTargetStandard = isStandardStockSize(targetDimensionMm, stockType);
  const oversizedRawStockMm = findOversizedRawStockMm(currentDimensionMm, stockType);

  // If the specified dimension is already standard stock, no oversized bar turning penalty exists.
  if (isCurrentStandard) {
    return {
      isCurrentStandard: true,
      isTargetStandard,
      oversizedRawStockMm: currentDimensionMm,
      oversizedStockStepAvoidedMm: 0,
      turningChipWastePct: 0,
      materialWasteReductionPct: 0,
      turningSetupAndPassEliminationNgn: 0,
      oversizedStockPremiumNgn: 0,
      unitSavingsNgn: 0,
      totalSavingsNgn: 0,
    };
  }

  // Cross-sectional waste metrics (area scales with D^2 for round bars, linear with thickness for sheets)
  const rawMetric = stockType === 'cold_drawn_round_bar' ? oversizedRawStockMm ** 2 : oversizedRawStockMm;
  const currentMetric = stockType === 'cold_drawn_round_bar' ? currentDimensionMm ** 2 : currentDimensionMm;
  const targetMetric = stockType === 'cold_drawn_round_bar' ? targetDimensionMm ** 2 : targetDimensionMm;

  const turningChipWastePct = rawMetric > 0 ? roundTo2(((rawMetric - currentMetric) / rawMetric) * 100) : 0;

  // Savings only accrue when normalizing onto a standard stock size (eliminates full-length OD turning / grinding)
  if (!isTargetStandard) {
    return {
      isCurrentStandard: false,
      isTargetStandard: false,
      oversizedRawStockMm,
      oversizedStockStepAvoidedMm: 0,
      turningChipWastePct,
      materialWasteReductionPct: 0,
      turningSetupAndPassEliminationNgn: 0,
      oversizedStockPremiumNgn: 0,
      unitSavingsNgn: 0,
      totalSavingsNgn: 0,
    };
  }

  const model = STOCK_COST_MODEL[stockType];
  const oversizedStockStepAvoidedMm = roundTo2(Math.max(0, oversizedRawStockMm - targetDimensionMm));
  const materialWasteReductionPct =
    rawMetric > 0 && targetMetric <= rawMetric
      ? roundTo2(((rawMetric - targetMetric) / rawMetric) * 100)
      : 0;

  const turningSetupAndPassEliminationNgn = model.processEliminationBaseNgn;
  const oversizedStockPremiumNgn = Math.round(
    oversizedStockStepAvoidedMm * model.oversizedStockStepRateNgn,
  );
  const unitSavingsNgn = turningSetupAndPassEliminationNgn + oversizedStockPremiumNgn;
  const totalSavingsNgn = unitSavingsNgn * quantity;

  return {
    isCurrentStandard: false,
    isTargetStandard: true,
    oversizedRawStockMm,
    oversizedStockStepAvoidedMm,
    turningChipWastePct,
    materialWasteReductionPct,
    turningSetupAndPassEliminationNgn,
    oversizedStockPremiumNgn,
    unitSavingsNgn,
    totalSavingsNgn,
  };
}

/**
 * Recommends the optimal standard cold-drawn bar or sheet stock size for a specified dimension
 * and quantifies turning/material savings.
 */
export function recommendStandardStock(params: {
  stockType: StockType;
  specifiedDimensionMm: number;
  quantity?: number;
}): StockRecommendation {
  const { stockType, specifiedDimensionMm } = params;
  const quantity = params.quantity ?? 1;

  if (!isValidStockType(stockType)) {
    throw new AppError(400, `Unsupported stockType: ${String(stockType)}`);
  }
  if (!Number.isFinite(specifiedDimensionMm) || specifiedDimensionMm <= 0) {
    throw new AppError(400, 'specifiedDimensionMm must be a positive number');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'quantity must be a positive integer');
  }

  const recommendedDimensionMm = findRecommendedStandardSizeMm(specifiedDimensionMm, stockType);
  const impact = calculateStockNormalizationImpact({
    stockType,
    currentDimensionMm: specifiedDimensionMm,
    targetDimensionMm: recommendedDimensionMm,
    quantity,
  });

  const dimensionDeltaMm = roundTo2(recommendedDimensionMm - specifiedDimensionMm);
  const dimensionDeltaPct = roundTo2((dimensionDeltaMm / specifiedDimensionMm) * 100);

  const stockLabel =
    stockType === 'cold_drawn_round_bar' ? 'cold-drawn round bar' : 'standard gauge sheet metal';

  const rationale = impact.isCurrentStandard
    ? `Specified dimension ${specifiedDimensionMm.toFixed(1)} mm matches standard ${stockLabel} stock; no normalization required.`
    : `Specified ${specifiedDimensionMm.toFixed(1)} mm requires oversized ${impact.oversizedRawStockMm.toFixed(1)} mm raw stock (${impact.turningChipWastePct}% chip waste). Normalizing to ${recommendedDimensionMm.toFixed(1)} mm standard ${stockLabel} eliminates oversized stock procurement and full-length OD turning, saving ₦${impact.totalSavingsNgn.toLocaleString()}.`;

  return {
    stockType,
    specifiedDimensionMm,
    isAlreadyStandard: impact.isCurrentStandard,
    oversizedRawStockMm: impact.oversizedRawStockMm,
    recommendedDimensionMm,
    dimensionDeltaMm,
    dimensionDeltaPct,
    oversizedStockStepAvoidedMm: impact.oversizedStockStepAvoidedMm,
    turningChipWastePct: impact.turningChipWastePct,
    materialWasteReductionPct: impact.materialWasteReductionPct,
    savingsBreakdown: {
      turningSetupAndPassEliminationNgn: impact.turningSetupAndPassEliminationNgn,
      oversizedStockPremiumNgn: impact.oversizedStockPremiumNgn,
      unitSavingsNgn: impact.unitSavingsNgn,
      totalSavingsNgn: impact.totalSavingsNgn,
    },
    rationale,
  };
}

// ============================================================================
// DATABASE-BACKED AE WORKBENCH OPERATIONS
// ============================================================================

async function fetchJobOrThrow(jobId: string) {
  if (!jobId || !UUID_REGEX.test(jobId)) {
    throw new AppError(404, `Job ${jobId} not found`);
  }

  const [jobRow] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId as any))
    .limit(1);

  if (!jobRow) {
    throw new AppError(404, `Job ${jobId} not found`);
  }

  return jobRow;
}

function defaultProcessForCategory(category: WorkPackageCategory): string {
  switch (category) {
    case 'weldment':
      return 'welding_fabrication';
    case 'turned_shaft':
      return 'cnc_turning';
    case 'cnc_machined':
      return 'cnc_milling';
    case 'sheet_metal':
      return 'sheet_metal_fabrication';
    case 'cast_part':
      return 'casting';
    case 'assembly':
      return 'mechanical_assembly';
    default:
      return 'general_fabrication';
  }
}

function generateWorkPackageCode(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  const suffix = index >= 26 ? `${Math.floor(index / 26) + 1}` : '';
  return `WP-${letter}${suffix}`;
}

/**
 * Splits a triaged multi-body assembly job's BOM into discrete Work Packages
 * (e.g., Work Package A: Weldment, Work Package B: Shaft) and evaluates standard
 * stock recommendations for each package.
 */
export async function splitJobBom(input: SplitBomInput): Promise<SplitBomResult> {
  if (!Array.isArray(input.workPackages) || input.workPackages.length === 0) {
    throw new AppError(400, 'workPackages must be a non-empty array');
  }

  if (
    input.initialEstimatedQuoteNgn !== undefined &&
    (!Number.isFinite(input.initialEstimatedQuoteNgn) || input.initialEstimatedQuoteNgn < 0)
  ) {
    throw new AppError(400, 'initialEstimatedQuoteNgn must be a non-negative number');
  }

  // Validate individual work package payloads before hitting DB
  for (let i = 0; i < input.workPackages.length; i++) {
    const wp = input.workPackages[i];
    if (!wp || typeof wp.name !== 'string' || wp.name.trim().length === 0) {
      throw new AppError(400, `Work package at index ${i} must have a non-empty name`);
    }
    if (wp.quantity !== undefined && (!Number.isInteger(wp.quantity) || wp.quantity <= 0)) {
      throw new AppError(400, `Work package "${wp.name}" quantity must be a positive integer`);
    }
    if (
      wp.estimatedCostNgn !== undefined &&
      (!Number.isFinite(wp.estimatedCostNgn) || wp.estimatedCostNgn < 0)
    ) {
      throw new AppError(400, `Work package "${wp.name}" estimatedCostNgn must be a non-negative number`);
    }
    if (wp.stockSpec) {
      if (!isValidStockType(wp.stockSpec.stockType)) {
        throw new AppError(400, `Work package "${wp.name}" has unsupported stockType`);
      }
      if (
        !Number.isFinite(wp.stockSpec.specifiedDimensionMm) ||
        wp.stockSpec.specifiedDimensionMm <= 0
      ) {
        throw new AppError(
          400,
          `Work package "${wp.name}" stockSpec.specifiedDimensionMm must be a positive number`,
        );
      }
    }
  }

  const jobRow = await fetchJobOrThrow(input.jobId);
  const existingMeta = (jobRow.metadata || {}) as Record<string, unknown>;

  // Determine per-package baseline cost estimates
  const anyPackageHasCost = input.workPackages.some((wp) => wp.estimatedCostNgn !== undefined);
  const fallbackTotal =
    input.initialEstimatedQuoteNgn ??
    (typeof existingMeta.estimated_quote_ngn === 'number' ? existingMeta.estimated_quote_ngn : undefined) ??
    jobRow.target_ceiling_ngn ??
    0;

  const baseShare = Math.floor(fallbackTotal / input.workPackages.length);
  const remainder = fallbackTotal - baseShare * input.workPackages.length;

  const workPackageRecords: WorkPackageRecord[] = input.workPackages.map((wp, index) => {
    const quantity = wp.quantity ?? 1;
    const costNgn = anyPackageHasCost
      ? Math.round(wp.estimatedCostNgn ?? 0)
      : baseShare + (index === 0 ? remainder : 0);

    let stockSpecRecord: WorkPackageStockSpec | null = null;
    let stockRec: StockRecommendation | null = null;

    if (wp.stockSpec) {
      const standardMatch = isStandardStockSize(
        wp.stockSpec.specifiedDimensionMm,
        wp.stockSpec.stockType,
      );
      stockSpecRecord = {
        stockType: wp.stockSpec.stockType,
        originalDimensionMm: wp.stockSpec.specifiedDimensionMm,
        specifiedDimensionMm: wp.stockSpec.specifiedDimensionMm,
        lengthMm: wp.stockSpec.lengthMm,
        materialGrade: wp.stockSpec.materialGrade ?? wp.materialGrade,
        isStandardStock: standardMatch,
      };
      stockRec = recommendStandardStock({
        stockType: wp.stockSpec.stockType,
        specifiedDimensionMm: wp.stockSpec.specifiedDimensionMm,
        quantity,
      });
    }

    return {
      id: randomUUID(),
      code: wp.code?.trim() || generateWorkPackageCode(index),
      name: wp.name.trim(),
      category: wp.category,
      processType: wp.processType?.trim() || defaultProcessForCategory(wp.category),
      materialGrade: wp.materialGrade?.trim() ?? null,
      quantity,
      baselineEstimatedCostNgn: costNgn,
      estimatedCostNgn: costNgn,
      partNames: Array.isArray(wp.partNames) ? wp.partNames : [],
      bodyIndices: Array.isArray(wp.bodyIndices) ? wp.bodyIndices : [],
      stockSpec: stockSpecRecord,
      stockRecommendation: stockRec,
      notes: wp.notes?.trim() ?? null,
    };
  });

  const baselineEstimatedQuoteNgn = workPackageRecords.reduce(
    (sum, wp) => sum + wp.baselineEstimatedCostNgn,
    0,
  );
  const recommendedSavingsNgn = workPackageRecords.reduce(
    (sum, wp) => sum + (wp.stockRecommendation?.savingsBreakdown.totalSavingsNgn ?? 0),
    0,
  );

  const nowIso = new Date().toISOString();
  const reviewedBy = input.reviewedBy?.trim() || 'applications-engineer';

  const workbenchMeta: AeWorkbenchMetadata = {
    status: 'bom_split',
    baseline_estimated_quote_ngn: baselineEstimatedQuoteNgn,
    current_estimated_quote_ngn: baselineEstimatedQuoteNgn,
    total_savings_ngn: 0,
    work_packages: workPackageRecords,
    parameter_changes: [],
    reviewed_by: reviewedBy,
    split_at: nowIso,
    updated_at: nowIso,
  };

  const updatedMetadata: Record<string, unknown> = {
    ...existingMeta,
    ae_workbench: workbenchMeta,
    baseline_estimated_quote_ngn: baselineEstimatedQuoteNgn,
    estimated_quote_ngn: baselineEstimatedQuoteNgn,
  };

  await db
    .update(jobs)
    .set({
      metadata: updatedMetadata,
      updated_at: new Date(),
    })
    .where(eq(jobs.id, jobRow.id as any));

  await recordActivity({
    project_id: jobRow.project_id,
    job_id: jobRow.id,
    orgId: jobRow.org_id,
    eventType: 'bom_split',
    title: 'Assembly BOM Split into Work Packages',
    description: `Split into ${workPackageRecords.length} work packages (${workPackageRecords.map((w) => w.name).join(', ')}); baseline estimate ₦${baselineEstimatedQuoteNgn.toLocaleString()}`,
    severity: 'info',
    actor: reviewedBy,
    metadata: {
      workPackageCount: workPackageRecords.length,
      baselineEstimatedQuoteNgn,
      recommendedSavingsNgn,
    },
  });

  return {
    jobId: jobRow.id,
    status: 'bom_split',
    baselineEstimatedQuoteNgn,
    currentEstimatedQuoteNgn: baselineEstimatedQuoteNgn,
    workPackages: workPackageRecords,
    recommendedSavingsNgn,
    updatedAt: nowIso,
  };
}

/**
 * Applies a stock dimension normalization change to a specific Work Package on a job
 * and deterministically recalculates the estimated customer quote.
 */
export async function applyStockNormalization(
  input: ApplyStockNormalizationInput,
): Promise<ApplyStockNormalizationResult> {
  if (!input.workPackageId || input.workPackageId.trim().length === 0) {
    throw new AppError(400, 'workPackageId is required');
  }
  if (!Number.isFinite(input.targetDimensionMm) || input.targetDimensionMm <= 0) {
    throw new AppError(400, 'targetDimensionMm must be a positive number');
  }

  const jobRow = await fetchJobOrThrow(input.jobId);
  const existingMeta = (jobRow.metadata || {}) as Record<string, unknown>;
  const workbench = existingMeta.ae_workbench as AeWorkbenchMetadata | undefined;

  if (!workbench || !Array.isArray(workbench.work_packages) || workbench.work_packages.length === 0) {
    throw new AppError(
      400,
      'Job BOM has not been split into work packages yet. Split BOM before applying stock normalization.',
    );
  }

  const pkgIndex = workbench.work_packages.findIndex(
    (wp) => wp.id === input.workPackageId || wp.code === input.workPackageId,
  );
  if (pkgIndex === -1) {
    throw new AppError(404, `Work package ${input.workPackageId} not found on job ${jobRow.id}`);
  }

  const targetPkg = workbench.work_packages[pkgIndex];
  if (!targetPkg.stockSpec) {
    throw new AppError(
      400,
      `Work package "${targetPkg.name}" does not have a stockSpec dimension to normalize`,
    );
  }

  const stockType = input.stockType ?? targetPkg.stockSpec.stockType;
  if (!isValidStockType(stockType)) {
    throw new AppError(400, `Unsupported stockType: ${String(stockType)}`);
  }

  const previousDimensionMm = targetPkg.stockSpec.specifiedDimensionMm;
  const previousEstimatedQuoteNgn = workbench.current_estimated_quote_ngn;

  const impact = calculateStockNormalizationImpact({
    stockType,
    currentDimensionMm: previousDimensionMm,
    targetDimensionMm: input.targetDimensionMm,
    quantity: targetPkg.quantity,
  });

  // No-op case: current dimension is already standard stock and target matches (or no change needed)
  const isNoOpChange =
    impact.isCurrentStandard &&
    Math.abs(input.targetDimensionMm - previousDimensionMm) <= DIMENSION_EPSILON_MM;

  if (isNoOpChange) {
    return {
      jobId: jobRow.id,
      workPackageId: targetPkg.id,
      workPackageCode: targetPkg.code,
      workPackageName: targetPkg.name,
      changed: false,
      previousDimensionMm,
      normalizedDimensionMm: previousDimensionMm,
      targetIsStandardStock: true,
      oversizedRawStockAvoidedMm: 0,
      materialWasteReductionPct: 0,
      savingsBreakdown: {
        turningSetupAndPassEliminationNgn: 0,
        oversizedStockPremiumNgn: 0,
        unitSavingsNgn: 0,
        totalSavingsNgn: 0,
      },
      previousEstimatedQuoteNgn,
      updatedEstimatedQuoteNgn: previousEstimatedQuoteNgn,
      totalJobSavingsNgn: workbench.total_savings_ngn,
      workPackages: workbench.work_packages,
      message: `Dimension ${previousDimensionMm.toFixed(1)} mm is already standard ${stockType} stock; no change applied.`,
    };
  }

  // Guard against negative package cost
  const effectiveTotalSavingsNgn = Math.min(impact.totalSavingsNgn, targetPkg.estimatedCostNgn);
  const updatedPackageCostNgn = targetPkg.estimatedCostNgn - effectiveTotalSavingsNgn;

  const updatedStockSpec: WorkPackageStockSpec = {
    ...targetPkg.stockSpec,
    stockType,
    specifiedDimensionMm: input.targetDimensionMm,
    isStandardStock: impact.isTargetStandard,
  };

  const updatedStockRec = recommendStandardStock({
    stockType,
    specifiedDimensionMm: input.targetDimensionMm,
    quantity: targetPkg.quantity,
  });

  const updatedPkg: WorkPackageRecord = {
    ...targetPkg,
    estimatedCostNgn: updatedPackageCostNgn,
    stockSpec: updatedStockSpec,
    stockRecommendation: updatedStockRec,
  };

  const updatedPackages = workbench.work_packages.map((wp, idx) =>
    idx === pkgIndex ? updatedPkg : wp,
  );

  const updatedEstimatedQuoteNgn = updatedPackages.reduce((sum, wp) => sum + wp.estimatedCostNgn, 0);
  const totalJobSavingsNgn = workbench.baseline_estimated_quote_ngn - updatedEstimatedQuoteNgn;
  const appliedBy = input.appliedBy?.trim() || 'applications-engineer';
  const nowIso = new Date().toISOString();

  const changeRecord: ParameterChangeRecord = {
    id: randomUUID(),
    workPackageId: targetPkg.id,
    workPackageCode: targetPkg.code,
    workPackageName: targetPkg.name,
    parameter: stockType === 'cold_drawn_round_bar' ? 'shaft_diameter_mm' : 'sheet_thickness_mm',
    stockType,
    previousDimensionMm,
    normalizedDimensionMm: input.targetDimensionMm,
    oversizedRawStockAvoidedMm: impact.isCurrentStandard ? 0 : impact.oversizedRawStockMm,
    savingsNgn: effectiveTotalSavingsNgn,
    previousJobQuoteNgn: previousEstimatedQuoteNgn,
    updatedJobQuoteNgn: updatedEstimatedQuoteNgn,
    engineeringNote: input.engineeringNote?.trim() ?? null,
    appliedBy,
    appliedAt: nowIso,
  };

  const updatedWorkbench: AeWorkbenchMetadata = {
    ...workbench,
    status: 'normalized',
    current_estimated_quote_ngn: updatedEstimatedQuoteNgn,
    total_savings_ngn: totalJobSavingsNgn,
    work_packages: updatedPackages,
    parameter_changes: [...workbench.parameter_changes, changeRecord],
    updated_at: nowIso,
  };

  const updatedMetadata: Record<string, unknown> = {
    ...existingMeta,
    ae_workbench: updatedWorkbench,
    estimated_quote_ngn: updatedEstimatedQuoteNgn,
  };

  await db
    .update(jobs)
    .set({
      metadata: updatedMetadata,
      updated_at: new Date(),
    })
    .where(eq(jobs.id, jobRow.id as any));

  await recordActivity({
    project_id: jobRow.project_id,
    job_id: jobRow.id,
    orgId: jobRow.org_id,
    eventType: 'stock_normalized',
    title: 'Stock Normalization Applied',
    description: `${targetPkg.name}: ${previousDimensionMm.toFixed(1)} mm -> ${input.targetDimensionMm.toFixed(1)} mm standard stock. Estimated quote updated from ₦${previousEstimatedQuoteNgn.toLocaleString()} to ₦${updatedEstimatedQuoteNgn.toLocaleString()}.`,
    severity: 'success',
    actor: appliedBy,
    metadata: {
      workPackageId: targetPkg.id,
      previousDimensionMm,
      normalizedDimensionMm: input.targetDimensionMm,
      savingsNgn: effectiveTotalSavingsNgn,
      previousEstimatedQuoteNgn,
      updatedEstimatedQuoteNgn,
    },
  });

  return {
    jobId: jobRow.id,
    workPackageId: targetPkg.id,
    workPackageCode: targetPkg.code,
    workPackageName: targetPkg.name,
    changed: true,
    previousDimensionMm,
    normalizedDimensionMm: input.targetDimensionMm,
    targetIsStandardStock: impact.isTargetStandard,
    oversizedRawStockAvoidedMm: impact.isCurrentStandard ? 0 : impact.oversizedRawStockMm,
    materialWasteReductionPct: impact.materialWasteReductionPct,
    savingsBreakdown: {
      turningSetupAndPassEliminationNgn: impact.turningSetupAndPassEliminationNgn,
      oversizedStockPremiumNgn: impact.oversizedStockPremiumNgn,
      unitSavingsNgn: impact.unitSavingsNgn,
      totalSavingsNgn: effectiveTotalSavingsNgn,
    },
    previousEstimatedQuoteNgn,
    updatedEstimatedQuoteNgn,
    totalJobSavingsNgn,
    workPackages: updatedPackages,
    message: `Normalized ${targetPkg.name} from ${previousDimensionMm.toFixed(1)} mm to ${input.targetDimensionMm.toFixed(1)} mm; estimated quote updated from ₦${previousEstimatedQuoteNgn.toLocaleString()} to ₦${updatedEstimatedQuoteNgn.toLocaleString()}.`,
  };
}

/**
 * Retrieves the current Applications Engineer triage workbench state for a job.
 */
export async function getAeWorkbenchState(jobId: string): Promise<AeWorkbenchStateResult> {
  const jobRow = await fetchJobOrThrow(jobId);
  const meta = (jobRow.metadata || {}) as Record<string, unknown>;

  return {
    jobId: jobRow.id,
    productName: jobRow.product_name,
    companyName: jobRow.company_name,
    triageQueue: typeof meta.triage_queue === 'string' ? meta.triage_queue : null,
    cadTelemetry: (meta.cad_telemetry as Record<string, unknown>) ?? null,
    targetCeilingNgn: jobRow.target_ceiling_ngn ?? null,
    workbench: (meta.ae_workbench as AeWorkbenchMetadata) ?? null,
  };
}
