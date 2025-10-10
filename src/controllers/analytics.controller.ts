import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

export class AnalyticsController {
  async getDashboardStats(req: AuthenticatedRequest, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
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
          where: { organizationId }
        }),

        // Active campaigns
        prisma.campaign.count({
          where: { organizationId, isActive: true }
        }),

        // Total claims
        prisma.poapClaim.count({
          where: {
            campaign: { organizationId }
          }
        }),

        // Claims in last 30 days
        prisma.poapClaim.count({
          where: {
            campaign: { organizationId },
            claimedAt: { gte: thirtyDaysAgo }
          }
        }),

        // Top campaigns by claims
        prisma.campaign.findMany({
          where: { organizationId },
          include: {
            _count: { select: { claims: true } }
          },
          orderBy: {
            claims: { _count: 'desc' }
          },
          take: 5
        }),

        // Recent activity
        prisma.poapClaim.findMany({
          where: {
            campaign: { organizationId }
          },
          include: {
            campaign: { select: { name: true } }
          },
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
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch dashboard stats'
      });
    }
  }

  async getCampaignAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params;
      const organizationId = req.user!.organizationId;

      // Verify campaign belongs to organization
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizationId }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      // Get claims over time (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const claimsOverTime = await prisma.poapClaim.groupBy({
        by: ['claimedAt'],
        where: {
          campaignId,
          claimedAt: { gte: thirtyDaysAgo }
        },
        _count: true,
        orderBy: { claimedAt: 'asc' }
      });

      // Process data for charts
      const dailyClaims = this.groupClaimsByDay(claimsOverTime);

      // Get total stats
      const [totalClaims, uniqueUsers] = await Promise.all([
        prisma.poapClaim.count({ where: { campaignId } }),
        prisma.poapClaim.groupBy({
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
          charts: {
            dailyClaims
          }
        }
      });
    } catch (error) {
      console.error('Error fetching campaign analytics:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch campaign analytics'
      });
    }
  }

  private groupClaimsByDay(claims: any[]) {
    const grouped = new Map<string, number>();
    
    claims.forEach(claim => {
      const date = new Date(claim.claimedAt).toISOString().split('T')[0];
      grouped.set(date, (grouped.get(date) || 0) + claim._count);
    });

    return Array.from(grouped.entries()).map(([date, count]) => ({
      date,
      claims: count
    }));
  }

  async getSystemHealth(req: Request, res: Response) {
    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;

      // Get relayer balance (if available)
      let relayerBalance = 0;
      try {
        // This would integrate with your Solana service
        // relayerBalance = await this.solanaService.getRelayerBalance();
      } catch (error) {
        console.warn('Could not fetch relayer balance:', error);
      }

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
      return res.status(500).json({
        success: false,
        error: 'System health check failed'
      });
    }
  }
}