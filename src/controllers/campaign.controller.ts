import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CreateCampaignSchema, UpdateCampaignSchema } from '../schemas';

const prisma = new PrismaClient();

export class CampaignController {
  /**
   * Create new campaign
   */
  static async createCampaign(req: Request, res: Response) {
    try {
      const validatedData = CreateCampaignSchema.parse(req.body);
      const organizerId = req.organizer!.id;

      // Check campaign limit based on tier
      const existingCampaigns = await prisma.campaign.count({
        where: { organizerId },
      });

      const tier = req.organizer!.tier;
      const maxCampaigns = tier === 'free' ? 3 : tier === 'pro' ? 50 : 500;

      if (existingCampaigns >= maxCampaigns) {
        return res.status(400).json({
          success: false,
          error: `Maximum campaigns reached for ${tier} tier (${maxCampaigns})`,
        });
      }

      const campaign = await prisma.campaign.create({
        data: {
          ...validatedData,
          eventDate: new Date(validatedData.eventDate),
          organizerId,
        },
        include: {
          organizer: {
            select: {
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              claims: true,
            },
          },
        },
      });

      console.log(`🎪 Campaign created: ${campaign.name} by ${req.organizer!.email}`);

      return res.status(201).json({
        success: true,
        data: {
          ...campaign,
          message: 'Campaign created successfully',
        },
      });
    } catch (error) {
      console.error('❌ Create campaign error:', error);
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create campaign',
      });
    }
  }

  /**
   * List organizer's campaigns
   */
  static async listCampaigns(req: Request, res: Response) {
    try {
      const organizerId = req.organizer!.id;
      const { page = 1, limit = 10, search, isActive } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const where: any = { organizerId };

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
          where,
          skip,
          take,
          include: {
            _count: {
              select: {
                claims: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.campaign.count({ where }),
      ]);

      return res.json({
        success: true,
        data: {
          campaigns,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error('❌ List campaigns error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to list campaigns',
      });
    }
  }

  /**
   * Get campaign by ID
   */
  static async getCampaign(req: Request, res: Response) {
    try {
      const { campaignId } = req.params;
      const organizerId = req.organizer!.id;

      const campaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          organizerId,
        },
        include: {
          organizer: {
            select: {
              name: true,
              email: true,
              company: true,
            },
          },
          _count: {
            select: {
              claims: true,
            },
          },
        },
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
        });
      }

      return res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      console.error('❌ Get campaign error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get campaign',
      });
    }
  }

  /**
   * Update campaign
   */
  static async updateCampaign(req: Request, res: Response) {
    try {
      const { campaignId } = req.params;
      const organizerId = req.organizer!.id;
      const validatedData = UpdateCampaignSchema.parse(req.body);

      const existingCampaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          organizerId,
        },
      });

      if (!existingCampaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
        });
      }

      const updateData: any = { ...validatedData };
      if (validatedData.eventDate) {
        updateData.eventDate = new Date(validatedData.eventDate);
      }

      const campaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: updateData,
        include: {
          _count: {
            select: {
              claims: true,
            },
          },
        },
      });

      console.log(`🎪 Campaign updated: ${campaign.name}`);

      return res.json({
        success: true,
        data: {
          ...campaign,
          message: 'Campaign updated successfully',
        },
      });
    } catch (error) {
      console.error('❌ Update campaign error:', error);
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to update campaign',
      });
    }
  }

  /**
   * Delete campaign
   */
  static async deleteCampaign(req: Request, res: Response) {
    try {
      const { campaignId } = req.params;
      const organizerId = req.organizer!.id;

      const campaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          organizerId,
        },
        include: {
          _count: {
            select: {
              claims: true,
            },
          },
        },
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
        });
      }

      // Prevent deletion if there are claims
      if (campaign._count.claims > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete campaign with ${campaign._count.claims} claims. Deactivate instead.`,
        });
      }

      await prisma.campaign.delete({
        where: { id: campaignId },
      });

      console.log(`🗑️ Campaign deleted: ${campaign.name}`);

      return res.json({
        success: true,
        message: 'Campaign deleted successfully',
      });
    } catch (error) {
      console.error('❌ Delete campaign error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete campaign',
      });
    }
  }

  /**
   * Get campaign analytics
   */
/**
 * Get campaign analytics
 */
static async getCampaignAnalytics(req: Request, res: Response) {
  try {
    const { campaignId } = req.params;
    const organizerId = req.organizer!.id;

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizerId,
      },
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    // 📊 Claims counts
    const [totalClaims, claimsToday, claimsThisWeek, claimsThisMonth] = await Promise.all([
      prisma.claim.count({
        where: { campaignId },
      }),
      prisma.claim.count({
        where: {
          campaignId,
          claimedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.claim.count({
        where: {
          campaignId,
          claimedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.claim.count({
        where: {
          campaignId,
          claimedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    // 📅 Daily claims (últimos 30 días)
    const dailyClaims = await prisma.$queryRaw<
      { date: string; claims: number }[]
    >`
      SELECT 
        to_char(date_trunc('day', "claimedAt"), 'YYYY-MM-DD') AS date,
        count(*)::int AS claims
      FROM "Claim"
      WHERE "campaignId" = ${campaignId}
        AND "claimedAt" >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1 DESC
    `;

    // ⛽ Gas stats
    const gasStats = await prisma.claim.aggregate({
      where: { campaignId },
      _sum: { gasCost: true },
      _avg: { gasCost: true },
    });

    return res.json({
      success: true,
      data: {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          maxClaims: campaign.maxClaims,
        },
        claims: {
          total: totalClaims,
          today: claimsToday,
          thisWeek: claimsThisWeek,
          thisMonth: claimsThisMonth,
          remaining: campaign.maxClaims ? campaign.maxClaims - totalClaims : null,
        },
        gas: {
          totalCost: gasStats._sum.gasCost || 0,
          averageCost: gasStats._avg.gasCost || 0,
          totalCostSOL: (gasStats._sum.gasCost || 0) / 1e9,
        },
        dailyClaims,
      },
    });
  } catch (error) {
    console.error('❌ Get campaign analytics error:', error);
    // ⚠️ Devuelve un fallback en vez de crashear
    return res.status(200).json({
      success: true,
      data: {
        campaign: null,
        claims: {
          total: 0,
          today: 0,
          thisWeek: 0,
          thisMonth: 0,
          remaining: null,
        },
        gas: {
          totalCost: 0,
          averageCost: 0,
          totalCostSOL: 0,
        },
        dailyClaims: [],
      },
    });
  }
}

  /**
   * Get campaign claims
   */
  static async getCampaignClaims(req: Request, res: Response) {
    try {
      const { campaignId } = req.params;
      const organizerId = req.organizer!.id;
      const { page = 1, limit = 50 } = req.query;

      const campaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          organizerId,
        },
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
        });
      }

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const [claims, total] = await Promise.all([
        prisma.claim.findMany({
          where: { campaignId },
          skip,
          take,
          orderBy: { claimedAt: 'desc' },
        }),
        prisma.claim.count({
          where: { campaignId },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          claims,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error('❌ Get campaign claims error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get campaign claims',
      });
    }
  }
}