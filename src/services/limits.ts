// src/services/limits.ts
import { prisma } from '../lib/prisma';

export const PLAN_LIMITS = {
  free: {
    apiKeysActive: 1,      // máx API keys activas
    campaignsTotal: 2,     // máx campañas totales
    claimsMonthly: 200,    // ej: 200 claims/mes
    analyticsDays: 7,      // solo últimos 7 días
  },
  pro: {
    apiKeysActive: 10,
    campaignsTotal: 50,
    claimsMonthly: 10000,
    analyticsDays: 90,
  },
} as const;

type Tier = keyof typeof PLAN_LIMITS;

export async function assertCanCreateApiKey(organizerId: string, tier: Tier) {
  const active = await prisma.apiKey.count({
    where: { organizerId, isActive: true },
  });
  const limit = PLAN_LIMITS[tier].apiKeysActive;
  if (active >= limit) {
    const err: any = new Error(`Límite de API Keys alcanzado para plan ${tier} (${limit}).`);
    err.code = 'PLAN_LIMIT';
    err.status = 402;
    throw err;
  }
}

export async function assertCanCreateCampaign(organizerId: string, tier: Tier) {
  const total = await prisma.campaign.count({ where: { organizerId } });
  const limit = PLAN_LIMITS[tier].campaignsTotal;
  if (total >= limit) {
    const err: any = new Error(`Límite de campañas alcanzado para plan ${tier} (${limit}).`);
    err.code = 'PLAN_LIMIT';
    err.status = 402;
    throw err;
  }
}

export function getAnalyticsMaxDays(tier: Tier) {
  return PLAN_LIMITS[tier].analyticsDays;
}
