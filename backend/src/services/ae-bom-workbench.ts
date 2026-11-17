/**
 * Applications Engineer BOM Splitting & Stock Normalization Service [KAN-32]
 *
 * Provides deterministic engineering workbench operations for triaged multi-body assemblies:
 * - Standard metric industrial stock catalog (round bar, square bar, hex bar, sheet, plate, round tube)
 * - First-principles mass, chip volume, machining time, and shop economics cost model
 * - Assembly BOM decomposition into discrete manufacturable Work Packages
 * - Parameter normalization with deterministic customer quote recalculation and audit trail
 */

import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { jobs } from '../db/schema';
import { AppError } from '../middleware/error';
import { recordActivity } from './activity-service';

// ============================================================================
// STANDARD STOCK CATALOG & MATERIAL / SHOP ECONOMICS REFERENCE TABLES
// ============================================================================

export type StockType =
  | 'cold_drawn_round_bar'
  | 'square_bar'
  | 'hex_bar'
  | 'sheet_metal'
  | 'plate'
  | 'round_tube';

export const ALL_STOCK_TYPES: readonly StockType[] = [
  'cold_drawn_round_bar',
  'square_bar',
  'hex_bar',
  'sheet_metal',
  'plate',
  'round_tube',
] as const;

export type WorkPackageCategory =
  | 'weldment'
  | 'turned_shaft'
  | 'cnc_machined'
  | 'sheet_metal'
  | 'cast_part'
  | 'assembly'
  | 'other';

export type CanonicalMaterialKey =
  | 'mild_steel'
  | 'en8_carbon_steel'
  | 'alloy_steel_4140'
  | 'stainless_steel_304'
  | 'stainless_steel_316l'
  | 'aluminum_6061_t6'
  | 'brass_c36000';

export interface MaterialMachiningSpec {
  key: CanonicalMaterialKey;
  displayName: string;
  /** Physical density in kg/m^3. */
  densityKgPerM3: number;
  /** Default local raw stock cost in NGN/kg. */
  defaultMaterialCostNgnPerKg: number;
  /** Default lathe/mill material removal rate in cm^3/min. */
  defaultMrrCm3PerMin: number;
}

export interface ShopRateCard {
  /** Override raw stock material cost (NGN/kg). */
  materialCostNgnPerKg?: number;
  /** Machine + operator + power hourly rate (NGN/hr). */
  machineHourlyRateNgn?: number;
  /** Setup, alignment, and inspection time for full-length stock-reduction pass (min). */
  turningSetupMinutes?: number;
  /** Override volumetric material removal rate (cm^3/min). */
  materialRemovalRateCm3PerMin?: number;
}

export interface ResolvedShopRateCard {
  materialCostNgnPerKg: number;
  machineHourlyRateNgn: number;
  turningSetupMinutes: number;
  materialRemovalRateCm3PerMin: number;
}

/**
 * Standard metric stock sizes (mm) commonly stocked across Nigerian and ISO metalworking hubs.
 */
export const STANDARD_STOCK_SIZES_MM: Record<StockType, readonly number[]> = {
  cold_drawn_round_bar: [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60, 65, 75, 80, 90, 100],
  square_bar: [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60, 65, 75, 80, 90, 100],
  hex_bar: [8, 10, 12, 14, 17, 19, 22, 24, 27, 30, 32, 36, 41, 46, 50, 55, 60, 65],
  sheet_metal: [0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0],
  plate: [6, 8, 10, 12, 15, 16, 20, 25, 30, 35, 40, 45, 50, 60, 75, 80, 100],
  round_tube: [12, 16, 20, 25, 30, 32, 35, 38, 40, 45, 50, 60, 65, 75, 80, 90, 100],
};

/**
 * Canonical engineering material density, local stock cost, and machining removal rate table.
 */
