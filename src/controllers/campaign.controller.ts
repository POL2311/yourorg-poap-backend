// src/controllers/campaign.controller.ts
import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { AuthenticatedRequest } from '../middleware/auth.middleware'

const prisma = new PrismaClient()

/* ==============================
   Schemas
   ============================== */
const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  eventDate: z.string().datetime(),
  location: z.string().max(100).optional(),
  imageUrl: z.string().url().optional(),
  externalUrl: z.string().url().optional(),
  maxClaims: z.number().int().positive().optional(),
  secretCode: z.string().min(4).max(50).optional(),
  metadata: z
    .object({
      attributes: z
        .array(
          z.object({
            trait_type: z.string(),
            value: z.string(),
          })
        )
        .optional(),
    })
    .optional(),
})

export class CampaignController {
  /* ==============================
     ORGANIZER: CREATE
     ============================== */
  static async createCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const validated = createCampaignSchema.parse(req.body)
      const organizerId = req.user?.organizerId ?? req.organizer?.id
      if (!organizerId) {
        return res.status(401).json({ success: false, error: 'Authentication required' })
      }

      const campaign = await prisma.campaign.create({
        data: {
          ...validated,
          organizerId,
          eventDate: new Date(validated.eventDate),
          isActive: true,
        },
      })

