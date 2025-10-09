#!/bin/bash
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ Falta .env (DATABASE_URL)."
  exit 1
fi

source .env
echo "📊 DATABASE_URL: ${DATABASE_URL}"

echo "🔄 prisma generate..."
npx prisma generate

echo "🗑️ prisma migrate reset (dev)..."
npx prisma migrate reset --force

echo "📝 prisma migrate dev..."
npx prisma migrate dev --name init

echo "🌱 prisma db seed..."
npm run db:seed

echo "✅ Dev DB lista."