export const MATERIAL_REFERENCE_TABLE: Record<CanonicalMaterialKey, MaterialMachiningSpec> = {
  mild_steel: {
    key: 'mild_steel',
    displayName: 'Mild Steel (EN1A / AISI 1018 / S235)',
    densityKgPerM3: 7850,
    defaultMaterialCostNgnPerKg: 2400,
    defaultMrrCm3PerMin: 28,
  },
  en8_carbon_steel: {
    key: 'en8_carbon_steel',
    displayName: 'Medium Carbon Steel (EN8 / AISI 1045)',
    densityKgPerM3: 7850,
    defaultMaterialCostNgnPerKg: 2800,
    defaultMrrCm3PerMin: 24,
  },
  alloy_steel_4140: {
    key: 'alloy_steel_4140',
    displayName: '4140 Alloy Steel (Chromoly)',
    densityKgPerM3: 7850,
    defaultMaterialCostNgnPerKg: 4200,
    defaultMrrCm3PerMin: 18,
  },
  stainless_steel_304: {
    key: 'stainless_steel_304',
    displayName: '304 Stainless Steel',
    densityKgPerM3: 8000,
    defaultMaterialCostNgnPerKg: 7500,
    defaultMrrCm3PerMin: 12,
  },
  stainless_steel_316l: {
    key: 'stainless_steel_316l',
    displayName: '316L Stainless Steel',
    densityKgPerM3: 8000,
    defaultMaterialCostNgnPerKg: 9200,
    defaultMrrCm3PerMin: 10,
  },
  aluminum_6061_t6: {
    key: 'aluminum_6061_t6',
    displayName: '6061-T6 Aluminum',
    densityKgPerM3: 2700,
    defaultMaterialCostNgnPerKg: 6500,
    defaultMrrCm3PerMin: 65,
  },
  brass_c36000: {
    key: 'brass_c36000',
    displayName: 'C36000 Free-Machining Brass',
    densityKgPerM3: 8500,
    defaultMaterialCostNgnPerKg: 11500,
    defaultMrrCm3PerMin: 55,
  },
};

export const DEFAULT_SHOP_RATE_CARD = {
  machineHourlyRateNgn: 24000,
  turningSetupMinutes: 30,
} as const;

export const DEFAULT_STOCK_LENGTH_MM = 500;
export const DEFAULT_FLAT_STOCK_WIDTH_MM = 300;
export const DEFAULT_TUBE_WALL_THICKNESS_MM = 2.0;
export const DEFAULT_MATERIAL_GRADE: CanonicalMaterialKey = 'mild_steel';

const DIMENSION_EPSILON_MM = 0.001;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// TYPES
// ============================================================================

export interface StockSpecInput {
  stockType: StockType;
  specifiedDimensionMm: number;
  lengthMm?: number;
  widthMm?: number;
  wallThicknessMm?: number;
  materialGrade?: string;
  rateCard?: ShopRateCard;
}

export interface StockNormalizationSavingsBreakdown {
  deltaMassKg: number;
  chipVolumeCm3: number;
  machiningMinutesSaved: number;
  materialSavingsNgn: number;
  machiningSavingsNgn: number;
  unitSavingsNgn: number;
  totalSavingsNgn: number;
}

export interface StockNormalizationImpact {
  isCurrentStandard: boolean;
  isTargetStandard: boolean;
  oversizedRawStockMm: number;
  oversizedStockStepAvoidedMm: number;
  turningChipWastePct: number;
  materialWasteReductionPct: number;
  materialGrade: CanonicalMaterialKey;
  densityKgPerM3: number;
  lengthMm: number;
  widthMm?: number;
  wallThicknessMm?: number;
  appliedRateCard: ResolvedShopRateCard;
  deltaMassKg: number;
  chipVolumeCm3: number;
  machiningMinutesSaved: number;
  materialSavingsNgn: number;
  machiningSavingsNgn: number;
  unitSavingsNgn: number;
  totalSavingsNgn: number;
}

