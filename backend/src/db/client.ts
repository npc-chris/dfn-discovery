// Database connection and client
// Initialize once and export for use throughout the application

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

function requireIntegerEnv(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`${name} is required`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer, got: ${value}`);
  }

  return parsed;
}

function requireStringEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

const pool = new Pool({
  connectionString: requireStringEnv('DATABASE_URL'),
  max: requireIntegerEnv('DATABASE_POOL_MAX', 10),
  min: requireIntegerEnv('DATABASE_POOL_MIN', 1),
});

export const db = drizzle(pool, { schema });
