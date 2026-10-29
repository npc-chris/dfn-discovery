/**
 * Canonical Standards & Cross-References Seed Data
 * For test fixtures and development database initialization
 */

import type { StandardInput, EquivalenceLevel } from '@dfn/shared';
import { importStandardsBulk, linkStandardEquivalence } from '../../services/standards-service';

export const CANONICAL_STANDARDS_FIXTURES: StandardInput[] = [
  // Nigerian Regional (SON)
  {
    sdo: 'SON',
    standard_code: 'NIS 102:2006',
    title: 'Specification for Steel Bars for the Reinforcement of Concrete',
    category: 'materials',
    status: 'active',
    scope_summary: 'Mandatory standard covering plain and ribbed steel bars produced from scrap melt and primary billets in Nigeria.',
    ics_code: '77.140.15',
  },
  {
    sdo: 'SON',
    standard_code: 'NIS ISO 9001:2015',
    title: 'Quality Management Systems - Requirements (Nigerian Harmonized Adoption)',
    category: 'quality',
    status: 'active',
    scope_summary: 'National adoption of ISO 9001 for quality assurance and factory auditing in Nigeria.',
    ics_code: '03.120.10',
  },
  {
    sdo: 'SON',
    standard_code: 'NIS 368:1997',
    title: 'Specification for Wrought Aluminium and Aluminium Alloys for General Engineering',
    category: 'materials',
    status: 'active',
    scope_summary: 'Covers sheet, strip, and extruded alloy stock in 6000-series aluminum.',
    ics_code: '77.120.10',
  },
  {
    sdo: 'SON',
    standard_code: 'NIS 117:2004',
    title: 'Specification for Steel Pipes and Tubes for Pressure and Structural Applications',
    category: 'materials',
    status: 'active',
    scope_summary: 'Covers seamless and welded carbon steel piping for construction and fluid transport.',
    ics_code: '77.140.75',
  },

  // Global Base (ISO / IEC)
  {
    sdo: 'ISO',
    standard_code: 'ISO 9001:2015',
    title: 'Quality Management Systems - Requirements',
    category: 'quality',
    status: 'active',
    scope_summary: 'International benchmark for manufacturing QMS and traceable process control.',
    ics_code: '03.120.10',
  },
  {
    sdo: 'ISO',
    standard_code: 'ISO 7599:2018',
    title: 'Anodizing of Aluminium and its Alloys - Method for Specifying Decorative and Protective Anodic Oxidation Coatings',
    category: 'coatings',
    status: 'active',
    scope_summary: 'Specifies thickness classes, sealing quality, and abrasion resistance for architectural and industrial anodizing.',
    ics_code: '25.220.20',
  },

  // American & Mechanical (ASTM, ASME, API, AWS)
  {
    sdo: 'ASTM',
    standard_code: 'ASTM A36/A36M',
    title: 'Standard Specification for Carbon Structural Steel',
    category: 'materials',
    status: 'active',
    scope_summary: 'Covers carbon steel shapes, plates, and bars of structural quality for use in bolted, riveted, or welded construction.',
    ics_code: '77.140.20',
  },
  {
    sdo: 'ASTM',
    standard_code: 'ASTM B221',
    title: 'Standard Specification for Aluminum and Aluminum-Alloy Extruded Bars, Rods, Wire, Profiles, and Tubes',
    category: 'materials',
    status: 'active',
    scope_summary: 'Specification for extruded aluminum 6061-T6 and 6063 profiles.',
    ics_code: '77.120.10',
  },
  {
    sdo: 'BS/EN',
    standard_code: 'BS EN 10025-2',
    title: 'Hot Rolled Products of Structural Steels - Technical Delivery Conditions for Non-Alloy Structural Steels',
    category: 'materials',
    status: 'active',
    scope_summary: 'European structural steel specification (S235, S275, S355).',
    ics_code: '77.140.10',
  },
  {
    sdo: 'API',
    standard_code: 'API 5L Grade X52',
    title: 'Specification for Line Pipe (PSL 1 and PSL 2)',
    category: 'oil_and_gas',
    status: 'active',
    scope_summary: 'Seamless and welded steel line pipe for petroleum and natural gas transport industries.',
    ics_code: '75.200',
  },
  {
    sdo: 'ASME',
    standard_code: 'ASME Section VIII Div 1',
    title: 'Rules for Construction of Pressure Vessels',
    category: 'pressure_vessels',
    status: 'active',
    scope_summary: 'Requirements applicable to design, fabrication, inspection, testing, and certification of pressure vessels.',
    ics_code: '23.020.30',
  },
  {
    sdo: 'AWS',
    standard_code: 'AWS D1.1/D1.1M',
    title: 'Structural Welding Code - Steel',
    category: 'welding',
    status: 'active',
    scope_summary: 'Covers welding requirements for any type of welded steel structure.',
    ics_code: '25.160.10',
  },
  {
    sdo: 'MIL-SPEC',
    standard_code: 'MIL-A-8625',
    title: 'Anodic Coatings for Aluminum and Aluminum Alloys (Type III Hardcoat)',
    category: 'coatings',
    status: 'active',
    scope_summary: 'Military and heavy industrial specification for hard anodized corrosion/wear resistant coatings.',
    ics_code: '25.220.20',
  },
];