export interface StockRecommendation {
  stockType: StockType;
  specifiedDimensionMm: number;
  lengthMm: number;
  widthMm?: number;
  wallThicknessMm?: number;
  materialGrade: CanonicalMaterialKey;
  densityKgPerM3: number;
  appliedRateCard: ResolvedShopRateCard;
  isAlreadyStandard: boolean;
  oversizedRawStockMm: number;
  recommendedDimensionMm: number;
  dimensionDeltaMm: number;
  dimensionDeltaPct: number;
  oversizedStockStepAvoidedMm: number;
  turningChipWastePct: number;
  materialWasteReductionPct: number;
  deltaMassKg: number;
  chipVolumeCm3: number;
  machiningMinutesSaved: number;
  savingsBreakdown: StockNormalizationSavingsBreakdown;
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
  lengthMm: number;
  widthMm?: number;
  wallThicknessMm?: number;
  materialGrade: CanonicalMaterialKey;
  rateCard?: ShopRateCard;
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
  deltaMassKg: number;
  chipVolumeCm3: number;
  machiningMinutesSaved: number;
  materialSavingsNgn: number;
  machiningSavingsNgn: number;
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
  rate_card?: ShopRateCard;
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
  rateCard?: ShopRateCard;
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
  lengthMm?: number;
  widthMm?: number;
  wallThicknessMm?: number;
  materialGrade?: string;
  rateCard?: ShopRateCard;
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
  deltaMassKg: number;
  chipVolumeCm3: number;
  machiningMinutesSaved: number;
  savingsBreakdown: StockNormalizationSavingsBreakdown;
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
// PURE PHYSICS, GEOMETRY & STOCK CATALOG CALCULATIONS
// ============================================================================

export function isValidStockType(value: unknown): value is StockType {
  return typeof value === 'string' && (ALL_STOCK_TYPES as readonly string[]).includes(value);
}

export function getStandardStockCatalog(): Record<StockType, readonly number[]> {
  return {
    cold_drawn_round_bar: [...STANDARD_STOCK_SIZES_MM.cold_drawn_round_bar],
    square_bar: [...STANDARD_STOCK_SIZES_MM.square_bar],
    hex_bar: [...STANDARD_STOCK_SIZES_MM.hex_bar],
    sheet_metal: [...STANDARD_STOCK_SIZES_MM.sheet_metal],
    plate: [...STANDARD_STOCK_SIZES_MM.plate],
    round_tube: [...STANDARD_STOCK_SIZES_MM.round_tube],
  };
}

export function getMaterialReferenceTable(): Record<CanonicalMaterialKey, MaterialMachiningSpec> {
  return {
    mild_steel: { ...MATERIAL_REFERENCE_TABLE.mild_steel },
    en8_carbon_steel: { ...MATERIAL_REFERENCE_TABLE.en8_carbon_steel },
    alloy_steel_4140: { ...MATERIAL_REFERENCE_TABLE.alloy_steel_4140 },
    stainless_steel_304: { ...MATERIAL_REFERENCE_TABLE.stainless_steel_304 },
    stainless_steel_316l: { ...MATERIAL_REFERENCE_TABLE.stainless_steel_316l },
    aluminum_6061_t6: { ...MATERIAL_REFERENCE_TABLE.aluminum_6061_t6 },
    brass_c36000: { ...MATERIAL_REFERENCE_TABLE.brass_c36000 },
  };
}

export function isStandardStockSize(dimensionMm: number, stockType: StockType): boolean {
  const catalog = STANDARD_STOCK_SIZES_MM[stockType];
  return catalog.some((size) => Math.abs(size - dimensionMm) <= DIMENSION_EPSILON_MM);
}

/**
 * Resolves a free-form material grade label to a canonical physical material specification.
 */
export function resolveMaterialSpec(materialGrade?: string): MaterialMachiningSpec {
  if (!materialGrade || materialGrade.trim().length === 0) {
    return MATERIAL_REFERENCE_TABLE[DEFAULT_MATERIAL_GRADE];
  }

  const normalized = materialGrade
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalized in MATERIAL_REFERENCE_TABLE) {
    return MATERIAL_REFERENCE_TABLE[normalized as CanonicalMaterialKey];
  }

  if (normalized.includes('316')) {
    return MATERIAL_REFERENCE_TABLE.stainless_steel_316l;
  }
  if (normalized.includes('304') || normalized.includes('stainless')) {
    return MATERIAL_REFERENCE_TABLE.stainless_steel_304;
  }
  if (normalized.includes('4140') || normalized.includes('chromoly') || normalized.includes('en19')) {
    return MATERIAL_REFERENCE_TABLE.alloy_steel_4140;
  }
  if (normalized.includes('6061') || normalized.includes('alumin')) {
    return MATERIAL_REFERENCE_TABLE.aluminum_6061_t6;
  }
  if (normalized.includes('brass') || normalized.includes('c360')) {
    return MATERIAL_REFERENCE_TABLE.brass_c36000;
  }
  if (normalized.includes('en8') || normalized.includes('1045') || normalized.includes('c45')) {
    return MATERIAL_REFERENCE_TABLE.en8_carbon_steel;
  }
  if (
    normalized.includes('en1a') ||
    normalized.includes('1018') ||
    normalized.includes('s235') ||
    normalized.includes('s275') ||
    normalized.includes('a36') ||
    normalized.includes('mild')
  ) {
    return MATERIAL_REFERENCE_TABLE.mild_steel;
  }

  return MATERIAL_REFERENCE_TABLE[DEFAULT_MATERIAL_GRADE];
}

function validateRateCard(rateCard?: ShopRateCard): void {
  if (rateCard === undefined) return;
  if (typeof rateCard !== 'object' || rateCard === null || Array.isArray(rateCard)) {
    throw new AppError(400, 'rateCard must be an object');
  }
  if (
    rateCard.materialCostNgnPerKg !== undefined &&
    (!Number.isFinite(rateCard.materialCostNgnPerKg) || rateCard.materialCostNgnPerKg < 0)
  ) {
    throw new AppError(400, 'rateCard.materialCostNgnPerKg must be a non-negative number');
  }
  if (
    rateCard.machineHourlyRateNgn !== undefined &&
    (!Number.isFinite(rateCard.machineHourlyRateNgn) || rateCard.machineHourlyRateNgn < 0)
  ) {
    throw new AppError(400, 'rateCard.machineHourlyRateNgn must be a non-negative number');
  }
  if (
    rateCard.turningSetupMinutes !== undefined &&
    (!Number.isFinite(rateCard.turningSetupMinutes) || rateCard.turningSetupMinutes < 0)
  ) {
    throw new AppError(400, 'rateCard.turningSetupMinutes must be a non-negative number');
  }
  if (
    rateCard.materialRemovalRateCm3PerMin !== undefined &&
    (!Number.isFinite(rateCard.materialRemovalRateCm3PerMin) ||
      rateCard.materialRemovalRateCm3PerMin <= 0)
  ) {
    throw new AppError(400, 'rateCard.materialRemovalRateCm3PerMin must be a positive number');
  }
}

