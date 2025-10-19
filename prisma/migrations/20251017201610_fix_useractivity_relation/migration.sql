-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ORGANIZER', 'ADMIN');

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nft_mints" (
    "id" TEXT NOT NULL,
    "mintAddress" TEXT NOT NULL,
    "userPublicKey" TEXT NOT NULL,
    "transactionSignature" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "gasCost" INTEGER NOT NULL,
    "relayerPublicKey" TEXT NOT NULL,
    "serviceId" TEXT,
    "eventId" TEXT,
    "eventName" TEXT,
    "network" TEXT NOT NULL DEFAULT 'devnet',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nft_mints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relayer_stats" (
    "id" TEXT NOT NULL,
    "relayerPublicKey" TEXT NOT NULL,
    "totalMints" INTEGER NOT NULL DEFAULT 0,
    "totalGasPaid" BIGINT NOT NULL DEFAULT 0,
    "currentBalance" BIGINT NOT NULL DEFAULT 0,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relayer_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activity" (
    "id" TEXT NOT NULL,
    "userPublicKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "user_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "nft_mints_mintAddress_key" ON "nft_mints"("mintAddress");

-- CreateIndex
CREATE UNIQUE INDEX "nft_mints_transactionSignature_key" ON "nft_mints"("transactionSignature");

-- CreateIndex
CREATE UNIQUE INDEX "relayer_stats_relayerPublicKey_key" ON "relayer_stats"("relayerPublicKey");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
