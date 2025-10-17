// src/controllers/analytics.controller.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

export class AnalyticsController {
  // DASHBOARD OVERVIEW
  async getDashboardStats(req: AuthenticatedRequest, res: Response) {
    try {
      const organizerId = req.user?.organizerId ?? req.organizer?.id;
      if (!organizerId) return res.status(401).json({ success: false, error: 'Authentication required' });

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [totalCampaigns, activeCampaigns, totalClaims, claimsLast30Days, topCampaigns, recentActivity] =
        await Promise.all([
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
          overview: { totalCampaigns, activeCampaigns, totalClaims, claimsLast30Days },
          topCampaigns: topCampaigns.map(c => ({ id: c.id, name: c.name, totalClaims: c._count.claims, eventDate: c.eventDate })),
          recentActivity: recentActivity.map(cl => ({
            id: cl.id,
            campaignName: cl.campaign.name,
            userPublicKey: cl.userPublicKey,
            claimedAt: cl.claimedAt
          }))
        }
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
    }
  }

  // DAILY CLAIMS (para charts del dashboard)
  async getDailyClaims(req: AuthenticatedRequest, res: Response) {
    try {
      const organizerId = req.user?.organizerId ?? req.organizer?.id;
      if (!organizerId) return res.status(401).json({ success: false, error: 'Authentication required' });

      const tz = (req.query.tz as string) || 'America/Mexico_City';
      const end = new Date();
      const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);

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
      rows.forEach(r => map.set(new Date(r.d).toISOString().slice(0, 10), Number(r.claims)));

      const out: { date: string; claims: number }[] = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const k = d.toISOString().slice(0, 10);
        out.push({ date: k, claims: map.get(k) ?? 0 });
      }

      return res.json(out);
    } catch (error) {
      console.error('Error fetching daily claims:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch daily claims' });
    }
  }

  // MONTHLY TREND (claims & campaigns)
  async getMonthlyTrend(req: AuthenticatedRequest, res: Response) {
    try {
      const organizerId = req.user?.organizerId ?? req.organizer?.id;
      if (!organizerId) return res.status(401).json({ success: false, error: 'Authentication required' });

      const tz = (req.query.tz as string) || 'America/Mexico_City';
      const months = Number(req.query.months || 6);

      const end = new Date();
      const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);

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

      const out: { month: string; claims: number; campaigns: number }[] = [];
      for (let i = 0; i < months; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const key = d.toISOString().slice(0, 7);
        const label = d.toLocaleString('en-US', { month: 'short' });
        out.push({ month: label, claims: cMap.get(key) ?? 0, campaigns: pMap.get(key) ?? 0 });
      }

      return res.json(out);
    } catch (error) {
      console.error('Error fetching monthly trend:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch monthly trend' });
    }
  }

  // SIMPLE HEALTH
  async getSystemHealth(req: Request, res: Response) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({
        success: true,
        data: {
          database: 'healthy',
          relayerBalance: 0,
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        }
      });
    } catch (error) {
      console.error('Health check failed:', error);
      return res.status(500).json({ success: false, error: 'System health check failed' });
    }
  }
}
