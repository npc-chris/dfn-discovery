// Factory domain types matching DFN_LLD.md canonical schema

export interface FactoryLocation {
  latitude: number;
  longitude: number;
  address?: string;
  country: string;
  region?: string;
}

export interface FactoryCapability {
  process: string;
  machine_class?: string;
  notes?: string;
}

export interface Certification {
  name: string;
  verified_by?: string;
  expires_at?: Date;
}

export interface VerifiedSource {
  source_type: string;
  reference: string;
  verified_at: Date;
}

export interface FactoryProfile {
  id: string;
  factory_name: string;
  capabilities: FactoryCapability[];
  materials: string[];
  capacity_band: string;
  locations: FactoryLocation[];
  certifications: Certification[];
  verified_sources: VerifiedSource[];
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FactoryInput {
  factory_name: string;
  capabilities: FactoryCapability[];
  materials: string[];
  capacity_band: string;
  locations: FactoryLocation[];
  certifications?: Certification[];
}
