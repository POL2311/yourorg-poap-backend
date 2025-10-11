import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

export class AnalyticsController {
  async getDashboardStats(req: AuthenticatedRequest, res: Response) {
    try {
      // Si en tu token viene como organizationId, puedes mapearlo a organizerId aquí:
      const organizerId = req.user!.organizerId; // o req.user!.organizerId si ya lo tienes así

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
        // Total campaigns
        prisma.campaign.count({
          where: { organizerId }
        }),

        // Active campaigns
        prisma.campaign.count({
          where: { organizerId, isActive: true }
        }),

        // Total claims del organizador (vía relación)
        prisma.claim.count({
          where: { campaign: { is: { organizerId } } }
        }),

        // Claims en últimos 30 días
        prisma.claim.count({
          where: {
            campaign: { is: { organizerId } },
            claimedAt: { gte: thirtyDaysAgo }
          }
        }),

        // Top campañas por número de claims
        prisma.campaign.findMany({
          where: { organizerId },
          include: { _count: { select: { claims: true } } },
          orderBy: { claims: { _count: 'desc' } },
          take: 5
        }),

        // Actividad reciente (últimos 10 claims)
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
      const organizerId = req.user!.organizerId; // o organizerId directo

      // Verifica que la campaña pertenezca al organizador
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizerId }
      });

      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaign not found' });
      }

      // Últimos 30 días
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Serie por fecha exacta (luego la agrupamos a día)
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
      const date = new Date(c.claimedAt).toISOString().split('T')[0]; // YYYY-MM-DD
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
}
