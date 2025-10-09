#!/bin/bash
set -e

echo "🚀 [PROD] Deploying Prisma migrations..."

# Ir al root del backend
cd "$(dirname "$0")/.."

# Verificar .env
if [ ! -f .env ]; then
    echo "❌ .env file not found."
    exit 1
fi

# Cargar env
source .env

echo "📦 Running Prisma generate..."
npx prisma generate

echo "🧭 Deploying migrations (without data loss)..."
npx prisma migrate deploy

echo "✅ Migrations applied successfully!"