      return res.status(201).json({ success: true, data: campaign })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: error.errors })
      }
      console.error('Error creating campaign:', error)
      return res.status(500).json({ success: false, error: 'Failed to create campaign' })
    }
  }

  /* ==============================
     ORGANIZER: LIST (propias)
     ============================== */
  static async listCampaigns(req: AuthenticatedRequest, res: Response) {
    try {
      const organizerId = req.user?.organizerId ?? req.organizer?.id
      if (!organizerId) {
        return res.status(401).json({ success: false, error: 'Authentication required' })
      }

      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 50
      const search = (req.query.search as string) || ''
      const isActive =
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined

      const where: any = { organizerId }
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ]
      }
      if (isActive !== undefined) where.isActive = isActive

      const total = await prisma.campaign.count({ where })
      const campaigns = await prisma.campaign.findMany({
        where,
        include: { _count: { select: { claims: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      })

      return res.json({
        success: true,
        data: {
          campaigns,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      })
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      return res.status(500).json({ success: false, error: 'Failed to fetch campaigns' })
    }
  }

  /* ==============================
     PUBLIC: LIST (Market)
     ============================== */
  static async listPublicCampaigns(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
      const search = (req.query.search as string) || ''
      const organizerId = (req.query.organizerId as string) || undefined
      const sort = (req.query.sort as string) || 'recent' // 'recent' | 'popular' | 'upcoming'

      const where: any = { isActive: true }
      if (organizerId) where.organizerId = organizerId
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ]
      }

      // Orden
      let orderBy: any = { createdAt: 'desc' }
      if (sort === 'popular') {
        orderBy = { claims: { _count: 'desc' } }
      } else if (sort === 'upcoming') {
        orderBy = { eventDate: 'asc' }
      }

      const total = await prisma.campaign.count({ where })
      const campaigns = await prisma.campaign.findMany({
        where,
        include: {
          _count: { select: { claims: true } },
          organizer: { select: { id: true, name: true, company: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      })

      // Enriquecer con claimsRemaining
      const items = campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        eventDate: c.eventDate,
        location: c.location,
        imageUrl: c.imageUrl,
        externalUrl: c.externalUrl,
        maxClaims: c.maxClaims,
        isActive: c.isActive,
        createdAt: c.createdAt,
        organizer: c.organizer,
        totalClaims: c._count.claims,
        claimsRemaining: c.maxClaims != null ? Math.max(0, c.maxClaims - c._count.claims) : null,
      }))

      return res.json({
        success: true,
        data: {
          campaigns: items,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      })
    } catch (error) {
      console.error('Error fetching public campaigns:', error)
      return res.status(500).json({ success: false, error: 'Failed to fetch public campaigns' })
    }
  }

  /* ==============================
     ORGANIZER: GET ONE
     ============================== */
  static async getCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params
      const organizerId = req.user?.organizerId ?? req.organizer?.id
      if (!organizerId) return res.status(401).json({ success: false, error: 'Authentication required' })

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizerId },
        include: {
          claims: { orderBy: { claimedAt: 'desc' }, take: 50 },
          _count: { select: { claims: true } },
        },
      })

      if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' })
      return res.json({ success: true, data: campaign })
    } catch (error) {
      console.error('Error fetching campaign:', error)
      return res.status(500).json({ success: false, error: 'Failed to fetch campaign' })
    }
  }

  /* ==============================
     ORGANIZER: UPDATE
     ============================== */
  static async updateCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params
      const organizerId = req.user?.organizerId ?? req.organizer?.id
      if (!organizerId) return res.status(401).json({ success: false, error: 'Authentication required' })

      const exists = await prisma.campaign.findFirst({ where: { id: campaignId, organizerId } })
      if (!exists) return res.status(404).json({ success: false, error: 'Campaign not found' })

      const updateData = req.body
      const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          ...updateData,
          eventDate: updateData.eventDate ? new Date(updateData.eventDate) : undefined,
          updatedAt: new Date(),
        },
      })

      return res.json({ success: true, data: updated })
    } catch (error) {
      console.error('Error updating campaign:', error)
      return res.status(500).json({ success: false, error: 'Failed to update campaign' })
    }
  }

  /* ==============================
     ORGANIZER: DELETE
     ============================== */
  static async deleteCampaign(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params
      const organizerId = req.user?.organizerId ?? req.organizer?.id
      if (!organizerId) return res.status(401).json({ success: false, error: 'Authentication required' })

      const exists = await prisma.campaign.findFirst({ where: { id: campaignId, organizerId } })
      if (!exists) return res.status(404).json({ success: false, error: 'Campaign not found' })

      await prisma.campaign.delete({ where: { id: campaignId } })
      return res.json({ success: true, message: 'Campaign deleted successfully' })
    } catch (error) {
      console.error('Error deleting campaign:', error)
      return res.status(500).json({ success: false, error: 'Failed to delete campaign' })
    }
  }

  /* ==============================
     ORGANIZER: ANALYTICS
     ============================== */
  static async getCampaignAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params
      const organizerId = req.user?.organizerId ?? req.organizer?.id
      if (!organizerId) return res.status(401).json({ success: false, error: 'Authentication required' })

      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizerId } })
      if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' })

      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const [totalClaims, todayClaims, weekClaims, monthClaims, recentClaims, totalGasCost] = await Promise.all([
        prisma.claim.count({ where: { campaignId } }),
        prisma.claim.count({ where: { campaignId, claimedAt: { gte: today } } }),
        prisma.claim.count({ where: { campaignId, claimedAt: { gte: thisWeek } } }),
        prisma.claim.count({ where: { campaignId, claimedAt: { gte: thisMonth } } }),
        prisma.claim.findMany({
          where: { campaignId, claimedAt: { gte: thirtyDaysAgo } },
          orderBy: { claimedAt: 'asc' },
        }),
        prisma.claim.aggregate({ where: { campaignId }, _sum: { gasCost: true } }),
      ])

      const remaining = campaign.maxClaims ? Math.max(0, campaign.maxClaims - totalClaims) : null
      const totalGas = totalGasCost._sum.gasCost || 0
      const averageGas = totalClaims > 0 ? totalGas / totalClaims : 0

      const dailyClaims = CampaignController.groupClaimsByDay(recentClaims)

      return res.json({
        success: true,
        data: {
          campaign: { id: campaign.id, name: campaign.name, maxClaims: campaign.maxClaims },
          claims: { total: totalClaims, today: todayClaims, thisWeek: weekClaims, thisMonth: monthClaims, remaining },
          gas: { totalCost: totalGas, averageCost: averageGas, totalCostSOL: totalGas / 1e9 },
          dailyClaims,
        },
      })
    } catch (error) {
      console.error('Error fetching campaign analytics:', error)
      return res.status(500).json({ success: false, error: 'Failed to fetch campaign analytics' })
    }
  }

  /* ==============================
     ORGANIZER: CLAIMS (paginado)
     ============================== */
  static async getCampaignClaims(req: AuthenticatedRequest, res: Response) {
    try {
      const { campaignId } = req.params
      const organizerId = req.user?.organizerId ?? req.organizer?.id
      if (!organizerId) return res.status(401).json({ success: false, error: 'Authentication required' })

      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizerId } })
      if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' })

      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 100

      const total = await prisma.claim.count({ where: { campaignId } })
      const claims = await prisma.claim.findMany({
        where: { campaignId },
        orderBy: { claimedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      })

      return res.json({
        success: true,
        data: {
          campaign: { id: campaign.id, name: campaign.name },
          claims,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      })
    } catch (error) {
      console.error('Error fetching campaign claims:', error)
      return res.status(500).json({ success: false, error: 'Failed to fetch campaign claims' })
    }
  }

  /* ==============================
     Util
     ============================== */
  private static groupClaimsByDay(claims: Array<{ claimedAt: Date }>) {
    const grouped = new Map<string, number>()
    claims.forEach((c) => {
      const date = new Date(c.claimedAt).toISOString().split('T')[0]
      grouped.set(date, (grouped.get(date) || 0) + 1)
    })
    return Array.from(grouped.entries()).map(([date, claims]) => ({ date, claims }))
  }

  /* ==============================
     (Opcional) PUBLIC claim (mock)
     ============================== */
  static async claimPOAP(req: Request, res: Response) {
    try {
      const { campaignId } = req.params
      const { userPublicKey, secretCode } = req.body
      if (!userPublicKey) return res.status(400).json({ success: false, error: 'userPublicKey is required' })

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { organizer: true, _count: { select: { claims: true } } },
      })
      if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' })
      if (!campaign.isActive) return res.status(400).json({ success: false, error: 'Campaign is not active' })

      if (campaign.secretCode && campaign.secretCode !== secretCode) {
        return res.status(400).json({ success: false, error: 'Invalid secret code' })
      }
      if (campaign.maxClaims && campaign._count.claims >= campaign.maxClaims) {
        return res.status(400).json({ success: false, error: 'Campaign has reached maximum claims' })
      }

      const existing = await prisma.claim.findFirst({ where: { campaignId, userPublicKey } })
      if (existing) return res.status(400).json({ success: false, error: 'POAP already claimed by this user' })

      // TODO: integrar minteo real y guardar mintAddress/transactionHash
      const claim = await prisma.claim.create({
        data: { campaignId, userPublicKey, claimedAt: new Date() },
      })

      return res.status(201).json({
        success: true,
        data: {
          message: 'POAP claimed successfully!',
          claim,
          campaign: {
            name: campaign.name,
            description: campaign.description,
            eventDate: campaign.eventDate,
          },
        },
      })
    } catch (error) {
      console.error('Error claiming POAP:', error)
      return res.status(500).json({ success: false, error: 'Failed to claim POAP' })
    }
  }
}
