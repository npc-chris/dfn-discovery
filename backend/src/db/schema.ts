// Drizzle schema for DFN Discovery
// Matches the canonical entities defined in DFN_LLD.md

import { pgTable, text, integer, boolean, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';

// Batch manifests table
export const batch_manifests = pgTable('batch_manifests', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: text('org_id').notNull(),
  status: text('status').notNull().default('pending'), // pending, processing, completed, failed
  idempotency_key: text('idempotency_key').unique(),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => {
  return {
    orgIdIdx: index('batch_manifests_org_id_idx').on(table.org_id)
  }
});

// Projects table (groups multiple RFQs / manufacturing line items under one project)
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: text('org_id').notNull(),
  title: text('title').notNull(), // e.g. "Gearbox Housing Assembly"
  description: text('description'),
  status: text('status').notNull().default('active'), // active, completed, archived
  budget_ceiling_ngn: integer('budget_ceiling_ngn'), // Target ceiling in NGN (e.g. 15,000,000)
  target_delivery_date: timestamp('target_delivery_date'),
  delivery_location: jsonb('delivery_location'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => {
  return {
    orgIdIdx: index('projects_org_id_idx').on(table.org_id),
  };
});

// Jobs / RFQ Items table
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: text('org_id').notNull(),
  created_by: text('created_by').notNull(),
  project_id: uuid('project_id').references(() => projects.id),
  batch_id: uuid('batch_id').references(() => batch_manifests.id),
  rfq_code: text('rfq_code'), // e.g. "RFQ-2026-041"
  company_name: text('company_name').notNull(),
  product_name: text('product_name').notNull(),
  process_type: text('process_type'),
  material_type: text('material_type'),
  volume_band: text('volume_band'),
  location: jsonb('location').notNull(),
  status: text('status').notNull().default('draft'), // intake worker state: draft, analyzing, scored, recommended, published, failed
  procurement_stage: text('procurement_stage').notNull().default('draft'), // procurement state: draft, source, commit, build, accept
  target_ceiling_ngn: integer('target_ceiling_ngn'),
  version: integer('version').notNull().default(1),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => {
  return {
    orgIdIdx: index('jobs_org_id_idx').on(table.org_id),
    projectIdIdx: index('jobs_project_id_idx').on(table.project_id),
  };
});

// Factory profiles table
export const factories = pgTable('factories', {
  id: uuid('id').primaryKey().defaultRandom(),
  org_id: text('org_id').notNull(),
  factory_name: text('factory_name').notNull(),
  capabilities: jsonb('capabilities').notNull(),
  materials: jsonb('materials').notNull(),
  capacity_band: text('capacity_band').notNull(),
  locations: jsonb('locations').notNull(),
  certifications: jsonb('certifications'),
  verified_sources: jsonb('verified_sources').notNull(),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => {
  return {
    orgIdIdx: index('factories_org_id_idx').on(table.org_id)
  }
});

// Recommendations table
export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_id: uuid('job_id').notNull().references(() => jobs.id),
  factory_id: uuid('factory_id').notNull().references(() => factories.id),
  org_id: text('org_id').notNull(),
  fit_score: integer('fit_score').notNull(),
  feasibility_score: integer('feasibility_score').notNull(),
  confidence_score: integer('confidence_score').notNull(),
  component_scores: jsonb('component_scores'),
  rank: integer('rank'),
  evidence: jsonb('evidence').notNull(),
  caveats: jsonb('caveats'),
  generated_at: timestamp('generated_at').notNull().defaultNow(),
  version: integer('version').notNull().default(1),
}, (table) => {
  return {
    orgIdIdx: index('recommendations_org_id_idx').on(table.org_id)
  }
});

// Attachments table
export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_id: uuid('job_id').notNull().references(() => jobs.id),
  org_id: text('org_id').notNull(),
  filename: text('filename').notNull(),
  mime_type: text('mime_type').notNull(),
  size_bytes: integer('size_bytes').notNull(),
  source_type: text('source_type').notNull(),
  uploaded_at: timestamp('uploaded_at').notNull().defaultNow(),
}, (table) => {
  return {
    orgIdIdx: index('attachments_org_id_idx').on(table.org_id)
  }
});

// Job queue for async workers
export const job_queue = pgTable('job_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_id: uuid('job_id').references(() => jobs.id),
  queue_type: text('queue_type').notNull(), // classify-job, extract-evidence, etc.
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'),
  result: jsonb('result'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
  completed_at: timestamp('completed_at'),
});

// Quotes / Supplier Bids table
export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_id: uuid('job_id').notNull().references(() => jobs.id),
  factory_id: uuid('factory_id').notNull().references(() => factories.id),
  org_id: text('org_id').notNull(),
  unit_price_ngn: integer('unit_price_ngn').notNull(), // e.g. 71,000 NGN
  total_price_ngn: integer('total_price_ngn').notNull(), // e.g. 14,200,000 NGN
  lead_time_days: integer('lead_time_days').notNull(), // e.g. 7 days
  status: text('status').notNull().default('submitted'), // submitted, under_review, awarded, rejected, expired
  terms: text('terms'),
  notes: text('notes'),
  submitted_at: timestamp('submitted_at').notNull().defaultNow(),
  valid_until: timestamp('valid_until'),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => {
  return {
    orgIdIdx: index('quotes_org_id_idx').on(table.org_id),
    jobIdIdx: index('quotes_job_id_idx').on(table.job_id),
    factoryIdIdx: index('quotes_factory_id_idx').on(table.factory_id),
  };
});

// Project Activities / Audit Stream table
export const project_activities = pgTable('project_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id),
  job_id: uuid('job_id').references(() => jobs.id),
  org_id: text('org_id').notNull(),
  event_type: text('event_type').notNull(), // quote_submitted, dfm_warning, milestone_updated, corridor_cleared, rfq_dispatched, quote_awarded, job_created
  title: text('title').notNull(), // e.g. "Quote Submitted"
  description: text('description').notNull(), // e.g. "Precision Works submitted ₦14.2M for RFQ-041"
  severity: text('severity').notNull().default('info'), // info, success, warning, danger
  metadata: jsonb('metadata'),
  actor: text('actor'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => {
  return {
    orgIdIdx: index('project_activities_org_id_idx').on(table.org_id),
    projectIdIdx: index('project_activities_project_id_idx').on(table.project_id),
    jobIdIdx: index('project_activities_job_id_idx').on(table.job_id),
  };
});

