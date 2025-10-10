import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  eventDate: z.string().datetime(),
  location: z.string().max(100),
  maxClaims: z.number().int().positive().optional(),
  secretCode: z.string().min(4).max(50).optional(),
  isActive: z.boolean().default(true),
  metadata: z.object({
    image: z.string().url().optional(),
    externalUrl: z.string().url().optional(),
    attributes: z.array(z.object({
      trait_type: z.string(),
      value: z.string()
    })).optional()
  }).optional()
});

export class CampaignController {
  static async createCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const validatedData = createCampaignSchema.parse(req.body);
      
      const campaign = await prisma.campaign.create({
        data: {
          ...validatedData,
          organizationId: req.user!.organizationId,
          createdBy: req.user!.id,
          eventDate: new Date(validatedData.eventDate),
        }
      });

      return res.status(201).json({
        success: true,
        data: campaign
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      console.error('Error creating campaign:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create campaign'
      });
    }
  }

  static async listCampaigns(req: AuthenticatedRequest, res: Response) {
    try {
      const campaigns = await prisma.campaign.findMany({
        where: {
          organizationId: req.user!.organizationId
        },
        include: {
          _count: {
            select: { claims: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json({
        success: true,
        data: campaigns
      });
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch campaigns'
      });
    }
  }

  static async getCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params;

      const campaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          organizationId: req.user!.organizationId
        },
        include: {
          claims: {
            orderBy: { createdAt: 'desc' },
            take: 50
          },
          _count: {
            select: { claims: true }
          }
        }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      return res.json({
        success: true,
        data: campaign
      });
    } catch (error) {
      console.error('Error fetching campaign:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch campaign'
      });
    }
  }

  static async updateCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params;
      const updateData = req.body;

      // Verify campaign belongs to organization
      const existingCampaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          organizationId: req.user!.organizationId
        }
      });

      if (!existingCampaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          ...updateData,
          eventDate: updateData.eventDate ? new Date(updateData.eventDate) : undefined,
          updatedAt: new Date()
        }
      });

      return res.json({
        success: true,
        data: updatedCampaign
      });
    } catch (error) {
      console.error('Error updating campaign:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update campaign'
      });
    }
  }

  static async deleteCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params;

      // Verify campaign belongs to organization
      const existingCampaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          organizationId: req.user!.organizationId
        }
      });

      if (!existingCampaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      await prisma.campaign.delete({
        where: { id: campaignId }
      });

      return res.json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete campaign'
      });
    }
  }

  static async getCampaignAnalytics(req: AuthenticatedRequest, res: Response) {
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
      
      const [totalClaims, uniqueUsers, recentClaims] = await Promise.all([
        prisma.poapClaim.count({ where: { campaignId } }),
        prisma.poapClaim.groupBy({
          by: ['userPublicKey'],
          where: { campaignId }
        }).then(groups => groups.length),
        prisma.poapClaim.findMany({
          where: {
            campaignId,
            claimedAt: { gte: thirtyDaysAgo }
          },
          orderBy: { claimedAt: 'asc' }
        })
      ]);

      // Process data for charts
      const dailyClaims = this.groupClaimsByDay(recentClaims);

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

  static async getCampaignClaims(req: AuthenticatedRequest, res: Response) {
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

      const claims = await prisma.poapClaim.findMany({
        where: { campaignId },
        orderBy: { claimedAt: 'desc' },
        take: 100 // Limit to last 100 claims
      });

      return res.json({
        success: true,
        data: {
          campaign: {
            id: campaign.id,
            name: campaign.name
          },
          claims
        }
      });
    } catch (error) {
      console.error('Error fetching campaign claims:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch campaign claims'
      });
    }
  }

  private static groupClaimsByDay(claims: any[]) {
    const grouped = new Map<string, number>();
    
    claims.forEach(claim => {
      const date = new Date(claim.claimedAt).toISOString().split('T')[0];
      grouped.set(date, (grouped.get(date) || 0) + 1);
    });

    return Array.from(grouped.entries()).map(([date, count]) => ({
      date,
      claims: count
    }));
  }

  static async claimPOAP(req: Request, res: Response) {
    try {
      const { campaignId } = req.params;
      const { userPublicKey, secretCode } = req.body;

      if (!userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey is required'
        });
      }

      // Find campaign
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          organization: true,
          _count: { select: { claims: true } }
        }
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      if (!campaign.isActive) {
        return res.status(400).json({
          success: false,
          error: 'Campaign is not active'
        });
      }

      // Check secret code if required
      if (campaign.secretCode && campaign.secretCode !== secretCode) {
        return res.status(400).json({
          success: false,
          error: 'Invalid secret code'
        });
      }

      // Check max claims
      if (campaign.maxClaims && campaign._count.claims >= campaign.maxClaims) {
        return res.status(400).json({
          success: false,
          error: 'Campaign has reached maximum claims'
        });
      }

      // Check if user already claimed
      const existingClaim = await prisma.poapClaim.findFirst({
        where: {
          campaignId,
          userPublicKey
        }
      });

      if (existingClaim) {
        return res.status(400).json({
          success: false,
          error: 'POAP already claimed by this user'
        });
      }

      // TODO: Integrate with NFT minting service
      // const mintResult = await this.nftMintService.mintPOAP(...)

      // Record the claim
      const claim = await prisma.poapClaim.create({
        data: {
          campaignId,
          userPublicKey,
          // mintAddress: mintResult.mintAddress,
          // transactionSignature: mintResult.transactionSignature,
          claimedAt: new Date()
        }
      });

      return res.status(201).json({
        success: true,
        data: {
          message: 'POAP claimed successfully!',
          claim,
          campaign: {
            name: campaign.name,
            description: campaign.description,
            eventDate: campaign.eventDate
          }
        }
      });
    } catch (error) {
      console.error('Error claiming POAP:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to claim POAP'
      });
    }
  }
}