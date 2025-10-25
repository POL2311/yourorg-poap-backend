// src/utils/quota.ts
type Tier = 'free' | 'pro' | 'enterprise' | string;

export function getAnalyticsMaxDays(tier: Tier): number {
  if (!tier) return 7;
  switch (tier.toLowerCase()) {
    case 'enterprise': return 365;
    case 'pro':        return 90;
    case 'free':
    default:           return 7;
  }
}

export async function assertCanCreateApiKey(
  organizerId: string,
  tier: Tier,
  countFn: (organizerId: string) => Promise<number>
) {
  const limit = ((): number => {
    switch ((tier || 'free').toLowerCase()) {
      case 'enterprise': return 50;
      case 'pro':        return 10;
      case 'free':
      default:           return 1;  // FREE → 1 API key activa
    }
  })();

  const current = await countFn(organizerId);
  if (current >= limit) {
    const msg = `Limite de API Keys alcanzado para plan ${tier || 'free'} (máx ${limit}).`;
    const err: any = new Error(msg);
    err.code = 'QUOTA_EXCEEDED';
    err.httpStatus = 402;
    throw err;
  }
}