function resolveShopRateCard(
  materialSpec: MaterialMachiningSpec,
  rateCard?: ShopRateCard,
): ResolvedShopRateCard {
  validateRateCard(rateCard);
  return {
    materialCostNgnPerKg: rateCard?.materialCostNgnPerKg ?? materialSpec.defaultMaterialCostNgnPerKg,
    machineHourlyRateNgn: rateCard?.machineHourlyRateNgn ?? DEFAULT_SHOP_RATE_CARD.machineHourlyRateNgn,
    turningSetupMinutes: rateCard?.turningSetupMinutes ?? DEFAULT_SHOP_RATE_CARD.turningSetupMinutes,
    materialRemovalRateCm3PerMin:
      rateCard?.materialRemovalRateCm3PerMin ?? materialSpec.defaultMrrCm3PerMin,
  };
}

function mergeRateCards(base?: ShopRateCard, override?: ShopRateCard): ShopRateCard | undefined {
  if (!base && !override) return undefined;
  return { ...base, ...override };
}

/**
 * Computes exact cross-sectional area (mm^2) for each supported industrial stock profile.
 */
export function computeCrossSectionAreaMm2(params: {
  stockType: StockType;
  dimensionMm: number;
  widthMm?: number;
  wallThicknessMm?: number;
}): number {
  const { stockType, dimensionMm } = params;
  switch (stockType) {
    case 'cold_drawn_round_bar':
      return (Math.PI / 4) * dimensionMm ** 2;
    case 'square_bar':
      return dimensionMm ** 2;
    case 'hex_bar':
      return (Math.sqrt(3) / 2) * dimensionMm ** 2;
    case 'sheet_metal':
    case 'plate': {
      const widthMm = params.widthMm ?? DEFAULT_FLAT_STOCK_WIDTH_MM;
      return dimensionMm * widthMm;
    }
    case 'round_tube': {
      const wallThicknessMm = params.wallThicknessMm ?? DEFAULT_TUBE_WALL_THICKNESS_MM;
      const innerDiameterMm = Math.max(0, dimensionMm - 2 * wallThicknessMm);
      return (Math.PI / 4) * (dimensionMm ** 2 - innerDiameterMm ** 2);
    }
  }
}

/**
 * Returns the smallest standard stock size >= specified dimension
 * (the oversized raw bar/sheet/plate/tube a shop must procure and machine down).
 */
function findOversizedRawStockMm(dimensionMm: number, stockType: StockType): number {
  const catalog = STANDARD_STOCK_SIZES_MM[stockType];
  const exact = catalog.find((size) => Math.abs(size - dimensionMm) <= DIMENSION_EPSILON_MM);
  if (exact !== undefined) return exact;

  const nextLarger = catalog.find((size) => size > dimensionMm);
  if (nextLarger !== undefined) return nextLarger;

  // Above catalog max: step up to next 5 mm standard mill increment
  return Math.ceil(dimensionMm / 5) * 5;
}

/**
 * Returns the nearest standard stock size <= specified dimension (or catalog minimum).
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

function roundTo5(value: number): number {
  return Math.round(value * 100000) / 100000;
}

function isFlatStock(stockType: StockType): boolean {
  return stockType === 'sheet_metal' || stockType === 'plate';
}

function stockDisplayLabel(stockType: StockType): string {
  switch (stockType) {
    case 'cold_drawn_round_bar':
      return 'cold-drawn round bar';
    case 'square_bar':
      return 'standard square bar';
    case 'hex_bar':
      return 'standard hex bar';
    case 'sheet_metal':
      return 'standard gauge sheet metal';
    case 'plate':
      return 'standard thickness plate';
    case 'round_tube':
      return 'standard round tube';
  }
}

function parameterNameForStockType(stockType: StockType): string {
  switch (stockType) {
    case 'cold_drawn_round_bar':
      return 'shaft_diameter_mm';
    case 'square_bar':
      return 'bar_width_mm';
    case 'hex_bar':
      return 'hex_across_flats_mm';
    case 'sheet_metal':
      return 'sheet_thickness_mm';
    case 'plate':
      return 'plate_thickness_mm';
    case 'round_tube':
      return 'tube_outer_diameter_mm';
  }
}

/**
 * Computes physical mass delta, chip volume, eliminated machining time, and shop cost savings
 * for moving from `currentDimensionMm` to `targetDimensionMm`.
 */
