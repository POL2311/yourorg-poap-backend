#!/bin/bash
set -e

echo "🔧 [DEV] Setting up Prisma database..."
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "❌ .env file not found."
    exit 1
fi
source .env

echo "📊 DATABASE_URL: ${DATABASE_URL}"

# Generar cliente Prisma
npx prisma generate

# Resetear base (solo en dev)
npx prisma migrate reset --force

# Aplicar migraciones
npx prisma migrate dev --name init

# Seed opcional
npx prisma db seed

echo "✅ Dev DB reset complete!"
