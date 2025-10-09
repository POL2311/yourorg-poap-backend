#!/bin/bash

# Setup script for Prisma database
echo "🔧 Setting up Prisma database..."

# Navigate to backend directory
cd "$(dirname "$0")"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create one with DATABASE_URL"
    echo "Example: DATABASE_URL=\"postgresql://username:password@localhost:5432/database_name\""
    exit 1
fi

# Load environment variables
source .env

echo "📊 Database URL: ${DATABASE_URL}"

# Generate Prisma client
echo "🔄 Generating Prisma client..."
npx prisma generate

# Reset database (this will drop and recreate all tables)
echo "🗑️ Resetting database..."
npx prisma migrate reset --force

# Apply migrations
echo "📝 Applying migrations..."
npx prisma migrate dev --name init

# Seed database with initial data (optional)
echo "🌱 Seeding database..."
npx prisma db seed

echo "✅ Database setup complete!"
echo ""
echo "🎯 Next steps:"
echo "1. Start the backend: npm run start:multitenant"
echo "2. Open dashboard: http://localhost:3001"
echo "3. Register a new organizer account"