export function calculateStockNormalizationImpact(params: {
  stockType: StockType;
  currentDimensionMm: number;
  targetDimensionMm: number;
  lengthMm?: number;
  widthMm?: number;
  wallThicknessMm?: number;
  materialGrade?: string;
  quantity?: number;
  rateCard?: ShopRateCard;
}): StockNormalizationImpact {
  const { stockType, currentDimensionMm, targetDimensionMm } = params;
  const quantity = params.quantity ?? 1;
  const lengthMm = params.lengthMm ?? DEFAULT_STOCK_LENGTH_MM;
  const widthMm = isFlatStock(stockType)
    ? (params.widthMm ?? DEFAULT_FLAT_STOCK_WIDTH_MM)
    : undefined;
  const wallThicknessMm =
    stockType === 'round_tube'
      ? (params.wallThicknessMm ?? DEFAULT_TUBE_WALL_THICKNESS_MM)
      : undefined;

  if (!isValidStockType(stockType)) {
    throw new AppError(400, `Unsupported stockType: ${String(stockType)}`);
  }
  if (!Number.isFinite(currentDimensionMm) || currentDimensionMm <= 0) {
    throw new AppError(400, 'currentDimensionMm must be a positive number');
  }
  if (!Number.isFinite(targetDimensionMm) || targetDimensionMm <= 0) {
    throw new AppError(400, 'targetDimensionMm must be a positive number');
  }
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) {
    throw new AppError(400, 'lengthMm must be a positive number');
  }
  if (widthMm !== undefined && (!Number.isFinite(widthMm) || widthMm <= 0)) {
    throw new AppError(400, 'widthMm must be a positive number');
  }
  if (
    wallThicknessMm !== undefined &&
    (!Number.isFinite(wallThicknessMm) || wallThicknessMm <= 0)
  ) {
    throw new AppError(400, 'wallThicknessMm must be a positive number');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'quantity must be a positive integer');
  }

  const materialSpec = resolveMaterialSpec(params.materialGrade);
  const appliedRateCard = resolveShopRateCard(materialSpec, params.rateCard);

  const isCurrentStandard = isStandardStockSize(currentDimensionMm, stockType);
  const isTargetStandard = isStandardStockSize(targetDimensionMm, stockType);
  const oversizedRawStockMm = findOversizedRawStockMm(currentDimensionMm, stockType);

  const zeroResult = (turningChipWastePct: number): StockNormalizationImpact => ({
    isCurrentStandard,
    isTargetStandard,
    oversizedRawStockMm: isCurrentStandard ? currentDimensionMm : oversizedRawStockMm,
    oversizedStockStepAvoidedMm: 0,
    turningChipWastePct,
    materialWasteReductionPct: 0,
    materialGrade: materialSpec.key,
    densityKgPerM3: materialSpec.densityKgPerM3,
    lengthMm,
    widthMm,
    wallThicknessMm,
    appliedRateCard,
    deltaMassKg: 0,
    chipVolumeCm3: 0,
    machiningMinutesSaved: 0,
    materialSavingsNgn: 0,
    machiningSavingsNgn: 0,
    unitSavingsNgn: 0,
    totalSavingsNgn: 0,
  });

  if (isCurrentStandard) {
    return zeroResult(0);
  }

  const areaOversizedMm2 = computeCrossSectionAreaMm2({
    stockType,
    dimensionMm: oversizedRawStockMm,
    widthMm,
    wallThicknessMm,
  });
  const areaCurrentMm2 = computeCrossSectionAreaMm2({
    stockType,
    dimensionMm: currentDimensionMm,
    widthMm,
    wallThicknessMm,
  });
  const areaTargetMm2 = computeCrossSectionAreaMm2({
    stockType,
    dimensionMm: targetDimensionMm,
    widthMm,
    wallThicknessMm,
  });

  const turningChipWastePct =
    areaOversizedMm2 > 0
      ? roundTo2(Math.max(0, ((areaOversizedMm2 - areaCurrentMm2) / areaOversizedMm2) * 100))
      : 0;

  // Savings only accrue when normalizing to a standard stock size strictly smaller than oversized raw stock
  if (!isTargetStandard || targetDimensionMm >= oversizedRawStockMm - DIMENSION_EPSILON_MM) {
    return zeroResult(turningChipWastePct);
  }

  const oversizedStockStepAvoidedMm = roundTo2(Math.max(0, oversizedRawStockMm - targetDimensionMm));
  const materialWasteReductionPct =
    areaOversizedMm2 > 0 && areaTargetMm2 <= areaOversizedMm2
      ? roundTo2(((areaOversizedMm2 - areaTargetMm2) / areaOversizedMm2) * 100)
      : 0;

  // 1. Raw material volume & mass saved: dV = (A_oversized - A_target) * L
  const deltaVolumeMm3 = Math.max(0, (areaOversizedMm2 - areaTargetMm2) * lengthMm);
  const deltaVolumeM3 = deltaVolumeMm3 / 1e9;
  const rawDeltaMassKg = materialSpec.densityKgPerM3 * deltaVolumeM3;
  const materialSavingsNgn = Math.round(rawDeltaMassKg * appliedRateCard.materialCostNgnPerKg);

  // 2. Full-length stock-reduction machining eliminated: V_chips = (A_oversized - A_current) * L
  const chipVolumeMm3 = Math.max(0, (areaOversizedMm2 - areaCurrentMm2) * lengthMm);
  const rawChipVolumeCm3 = chipVolumeMm3 / 1e3;
  const rawMachiningMinutesSaved =
    appliedRateCard.turningSetupMinutes +
    rawChipVolumeCm3 / appliedRateCard.materialRemovalRateCm3PerMin;
  const machiningSavingsNgn = Math.round(
    (rawMachiningMinutesSaved / 60) * appliedRateCard.machineHourlyRateNgn,
  );

  const unitSavingsNgn = materialSavingsNgn + machiningSavingsNgn;
  const totalSavingsNgn = unitSavingsNgn * quantity;

  return {
    isCurrentStandard: false,
    isTargetStandard: true,
    oversizedRawStockMm,
    oversizedStockStepAvoidedMm,
    turningChipWastePct,
    materialWasteReductionPct,
    materialGrade: materialSpec.key,
    densityKgPerM3: materialSpec.densityKgPerM3,
    lengthMm,
    widthMm,
    wallThicknessMm,
    appliedRateCard,
    deltaMassKg: roundTo5(rawDeltaMassKg),
    chipVolumeCm3: roundTo2(rawChipVolumeCm3),
    machiningMinutesSaved: roundTo2(rawMachiningMinutesSaved),
    materialSavingsNgn,
    machiningSavingsNgn,
    unitSavingsNgn,
    totalSavingsNgn,
  };
}

