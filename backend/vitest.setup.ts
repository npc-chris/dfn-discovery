/**
 * Vitest Setup File
 *
 * Initializes test environment:
 * 1. Loads test environment variables
 * 2. Initializes Postgres database with schema
 * 3. Mocks external services (AI providers, Redis, etc.)
 * 4. Provides global test utilities
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// ============================================================================
// DATABASE SETUP
// ============================================================================

let testPool: Pool | null = null;

async function waitForDatabaseConnection(pool: Pool, attempts = 30, delayMs = 2000): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('SELECT NOW()');
      return;
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Database did not become ready in time');
}

/**
 * Initialize test database pool and schema
 */
export async function initializeTestDatabase() {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://dfn_user:dfn_password_dev@localhost:5432/dfn_discovery';

  testPool = new Pool({
    connectionString,
    max: 1, // Single connection for tests
    min: 0,
  });

  try {
    // Test connection with retries for slow local startup.
    await waitForDatabaseConnection(testPool);
    console.log('✅ Database connected');

    // Create tables if they don't exist
    await testPool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      DROP TABLE IF EXISTS recommendations CASCADE;
      DROP TABLE IF EXISTS job_queue CASCADE;
      DROP TABLE IF EXISTS attachments CASCADE;
      DROP TABLE IF EXISTS jobs CASCADE;
      DROP TABLE IF EXISTS factories CASCADE;
      DROP TABLE IF EXISTS batch_manifests CASCADE;
    `);

    await testPool.query(`
      CREATE TABLE batch_manifests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status TEXT NOT NULL DEFAULT 'pending',
        idempotency_key TEXT UNIQUE,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await testPool.query(`
      CREATE TABLE jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id UUID REFERENCES batch_manifests(id),
        company_name TEXT NOT NULL,
        product_name TEXT NOT NULL,
        process_type TEXT,
        material_type TEXT,
        volume_band TEXT,
        location JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        version INTEGER NOT NULL DEFAULT 1,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await testPool.query(`
      CREATE TABLE factories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        factory_name TEXT NOT NULL,
        capabilities JSONB NOT NULL,
        materials JSONB NOT NULL,
        capacity_band TEXT NOT NULL,
        locations JSONB NOT NULL,
        certifications JSONB,
        verified_sources JSONB NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await testPool.query(`
      CREATE TABLE recommendations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES jobs(id),
        factory_id UUID NOT NULL REFERENCES factories(id),
        fit_score INTEGER NOT NULL,
        feasibility_score INTEGER NOT NULL,
        confidence_score INTEGER NOT NULL,
        rank INTEGER,
        evidence JSONB NOT NULL,
        caveats JSONB,
        generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        version INTEGER NOT NULL DEFAULT 1
      );
    `);

    await testPool.query(`
      CREATE TABLE job_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES jobs(id),
        queue_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result JSONB,
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP
      );
    `);

    await testPool.query(`
      CREATE TABLE attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES jobs(id),
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    console.log('✅ Database schema initialized');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Clean all tables for test isolation
 */
export async function cleanupTestDatabase() {
  if (!testPool) return;

  try {
    // Drop all data in reverse order of dependencies
    await testPool.query('TRUNCATE TABLE recommendations CASCADE;');
    await testPool.query('TRUNCATE TABLE job_queue CASCADE;');
    await testPool.query('TRUNCATE TABLE attachments CASCADE;');
    await testPool.query('TRUNCATE TABLE jobs CASCADE;');
    await testPool.query('TRUNCATE TABLE factories CASCADE;');
    await testPool.query('TRUNCATE TABLE batch_manifests CASCADE;');
  } catch (error) {
    // Ignore errors if tables don't exist yet
  }
}

/**
 * Close database connection
 */
export async function closeTestDatabase() {
  if (testPool) {
    await testPool.end();
    testPool = null;
    console.log('✅ Database connection closed');
  }
}

// ============================================================================
// GLOBAL TEST SETUP & TEARDOWN
// ============================================================================

beforeAll(async () => {
  console.log('\n🔧 Setting up test environment...\n');
  await initializeTestDatabase();
});

afterAll(async () => {
  console.log('\n🧹 Tearing down test environment...\n');
  await closeTestDatabase();
});

beforeEach(async () => {
  await cleanupTestDatabase();
});

// Export database for use in tests if needed
export { testPool };
