/**
 * Metrology, Quality Inspection & Rectification Types
 * Standards: ISO 2859-1 (Sampling), ISO 1101 (GD&T Runout), DFN Workshop Integrity Gate
 * Subsystems: SUB-09 (Quality, Inspection & Metrology), SUB-10 (Emergency Breakdown & Hot-Shot Dispatch)
 */

// --- KAN-60: Double-Blind Sampling ---

export interface ShopReportedMeasurement {
  partIndex: number;
  dimensionName: string;
  nominalValue: number;
  toleranceUpper: number;
  toleranceLower: number;
  measuredValue: number;
  unit: string;
}

export interface DeliveryBatchManifest {
  batchId: string;
  jobId: string;
  shopId: string;
  totalQuantity: number;
  shopReportedMeasurements: ShopReportedMeasurement[];
  seed?: string | number;
  isPilot?: boolean;
}

export interface BlindSampleItem {
  partIndex: number;
  dimensionName: string;
  nominalValue: number;
  toleranceUpper: number;
  toleranceLower: number;
  unit: string;
}

export interface BlindInspectionManifest {
  batchId: string;
  jobId: string;
  samplePartIndices: number[];
  sampleItems: BlindSampleItem[];
  generatedAt: string;
  samplingStandard: 'ISO_2859_1_LEVEL_II' | 'STATUTORY_15_PERCENT';
}

export interface HubMeasurementSubmission {
  partIndex: number;
  dimensionName: string;
  hubMeasuredValue: number;
}

export interface MeasurementVarianceTelemetry {
  partIndex: number;
  dimensionName: string;
  nominalValue: number;
  specUpper: number;
  specLower: number;
  shopReportedValue: number;
  hubMeasuredValue: number;
  varianceDelta: number;
  isWithinSpec: boolean;
  varianceExceeded: boolean;
}

export type DoubleBlindVerificationStatus = 'PASSED' | 'VARIANCE_EXCEEDED' | 'REJECTED';

export interface DoubleBlindAuditReport {
  batchId: string;
  verificationStatus: DoubleBlindVerificationStatus;
  sampleSize: number;
  telemetry: MeasurementVarianceTelemetry[];
  authorizeEscrowDisbursement: boolean;
  trustScoreImpact: number;
  auditSealSha256: string;
  inspectedAt: string;
}

// --- KAN-39: First-Article Rejection & Batch Run Lockout ---

export type FirstArticleStatus =
  | 'FIRST_ARTICLE_PENDING'
  | 'FIRST_ARTICLE_ACCEPTED'
  | 'FIRST_ARTICLE_REJECTED'
  | 'UNLOCKED_SACRIFICIAL_PASSED';

export interface FirstArticleInput {
  batchId: string;
  operatorId: string;
  machineId: string;
  partId: string;
  dimensionName: string;
  measuredValue: number;
  nominalValue: number;
  toleranceUpper: number;
  toleranceLower: number;
  unit: string;
}

export interface ToolOffsetGuide {
  dimensionName: string;
  measuredValue: number;
  nominalValue: number;
  targetDimension: number;
  recommendedWearOffsetMm: number;
  guidanceText: string;
}

export interface FirstArticleEvaluation {
  batchId: string;
  partId: string;
  status: FirstArticleStatus;
  batchLocked: boolean;
  batchProgressDisabled: boolean;
  measuredValue: number;
  specMin: number;
  specMax: number;
  deviationMm: number;
  lockoutReason?: string;
  offsetGuide?: ToolOffsetGuide;
  auditSealSha256: string;
  evaluatedAt: string;
}

export interface SacrificialPieceSubmission {
  batchId: string;
  operatorId: string;
  measuredValue: number;
  nominalValue: number;
  toleranceUpper: number;
  toleranceLower: number;
}

// --- KAN-42: DTI Runout Audit ---

export type RunoutAuditStatus = 'PASSED' | 'FAILED' | 'REJECTED_CALIBRATION_EXPIRED';

export interface DtiRunoutAuditRequest {
  partId: string;
  partName: string;
  profile: string;
  gdtRunoutSpecMm: number;
  measuredTirMm: number;
  datums: string[];
  gaugeId: string;
  gaugeCalibrationDate: string;
  auditTimestamp: string;
  inspectorId: string;
  calibrationValidityDays?: number;
}

export interface RunoutAuditRecord {
  partId: string;
  status: RunoutAuditStatus;
  gdtRunoutSpecMm: number;
  measuredTirMm: number;
  maxTirDeviationMm: number;
  isWithinGdtLimit: boolean;
  gaugeId: string;
  gaugeCalibrationDate: string;
  isCalibrationCurrent: boolean;
  canProgressTraveler: boolean;
  auditSealSha256: string;
  auditedAt: string;
}

// --- KAN-43: Non-Conformance Report (NCR) ---

export type TravelerHoldStatus = 'ACTIVE' | 'HOLD_NCR' | 'RELEASED_REWORKED' | 'SCRAPPED';

export interface NcrInput {
  jobTravelerId: string;
  partId: string;
  partDescription: string;
  measuredDimension: number;
  nominalDimension: number;
  toleranceUpper: number;
  toleranceLower: number;
  unit: string;
  caliperPhotoUrl: string;
  inspectorId: string;
  customerId: string;
  supervisorId: string;
}

export interface ReworkPackageOption {
  optionCode: string;
  description: string;
  technicalDetails: string;
  costNgn: number;
  currency: 'NGN';
  leadTimeHours: number;
}

export interface StakeholderNotification {
  recipientId: string;
  role: 'SUPERVISOR' | 'CLIENT' | 'OPERATOR';
  subject: string;
  message: string;
  dispatchedAt: string;
}

export interface NCRDocument {
  ncrUuid: string;
  jobTravelerId: string;
  partId: string;
  status: TravelerHoldStatus;
  disposition: 'TECHNICAL_HOLD_PENDING_REWORK' | 'SCRAP' | 'USE_AS_IS';
  measuredDeviationMm: number;
  caliperPhotoUrl: string;
  reworkPackage: ReworkPackageOption;
  notifications: StakeholderNotification[];
  auditSealSha256: string;
  createdAt: string;
}

// --- KAN-53: Emergency On-Site Metrology Rectification ---

export type MissionStatus =
  | 'DISPATCHED_TO_SITE'
  | 'ON_SITE_SKIMMING_IN_PROGRESS'
  | 'RECTIFIED_VERIFIED'
  | 'REJECTED_UNRECOVERABLE';

export interface EmergencyFitmentRejectionInput {
  jobId: string;
  partDescription: string;
  measuredKeywayMm: number;
  nominalKeywayMm: number;
  toleranceUpperMm: number;
  toleranceLowerMm: number;
  gaugeBlockPhotos: string[];
  assemblyLocation: string;
  loggedBy: string;
  rejectionTimestamp: string;
}

export interface MobileRectificationMission {
  missionId: string;
  jobId: string;
  status: MissionStatus;
  haltSupplierDisbursement: boolean;
  assemblyLocation: string;
  technicianDispatchEta: string;
  targetKeywayDimensionMm: number;
  requiredSkimCutMm: number;
  equipmentAssigned: string[];
  preSkimDimensionMm: number;
  postSkimDimensionMm?: number;
  travelerStatus: 'LOCKED_FITMENT_ERROR' | 'UNLOCKED_RECTIFIED';
  digitalSignOff?: {
    technicianId: string;
    plantManagerSignOff: string;
    verifiedAt: string;
    signatureHash: string;
  };
  auditSealSha256: string;
  createdAt: string;
}
