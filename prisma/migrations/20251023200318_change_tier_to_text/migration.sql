/*
  Warnings:

  - You are about to alter the column `key` on the `api_keys` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(80)`.
  - You are about to alter the column `name` on the `api_keys` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(120)`.
  - You are about to alter the column `name` on the `campaigns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.
  - You are about to alter the column `location` on the `campaigns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.
  - You are about to alter the column `imageUrl` on the `campaigns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(600)`.
  - You are about to alter the column `externalUrl` on the `campaigns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(600)`.
  - You are about to alter the column `secretCode` on the `campaigns` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(120)`.
  - You are about to alter the column `userPublicKey` on the `claims` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `mintAddress` on the `claims` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `tokenAccount` on the `claims` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `transactionHash` on the `claims` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(140)`.
  - You are about to alter the column `ipAddress` on the `claims` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(64)`.
  - You are about to alter the column `mintAddress` on the `nft_mints` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `userPublicKey` on the `nft_mints` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `transactionSignature` on the `nft_mints` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(140)`.
  - You are about to alter the column `relayerPublicKey` on the `nft_mints` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `serviceId` on the `nft_mints` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(120)`.
  - You are about to alter the column `eventId` on the `nft_mints` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(120)`.
  - You are about to alter the column `eventName` on the `nft_mints` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.
  - You are about to alter the column `network` on the `nft_mints` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(32)`.
  - You are about to alter the column `name` on the `organizers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(120)`.
  - You are about to alter the column `company` on the `organizers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(160)`.
  - You are about to alter the column `passwordHash` on the `organizers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.
  - You are about to alter the column `tier` on the `organizers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `relayerPublicKey` on the `relayer_stats` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `userPublicKey` on the `user_activity` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `action` on the `user_activity` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(60)`.
  - You are about to alter the column `ipAddress` on the `user_activity` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(64)`.
  - You are about to alter the column `name` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(120)`.
  - You are about to alter the column `passwordHash` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.

*/
-- AlterTable
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
SET search_path = public;
ALTER TABLE "api_keys" ALTER COLUMN "key" SET DATA TYPE VARCHAR(80),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(120);

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "secretCodeHash" VARCHAR(200),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "location" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "imageUrl" SET DATA TYPE VARCHAR(600),
ALTER COLUMN "externalUrl" SET DATA TYPE VARCHAR(600),
ALTER COLUMN "secretCode" SET DATA TYPE VARCHAR(120);

-- AlterTable
ALTER TABLE "claims" ALTER COLUMN "userPublicKey" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "mintAddress" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "tokenAccount" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "transactionHash" SET DATA TYPE VARCHAR(140),
ALTER COLUMN "ipAddress" SET DATA TYPE VARCHAR(64);

-- AlterTable
ALTER TABLE "nft_mints" ALTER COLUMN "mintAddress" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "userPublicKey" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "transactionSignature" SET DATA TYPE VARCHAR(140),
ALTER COLUMN "relayerPublicKey" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "serviceId" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "eventId" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "eventName" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "network" SET DATA TYPE VARCHAR(32);

-- AlterTable
ALTER TABLE "organizers" ALTER COLUMN "email" SET DATA TYPE CITEXT,
ALTER COLUMN "name" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "company" SET DATA TYPE VARCHAR(160),
ALTER COLUMN "passwordHash" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "tier" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "relayer_stats" ALTER COLUMN "relayerPublicKey" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "user_activity" ALTER COLUMN "userPublicKey" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "action" SET DATA TYPE VARCHAR(60),
ALTER COLUMN "ipAddress" SET DATA TYPE VARCHAR(64);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE CITEXT,
ALTER COLUMN "name" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "passwordHash" SET DATA TYPE VARCHAR(200);

-- CreateIndex
CREATE INDEX "api_keys_organizerId_idx" ON "api_keys"("organizerId");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE INDEX "api_keys_lastUsedAt_idx" ON "api_keys"("lastUsedAt");

-- CreateIndex
CREATE INDEX "campaigns_organizerId_idx" ON "campaigns"("organizerId");

-- CreateIndex
CREATE INDEX "campaigns_createdAt_idx" ON "campaigns"("createdAt");

-- CreateIndex
CREATE INDEX "campaigns_organizerId_isActive_idx" ON "campaigns"("organizerId", "isActive");

-- CreateIndex
CREATE INDEX "campaigns_eventDate_idx" ON "campaigns"("eventDate");

-- CreateIndex
CREATE INDEX "claims_claimedAt_idx" ON "claims"("claimedAt");

-- CreateIndex
CREATE INDEX "claims_campaignId_claimedAt_idx" ON "claims"("campaignId", "claimedAt");

-- CreateIndex
CREATE INDEX "claims_userPublicKey_claimedAt_idx" ON "claims"("userPublicKey", "claimedAt");

-- CreateIndex
CREATE INDEX "nft_mints_userPublicKey_createdAt_idx" ON "nft_mints"("userPublicKey", "createdAt");

-- CreateIndex
CREATE INDEX "nft_mints_createdAt_idx" ON "nft_mints"("createdAt");

-- CreateIndex
CREATE INDEX "nft_mints_relayerPublicKey_createdAt_idx" ON "nft_mints"("relayerPublicKey", "createdAt");

-- CreateIndex
CREATE INDEX "organizers_createdAt_idx" ON "organizers"("createdAt");

-- CreateIndex
CREATE INDEX "organizers_isActive_tier_idx" ON "organizers"("isActive", "tier");

-- CreateIndex
CREATE INDEX "relayer_stats_lastActivity_idx" ON "relayer_stats"("lastActivity");

-- CreateIndex
CREATE INDEX "usage_date_idx" ON "usage"("date");

-- CreateIndex
CREATE INDEX "usage_organizerId_date_idx" ON "usage"("organizerId", "date");

-- CreateIndex
CREATE INDEX "user_activity_userId_createdAt_idx" ON "user_activity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_activity_userPublicKey_createdAt_idx" ON "user_activity"("userPublicKey", "createdAt");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");
