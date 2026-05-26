#!/bin/bash
# Setup script to initialize database for testing

set -e

echo "🚀 Starting test database setup..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="postgresql://dfn_user:dfn_password_dev@localhost:5432/dfn_discovery"
  echo "📝 Using default DATABASE_URL: $DATABASE_URL"
else
  echo "📝 Using DATABASE_URL: $DATABASE_URL"
fi

# Wait for Postgres to be ready
echo "⏳ Waiting for Postgres to be ready..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
  if pg_isready -h localhost -p 5432 -U dfn_user &>/dev/null; then
    echo "✅ Postgres is ready!"
    break
  fi
  attempt=$((attempt + 1))
  echo "  Attempt $attempt/$max_attempts..."
  sleep 2
done

if [ $attempt -eq $max_attempts ]; then
  echo "❌ Postgres failed to start after $max_attempts attempts"
  exit 1
fi

# Create database if it doesn't exist
echo "📦 Ensuring database exists..."
PGPASSWORD=dfn_password_dev psql -h localhost -U dfn_user -tc "SELECT 1 FROM pg_database WHERE datname = 'dfn_discovery'" | grep -q 1 || \
  PGPASSWORD=dfn_password_dev createdb -h localhost -U dfn_user dfn_discovery

echo "🔄 Pushing Drizzle schema..."
cd "$(dirname "$0")/backend"
npm run db:push 2>/dev/null || npx drizzle-kit push:pg

echo "✅ Database setup complete!"