/**
 * Recommends the nearest standard stock size <= specifiedDimensionMm (or catalog minimum)
 * and quantifies mass, chip volume, machining time, and shop cost savings.
 */
export function recommendStandardStock(params: {
  stockType: StockType;
  specifiedDimensionMm: number;
  lengthMm?: number;
  widthMm?: number;
  wallThicknessMm?: number;
  materialGrade?: string;
  quantity?: number;
  rateCard?: ShopRateCard;
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
    lengthMm: params.lengthMm,
    widthMm: params.widthMm,
    wallThicknessMm: params.wallThicknessMm,
    materialGrade: params.materialGrade,
    quantity,
    rateCard: params.rateCard,
  });

  const dimensionDeltaMm = roundTo2(recommendedDimensionMm - specifiedDimensionMm);
  const dimensionDeltaPct = roundTo2((dimensionDeltaMm / specifiedDimensionMm) * 100);
  const stockLabel = stockDisplayLabel(stockType);

  let rationale: string;
  if (impact.isCurrentStandard) {
    rationale = `Specified dimension ${specifiedDimensionMm.toFixed(1)} mm matches standard ${stockLabel} stock; no normalization required.`;
  } else if (impact.totalSavingsNgn === 0) {
    rationale = `Specified ${specifiedDimensionMm.toFixed(1)} mm falls below minimum catalog ${stockLabel} size (${recommendedDimensionMm.toFixed(1)} mm); no stock-reduction savings apply.`;
  } else {
    rationale = `Specified ${specifiedDimensionMm.toFixed(1)} mm requires oversized ${impact.oversizedRawStockMm.toFixed(1)} mm raw stock (${impact.turningChipWastePct}% chip waste). Normalizing to ${recommendedDimensionMm.toFixed(1)} mm ${stockLabel} saves ${impact.deltaMassKg} kg raw stock and ${impact.machiningMinutesSaved} min machining (${impact.chipVolumeCm3} cm^3 chips avoided), saving ₦${impact.totalSavingsNgn.toLocaleString()}.`;
  }

  return {
    stockType,
    specifiedDimensionMm,
    lengthMm: impact.lengthMm,
    widthMm: impact.widthMm,
    wallThicknessMm: impact.wallThicknessMm,
    materialGrade: impact.materialGrade,
    densityKgPerM3: impact.densityKgPerM3,
    appliedRateCard: impact.appliedRateCard,
    isAlreadyStandard: impact.isCurrentStandard,
    oversizedRawStockMm: impact.oversizedRawStockMm,
    recommendedDimensionMm,
    dimensionDeltaMm,
    dimensionDeltaPct,
    oversizedStockStepAvoidedMm: impact.oversizedStockStepAvoidedMm,
    turningChipWastePct: impact.turningChipWastePct,
    materialWasteReductionPct: impact.materialWasteReductionPct,
    deltaMassKg: impact.deltaMassKg,
    chipVolumeCm3: impact.chipVolumeCm3,
    machiningMinutesSaved: impact.machiningMinutesSaved,
    savingsBreakdown: {
      deltaMassKg: impact.deltaMassKg,
      chipVolumeCm3: impact.chipVolumeCm3,
      machiningMinutesSaved: impact.machiningMinutesSaved,
      materialSavingsNgn: impact.materialSavingsNgn,
      machiningSavingsNgn: impact.machiningSavingsNgn,
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
 * and evaluates physics-based standard stock recommendations for each package.
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

  validateRateCard(input.rateCard);

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
      if (
        wp.stockSpec.lengthMm !== undefined &&
        (!Number.isFinite(wp.stockSpec.lengthMm) || wp.stockSpec.lengthMm <= 0)
      ) {
        throw new AppError(
          400,
          `Work package "${wp.name}" stockSpec.lengthMm must be a positive number`,
        );
      }
      if (
        wp.stockSpec.widthMm !== undefined &&
        (!Number.isFinite(wp.stockSpec.widthMm) || wp.stockSpec.widthMm <= 0)
      ) {
        throw new AppError(
          400,
          `Work package "${wp.name}" stockSpec.widthMm must be a positive number`,
        );
      }
      if (
        wp.stockSpec.wallThicknessMm !== undefined &&
        (!Number.isFinite(wp.stockSpec.wallThicknessMm) || wp.stockSpec.wallThicknessMm <= 0)
      ) {
        throw new AppError(
          400,
          `Work package "${wp.name}" stockSpec.wallThicknessMm must be a positive number`,
        );
      }
      validateRateCard(wp.stockSpec.rateCard);
    }
  }

  const jobRow = await fetchJobOrThrow(input.jobId);
  const existingMeta = (jobRow.metadata || {}) as Record<string, unknown>;

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
      const effectiveRateCard = mergeRateCards(input.rateCard, wp.stockSpec.rateCard);
      const effectiveMaterial = resolveMaterialSpec(wp.stockSpec.materialGrade ?? wp.materialGrade);
      const lengthMm = wp.stockSpec.lengthMm ?? DEFAULT_STOCK_LENGTH_MM;
      const widthMm = isFlatStock(wp.stockSpec.stockType)
        ? (wp.stockSpec.widthMm ?? DEFAULT_FLAT_STOCK_WIDTH_MM)
        : undefined;
      const wallThicknessMm =
        wp.stockSpec.stockType === 'round_tube'
          ? (wp.stockSpec.wallThicknessMm ?? DEFAULT_TUBE_WALL_THICKNESS_MM)
          : undefined;
      const standardMatch = isStandardStockSize(
        wp.stockSpec.specifiedDimensionMm,
        wp.stockSpec.stockType,
      );

      stockSpecRecord = {
        stockType: wp.stockSpec.stockType,
        originalDimensionMm: wp.stockSpec.specifiedDimensionMm,
        specifiedDimensionMm: wp.stockSpec.specifiedDimensionMm,
        lengthMm,
        widthMm,
        wallThicknessMm,
        materialGrade: effectiveMaterial.key,
        rateCard: effectiveRateCard,
        isStandardStock: standardMatch,
      };
      stockRec = recommendStandardStock({
        stockType: wp.stockSpec.stockType,
        specifiedDimensionMm: wp.stockSpec.specifiedDimensionMm,
        lengthMm,
        widthMm,
        wallThicknessMm,
        materialGrade: effectiveMaterial.key,
        quantity,
        rateCard: effectiveRateCard,
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
  const recommendedSavingsNgn = workPackageRecords.reduce((sum, wp) => {
    const rawSavings = wp.stockRecommendation?.savingsBreakdown.totalSavingsNgn ?? 0;
    return sum + Math.min(rawSavings, wp.baselineEstimatedCostNgn);
  }, 0);

  const nowIso = new Date().toISOString();
  const reviewedBy = input.reviewedBy?.trim() || 'applications-engineer';

  const workbenchMeta: AeWorkbenchMetadata = {
    status: 'bom_split',
    baseline_estimated_quote_ngn: baselineEstimatedQuoteNgn,
    current_estimated_quote_ngn: baselineEstimatedQuoteNgn,
    total_savings_ngn: 0,
    rate_card: input.rateCard,
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
 * and deterministically recalculates the estimated customer quote using physics & shop rates.
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
  validateRateCard(input.rateCard);

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

  const lengthMm = input.lengthMm ?? targetPkg.stockSpec.lengthMm ?? DEFAULT_STOCK_LENGTH_MM;
  const widthMm = isFlatStock(stockType)
    ? (input.widthMm ?? targetPkg.stockSpec.widthMm ?? DEFAULT_FLAT_STOCK_WIDTH_MM)
    : undefined;
  const wallThicknessMm =
    stockType === 'round_tube'
      ? (input.wallThicknessMm ??
          targetPkg.stockSpec.wallThicknessMm ??
          DEFAULT_TUBE_WALL_THICKNESS_MM)
      : undefined;
  const materialGrade =
    input.materialGrade ?? targetPkg.stockSpec.materialGrade ?? targetPkg.materialGrade ?? undefined;
  const effectiveRateCard = mergeRateCards(
    mergeRateCards(workbench.rate_card, targetPkg.stockSpec.rateCard),
    input.rateCard,
  );

  const impact = calculateStockNormalizationImpact({
    stockType,
    currentDimensionMm: previousDimensionMm,
    targetDimensionMm: input.targetDimensionMm,
    lengthMm,
    widthMm,
    wallThicknessMm,
    materialGrade,
    quantity: targetPkg.quantity,
    rateCard: effectiveRateCard,
  });

  // No-op case: current dimension is already standard stock and target matches
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
      deltaMassKg: 0,
      chipVolumeCm3: 0,
      machiningMinutesSaved: 0,
      savingsBreakdown: {
        deltaMassKg: 0,
        chipVolumeCm3: 0,
        machiningMinutesSaved: 0,
        materialSavingsNgn: 0,
        machiningSavingsNgn: 0,
        unitSavingsNgn: 0,
        totalSavingsNgn: 0,
      },
      previousEstimatedQuoteNgn,
      updatedEstimatedQuoteNgn: previousEstimatedQuoteNgn,
      totalJobSavingsNgn: workbench.total_savings_ngn,
      workPackages: workbench.work_packages,
      message: `Dimension ${previousDimensionMm.toFixed(1)} mm is already standard ${stockDisplayLabel(stockType)} stock; no change applied.`,
    };
  }

  // Clamp savings at current package cost so quote never goes negative
  const effectiveTotalSavingsNgn = Math.min(impact.totalSavingsNgn, targetPkg.estimatedCostNgn);
  const updatedPackageCostNgn = targetPkg.estimatedCostNgn - effectiveTotalSavingsNgn;

  const updatedStockSpec: WorkPackageStockSpec = {
    ...targetPkg.stockSpec,
    stockType,
    specifiedDimensionMm: input.targetDimensionMm,
    lengthMm: impact.lengthMm,
    widthMm: impact.widthMm,
    wallThicknessMm: impact.wallThicknessMm,
    materialGrade: impact.materialGrade,
    rateCard: effectiveRateCard,
    isStandardStock: impact.isTargetStandard,
  };

  const updatedStockRec = recommendStandardStock({
    stockType,
    specifiedDimensionMm: input.targetDimensionMm,
    lengthMm: impact.lengthMm,
    widthMm: impact.widthMm,
    wallThicknessMm: impact.wallThicknessMm,
    materialGrade: impact.materialGrade,
    quantity: targetPkg.quantity,
    rateCard: effectiveRateCard,
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
    parameter: parameterNameForStockType(stockType),
    stockType,
    previousDimensionMm,
    normalizedDimensionMm: input.targetDimensionMm,
    oversizedRawStockAvoidedMm: impact.isCurrentStandard ? 0 : impact.oversizedRawStockMm,
    deltaMassKg: impact.deltaMassKg,
    chipVolumeCm3: impact.chipVolumeCm3,
    machiningMinutesSaved: impact.machiningMinutesSaved,
    materialSavingsNgn: impact.materialSavingsNgn,
    machiningSavingsNgn: impact.machiningSavingsNgn,
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
      deltaMassKg: impact.deltaMassKg,
      chipVolumeCm3: impact.chipVolumeCm3,
      machiningMinutesSaved: impact.machiningMinutesSaved,
      materialSavingsNgn: impact.materialSavingsNgn,
      machiningSavingsNgn: impact.machiningSavingsNgn,
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
    deltaMassKg: impact.deltaMassKg,
    chipVolumeCm3: impact.chipVolumeCm3,
    machiningMinutesSaved: impact.machiningMinutesSaved,
    savingsBreakdown: {
      deltaMassKg: impact.deltaMassKg,
      chipVolumeCm3: impact.chipVolumeCm3,
      machiningMinutesSaved: impact.machiningMinutesSaved,
      materialSavingsNgn: impact.materialSavingsNgn,
      machiningSavingsNgn: impact.machiningSavingsNgn,
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
