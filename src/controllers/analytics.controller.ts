import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
function toYM(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
// ✅ Interface para actividad reciente
interface RecentActivity {
  id: string;
  type: 'claim' | 'campaign';
  title: string;
  description: string;
  timestamp: Date;
  campaignName: string;
  userWallet?: string;
  icon: string;
  badge: string;
  badgeVariant: 'success' | 'default' | 'secondary';
}

export class AnalyticsController {
  async getDashboardStats(req: AuthenticatedRequest, res: Response) {
    try {
      const organizerId = req.user!.organizerId;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalCampaigns,
        activeCampaigns,
        totalClaims,
        claimsLast30Days,
        topCampaigns,
        recentActivity
      ] = await Promise.all([
        prisma.campaign.count({ where: { organizerId } }),
        prisma.campaign.count({ where: { organizerId, isActive: true } }),
        prisma.claim.count({ where: { campaign: { is: { organizerId } } } }),
        prisma.claim.count({
          where: { campaign: { is: { organizerId } }, claimedAt: { gte: thirtyDaysAgo } }
        }),
        prisma.campaign.findMany({
          where: { organizerId },
          include: { _count: { select: { claims: true } } },
          orderBy: { claims: { _count: 'desc' } },
          take: 5
        }),
        prisma.claim.findMany({
          where: { campaign: { is: { organizerId } } },
          include: { campaign: { select: { name: true } } },
          orderBy: { claimedAt: 'desc' },
          take: 10
        })
      ]);

      return res.json({
        success: true,
        data: {
          overview: {
            totalCampaigns,
            activeCampaigns,
            totalClaims,
            claimsLast30Days
          },
          topCampaigns: topCampaigns.map(campaign => ({
            id: campaign.id,
            name: campaign.name,
            totalClaims: campaign._count.claims,
            eventDate: campaign.eventDate
          })),
          recentActivity: recentActivity.map(claim => ({
            id: claim.id,
            campaignName: claim.campaign.name,
            userPublicKey: claim.userPublicKey,
            claimedAt: claim.claimedAt
          }))
        }
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
    }
  }

  async getCampaignAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params;
      const organizerId = req.user!.organizerId;

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizerId }
      });

      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const claimsOverTime = await prisma.claim.groupBy({
        by: ['claimedAt'],
        where: { campaignId, claimedAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
        orderBy: { claimedAt: 'asc' }
      });

      const dailyClaims = this.groupClaimsByDay(claimsOverTime);

      const [totalClaims, uniqueUsers] = await Promise.all([
        prisma.claim.count({ where: { campaignId } }),
        prisma.claim.groupBy({
          by: ['userPublicKey'],
          where: { campaignId }
        }).then(groups => groups.length)
      ]);

      return res.json({
        success: true,
        data: {
          campaign: {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            eventDate: campaign.eventDate
          },
          stats: {
            totalClaims,
            uniqueUsers,
            claimRate: campaign.maxClaims ? (totalClaims / campaign.maxClaims) * 100 : null
          },
          charts: { dailyClaims }
        }
      });
    } catch (error) {
      console.error('Error fetching campaign analytics:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch campaign analytics' });
    }
  }
  

  private groupClaimsByDay(claims: Array<{ claimedAt: Date; _count: { _all: number } }>) {
    const grouped = new Map<string, number>();
    claims.forEach(c => {
      const date = new Date(c.claimedAt).toISOString().split('T')[0];
      grouped.set(date, (grouped.get(date) || 0) + c._count._all);
    });
    return Array.from(grouped.entries()).map(([date, count]) => ({ date, claims: count }));
  }

  async getSystemHealth(req: Request, res: Response) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      let relayerBalance = 0;
      return res.json({
        success: true,
        data: {
          database: 'healthy',
          relayerBalance,
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        }
      });
    } catch (error) {
      console.error('Health check failed:', error);
      return res.status(500).json({ success: false, error: 'System health check failed' });
    }
  }

  // ✅ NUEVOS MÉTODOS PARA GRÁFICAS DEL DASHBOARD
  async getDailyClaims(req: AuthenticatedRequest, res: Response) {
    const organizerId = req.user!.organizerId;
    const tz = (req.query.tz as string) || 'America/Mexico_City';
    const end = new Date();                      // hoy ahora
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000); // hace 6 días

    try {
      // OJO: tablas reales por @@map => "claims" y "campaigns"
      const rows = await prisma.$queryRaw<{ d: Date; claims: bigint }[]>`
        SELECT
          date_trunc('day', (c."claimedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}) AS d,
          COUNT(*)::bigint AS claims
        FROM "claims" c
        JOIN "campaigns" ca ON ca."id" = c."campaignId"
        WHERE ca."organizerId" = ${organizerId}
          AND c."claimedAt" >= ${start}
          AND c."claimedAt" <  ${end}
        GROUP BY 1
        ORDER BY 1
      `;

      const map = new Map<string, number>();
      rows.forEach(r => {
        const k = new Date(r.d).toISOString().slice(0, 10); // YYYY-MM-DD
        map.set(k, Number(r.claims));
      });

      // zero-fill
      const out: { date: string; claims: number }[] = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        const k = cursor.toISOString().slice(0, 10);
        out.push({ date: k, claims: map.get(k) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      return res.json(out);
    } catch (err) {
      console.warn('getDailyClaims SQL falló, usando fallback Prisma. Error:', err);
      // Fallback seguro con Prisma puro (sin TZ exacto, pero suficiente en dev)
      try {
        const fallback = await prisma.claim.findMany({
          where: {
            campaign: { is: { organizerId } },
            claimedAt: { gte: start, lt: end },
          },
          select: { claimedAt: true },
        });
        const map = new Map<string, number>();
        fallback.forEach(r => {
          const k = new Date(r.claimedAt).toISOString().slice(0, 10);
          map.set(k, (map.get(k) ?? 0) + 1);
        });
        const out: { date: string; claims: number }[] = [];
        const cursor = new Date(start);
        while (cursor <= end) {
          const k = cursor.toISOString().slice(0, 10);
          out.push({ date: k, claims: map.get(k) ?? 0 });
          cursor.setDate(cursor.getDate() + 1);
        }
        return res.json(out);
      } catch (e2) {
        console.error('Fallback Prisma también falló:', e2);
        return res.status(500).json({ success: false, error: 'Failed to fetch daily claims' });
      }
    }
  }

async getMonthlyTrend(req: AuthenticatedRequest, res: Response) {
    const organizerId = req.user!.organizerId;
    const tz = (req.query.tz as string) || 'America/Mexico_City';
    const months = Math.max(1, Math.min(24, Number(req.query.months || 6)));

    const end = new Date(); // ahora
    const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1); // primer día del mes inicial

    try {
      const claims = await prisma.$queryRaw<{ m: Date; claims: bigint }[]>`
        SELECT
          date_trunc('month', (c."claimedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}) AS m,
          COUNT(*)::bigint AS claims
        FROM "claims" c
        JOIN "campaigns" ca ON ca."id" = c."campaignId"
        WHERE ca."organizerId" = ${organizerId}
          AND c."claimedAt" >= ${start}
          AND c."claimedAt" <= ${end}
        GROUP BY 1
        ORDER BY 1
      `;

      const campaigns = await prisma.$queryRaw<{ m: Date; campaigns: bigint }[]>`
        SELECT
          date_trunc('month', (ca."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}) AS m,
          COUNT(*)::bigint AS campaigns
        FROM "campaigns" ca
        WHERE ca."organizerId" = ${organizerId}
          AND ca."createdAt" >= ${start}
          AND ca."createdAt" <= ${end}
        GROUP BY 1
        ORDER BY 1
      `;

      const cMap = new Map<string, number>();
      claims.forEach(r => cMap.set(new Date(r.m).toISOString().slice(0, 7), Number(r.claims)));

      const pMap = new Map<string, number>();
      campaigns.forEach(r => pMap.set(new Date(r.m).toISOString().slice(0, 7), Number(r.campaigns)));

      // zero-fill con etiquetas cortas (Jan, Feb, …)
      const out: { month: string; claims: number; campaigns: number }[] = [];
      for (let i = 0; i < months; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const key = d.toISOString().slice(0, 7); // YYYY-MM
        const label = d.toLocaleString('en-US', { month: 'short' });
        out.push({
          month: label,
          claims: cMap.get(key) ?? 0,
          campaigns: pMap.get(key) ?? 0,
        });
      }

      return res.json(out);
    } catch (err) {
      console.warn('getMonthlyTrend SQL falló, usando fallback Prisma. Error:', err);
      try {
        // Fallback sin SQL crudo
        const claimRows = await prisma.claim.findMany({
          where: {
            campaign: { is: { organizerId } },
            claimedAt: { gte: start, lte: end },
          },
          select: { claimedAt: true },
        });
        const campRows = await prisma.campaign.findMany({
          where: { organizerId, createdAt: { gte: start, lte: end } },
          select: { createdAt: true },
        });

        const claimsMap = new Map<string, number>();
        claimRows.forEach(r => {
          const k = toYM(r.claimedAt);
          claimsMap.set(k, (claimsMap.get(k) ?? 0) + 1);
        });
        const campsMap = new Map<string, number>();
        campRows.forEach(r => {
          const k = toYM(r.createdAt);
          campsMap.set(k, (campsMap.get(k) ?? 0) + 1);
        });

        const out: { month: string; claims: number; campaigns: number }[] = [];
        for (let i = 0; i < months; i++) {
          const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
          const key = toYM(d);
          const label = d.toLocaleString('en-US', { month: 'short' });
          out.push({
            month: label,
            claims: claimsMap.get(key) ?? 0,
            campaigns: campsMap.get(key) ?? 0,
          });
        }
        return res.json(out);
      } catch (e2) {
        console.error('Fallback Prisma también falló:', e2);
        return res.status(500).json({ success: false, error: 'Failed to fetch monthly trend' });
      }
    }
  }

  // ✅ NUEVO MÉTODO PARA ACTIVIDAD RECIENTE
  async getRecentActivity(req: AuthenticatedRequest, res: Response) {
    try {
      const organizerId = req.user!.organizerId;
      const limit = Number(req.query.limit) || 10;

      // Obtener claims recientes
      const recentClaims = await prisma.claim.findMany({
        where: { 
          campaign: { is: { organizerId } } 
        },
        include: { 
          campaign: { 
            select: { 
              name: true, 
              eventDate: true,
              location: true 
            } 
          } 
        },
        orderBy: { claimedAt: 'desc' },
        take: limit
      });

      // Obtener campañas recientes creadas
      const recentCampaigns = await prisma.campaign.findMany({
        where: { organizerId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          eventDate: true,
          location: true
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });

      // Formatear actividad reciente
      const activities: RecentActivity[] = [];

      // Agregar claims recientes
      recentClaims.forEach(claim => {
        activities.push({
          id: `claim-${claim.id}`,
          type: 'claim',
          title: 'New POAP claimed',
          description: `${claim.campaign.name} • ${this.getTimeAgo(claim.claimedAt)}`,
          timestamp: claim.claimedAt,
          campaignName: claim.campaign.name,
          userWallet: claim.userPublicKey,
          icon: '🏅',
          badge: '+1',
          badgeVariant: 'success'
        });
      });

      // Agregar campañas recientes
      recentCampaigns.forEach(campaign => {
        activities.push({
          id: `campaign-${campaign.id}`,
          type: 'campaign',
          title: 'Campaign created',
          description: `${campaign.name} • ${this.getTimeAgo(campaign.createdAt)}`,
          timestamp: campaign.createdAt,
          campaignName: campaign.name,
          icon: '🎪',
          badge: 'New',
          badgeVariant: 'default'
        });
      });

      // Ordenar por timestamp y tomar los más recientes
      const sortedActivities = activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      return res.json({
        success: true,
        data: {
          activities: sortedActivities,
          total: activities.length
        }
      });
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch recent activity' 
      });
    }
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
  }
  
}