export const CANONICAL_CROSS_REF_FIXTURES = [
  {
    sourceCode: 'NIS ISO 9001:2015',
    targetCode: 'ISO 9001:2015',
    equivalenceLevel: 'identical' as EquivalenceLevel,
    technicalNotes: 'Direct Nigerian national adoption of ISO 9001:2015 without deviation.',
  },
  {
    sourceCode: 'NIS 102:2006',
    targetCode: 'ASTM A36/A36M',
    equivalenceLevel: 'equivalent_substitute' as EquivalenceLevel,
    technicalNotes: 'NIS 102 yield strength (250-410 MPa) matches ASTM A36 requirements for mild steel fabrication.',
    propertyMapping: { yield_strength_min_mpa: 250, tensile_strength_mpa: 400 },
  },
  {
    sourceCode: 'BS EN 10025-2',
    targetCode: 'NIS 102:2006',
    equivalenceLevel: 'equivalent_substitute' as EquivalenceLevel,
    technicalNotes: 'EN 10025-2 S275 can be substituted with locally milled NIS 102 ribbed/plain bar for structural frameworks.',
    propertyMapping: { yield_strength_min_mpa: 275 },
  },
  {
    sourceCode: 'NIS 368:1997',
    targetCode: 'ASTM B221',
    equivalenceLevel: 'equivalent_substitute' as EquivalenceLevel,
    technicalNotes: 'NIS 368 covers 6000-series aluminum alloys equivalent to ASTM B221 6061-T6.',
  },
  {
    sourceCode: 'MIL-A-8625',
    targetCode: 'ISO 7599:2018',
    equivalenceLevel: 'equivalent_substitute' as EquivalenceLevel,
    technicalNotes: 'MIL-A-8625 Type III Hardcoat corresponds to ISO 7599 Class 50 (50 micron hard anodic layer).',
  },
  {
    sourceCode: 'NIS 117:2004',
    targetCode: 'API 5L Grade X52',
    equivalenceLevel: 'related' as EquivalenceLevel,
    technicalNotes: 'NIS 117 covers standard structural and fluid pipe; API 5L mandates higher fracture toughness for hydrocarbons.',
  },
];

export async function seedCanonicalStandards(): Promise<{ seededStandards: number; seededCrossReferences: number }> {
  const importRes = await importStandardsBulk(CANONICAL_STANDARDS_FIXTURES);

  let seededCrossReferences = 0;
  for (const link of CANONICAL_CROSS_REF_FIXTURES) {
    try {
      await linkStandardEquivalence({
        sourceCode: link.sourceCode,
        targetCode: link.targetCode,
        equivalenceLevel: link.equivalenceLevel,
        technicalNotes: link.technicalNotes,
        propertyMapping: link.propertyMapping,
      });
      seededCrossReferences++;
    } catch {
      // Ignore if already linked
    }
  }

  return {
    seededStandards: importRes.imported,
    seededCrossReferences,
  };
}
