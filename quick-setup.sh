# Quick setup script to get your backend running

# 1. Install dependencies (if not already done)
npm install

# 2. Generate Prisma client
npm run db:generate

# 3. Push database schema (creates tables if they don't exist)
npm run db:push

# 4. Start the multi-tenant backend
npm run dev:multi