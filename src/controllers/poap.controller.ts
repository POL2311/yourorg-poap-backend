// backend/src/controllers/poap.controller.ts - SIMPLIFIED VERSION
import { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';

export class POAPController {
  /**
   * 🏅 POAP claiming endpoint (simplified)
   */
  static async claimPOAP(req: Request, res: Response) {
    try {
      const { userWallet, campaignId, secretCode } = req.body;

      console.log('🏅 POAP CLAIM STARTED');
      console.log(`👤 User: ${userWallet}`);
      console.log(`🎪 Campaign: ${campaignId}`);

      if (!userWallet) {
        return res.status(400).json({
          success: false,
          error: 'userWallet is required',
          code: 'MISSING_WALLET'
        });
      }

      // Validate wallet format
      try {
        new PublicKey(userWallet);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid wallet address format',
          code: 'INVALID_WALLET'
        });
      }

      // For now, return success (later integrate with database and minting)
      res.status(201).json({
        success: true,
        data: {
          message: '🏅 POAP badge claimed successfully!',
          campaign: {
            id: campaignId || 'demo',
            name: `Demo Campaign ${campaignId || 'Default'}`,
            description: 'This is a demo POAP campaign',
            eventDate: new Date().toISOString(),
            location: 'Virtual',
            organizer: {
              name: 'Demo Organizer',
              company: 'Demo Company'
            }
          },
          nft: {
            mint: 'demo-mint-address',
            tokenAccount: 'demo-token-account',
            transactionSignature: 'demo-transaction',
            explorerUrl: 'https://explorer.solana.com/tx/demo-transaction?cluster=devnet'
          },
          claimNumber: 1,
          claimedAt: new Date().toISOString(),
          estimatedArrivalTime: '1-2 minutes'
        }
      });

    } catch (error) {
      console.error('❌ Error claiming POAP:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * 🎪 Create new POAP campaign (simplified)
   */
  static async createCampaign(req: Request, res: Response) {
    try {
      const {
        name,
        description,
        eventDate,
        location,
        maxSupply,
        claimStartDate,
        claimEndDate,
        secretCode
      } = req.body;

      // For now, return demo campaign (later integrate with database)
      const campaign = {
        id: `campaign_${Date.now()}`,
        name,
        description,
        eventDate,
        location,
        maxSupply,
        claimStartDate,
        claimEndDate,
        secretCode,
        totalClaimed: 0,
        isActive: true,
        createdAt: new Date().toISOString()
      };

      res.status(201).json({
        success: true,
        data: {
          campaign,
          claimUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/claim/${campaign.id}`,
          message: 'Campaign created successfully (demo mode)'
        }
      });

    } catch (error) {
      console.error('❌ Error creating campaign:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * 📊 Get campaign analytics (simplified)
   */
  static async getCampaignAnalytics(req: Request, res: Response) {
    try {
      const { campaignId } = req.params;

      // For now, return demo analytics (later integrate with database)
      res.json({
        success: true,
        data: {
          campaignId,
          totalClaims: 0,
          uniqueClaimers: 0,
          claimsToday: 0,
          claimsThisWeek: 0,
          claimsThisMonth: 0,
          topLocations: [],
          claimsByDay: [],
          message: 'Analytics not implemented yet - database integration needed'
        }
      });

    } catch (error) {
      console.error('❌ Error getting analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * 🔍 Get public campaign info (simplified)
   */
  static async getPublicCampaignInfo(req: Request, res: Response) {
    try {
      const { campaignId } = req.params;

      // For now, return demo campaign info (later integrate with database)
      res.json({
        success: true,
        data: {
          id: campaignId,
          name: `Demo Campaign ${campaignId}`,
          description: 'This is a demo POAP campaign for testing',
          eventDate: new Date().toISOString(),
          location: 'Virtual',
          image: `https://api.dicebear.com/7.x/shapes/svg?seed=${campaignId}`,
          maxSupply: null,
          totalClaimed: 0,
          claimStartDate: new Date().toISOString(),
          claimEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          claimMethod: 'open',
          category: 'demo',
          tags: ['demo', 'test'],
          organizer: {
            name: 'Demo Organizer',
            company: 'Demo Company'
          },
          isClaimable: true,
          remainingSupply: null
        }
      });

    } catch (error) {
      console.error('❌ Error getting public campaign info:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}