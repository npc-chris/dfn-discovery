// Drizzle schema for DFN Gap Analyzer
// Matches the canonical entities defined in DFN_LLD.md

import { pgTable, text, integer, boolean, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';

// Jobs table
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  company_name: text('company_name').notNull(),
  product_name: text('product_name').notNull(),
  process_type: text('process_type'),
  material_type: text('material_type'),
  volume_band: text('volume_band'),
  location: jsonb('location').notNull(),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// Factory profiles table
export const factories = pgTable('factories', {
  id: uuid('id').primaryKey().defaultRandom(),
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
});

// Recommendations table
export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_id: uuid('job_id').notNull().references(() => jobs.id),
  factory_id: uuid('factory_id').notNull().references(() => factories.id),
  fit_score: integer('fit_score').notNull(),
  feasibility_score: integer('feasibility_score').notNull(),
  confidence_score: integer('confidence_score').notNull(),
  rank: integer('rank'),
  evidence: jsonb('evidence').notNull(),
  caveats: jsonb('caveats'),
  generated_at: timestamp('generated_at').notNull().defaultNow(),
  version: integer('version').notNull().default(1),
});

// Attachments table
export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_id: uuid('job_id').notNull().references(() => jobs.id),
  filename: text('filename').notNull(),
  mime_type: text('mime_type').notNull(),
  size_bytes: integer('size_bytes').notNull(),
  source_type: text('source_type').notNull(),
  uploaded_at: timestamp('uploaded_at').notNull().defaultNow(),
});

// Job queue for async workers
export const job_queue = pgTable('job_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_id: uuid('job_id').references(() => jobs.id),
  queue_type: text('queue_type').notNull(), // classify-job, extract-evidence, etc.
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
  completed_at: timestamp('completed_at'),
});
