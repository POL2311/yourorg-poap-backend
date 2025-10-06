#!/bin/bash

# setup-multitenant.sh - Setup Multi-Tenant POAP Infrastructure

set -e

echo "🚀 Setting up Multi-Tenant POAP Infrastructure..."
echo ""

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the backend directory"
    exit 1
fi

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL first."
    echo "   On macOS: brew install postgresql"
    echo "   On Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🗄️ Setting up database..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your database credentials and other settings"
    echo ""
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Check if database exists and is accessible
echo "🔍 Checking database connection..."
if npx prisma db push --accept-data-loss 2>/dev/null; then
    echo "✅ Database schema updated successfully"
else
    echo "❌ Database connection failed. Please check your DATABASE_URL in .env"
    echo ""
    echo "Example DATABASE_URL:"
    echo "postgresql://username:password@localhost:5432/poap_infrastructure?schema=public"
    echo ""
    echo "To create a PostgreSQL database:"
    echo "1. Start PostgreSQL service"
    echo "2. Create database: createdb poap_infrastructure"
    echo "3. Update DATABASE_URL in .env file"
    exit 1
fi

# Seed database
echo "🌱 Seeding database with demo data..."
npm run db:seed

echo ""
echo "🎉 Multi-Tenant POAP Infrastructure setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update .env file with your configuration"
echo "2. Start the development server: npm run dev"
echo "3. Visit http://localhost:3000/api/docs for API documentation"
echo ""
echo "🔑 Demo credentials (from seed):"
echo "   Email: demo@poap-infra.com"
echo "   Password: demo123"
echo ""
echo "🎯 Test endpoints:"
echo "   Health: GET http://localhost:3000/health"
echo "   Docs: GET http://localhost:3000/api/docs"
echo "   Register: POST http://localhost:3000/api/auth/register"
echo ""
echo "🚀 Ready to build your POAP SaaS platform!"