// backend/src/controllers/poap.controller.ts - COMPLETE POAP INFRASTRUCTURE
import { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { NFTMintService } from '../services/nft-mint.service';
import { POAPService } from '../services/poap.service';
import { AuthService } from '../services/auth.service';
import { EmailService } from '../services/email.service';
import { AnalyticsService } from '../services/analytics.service';

export class POAPController {
  private nftMintService: NFTMintService;
  private poapService: POAPService;
  private authService: AuthService;
  private emailService: EmailService;
  private analyticsService: AnalyticsService;

  constructor() {
    this.nftMintService = new NFTMintService();
    this.poapService = new POAPService();
    this.authService = new AuthService();
    this.emailService = new EmailService();
    this.analyticsService = new AnalyticsService();
  }

  /**
   * 🏅 MAIN POAP CLAIMING ENDPOINT
   * Public endpoint for attendees to claim POAPs
   */
  claimPOAP = async (req: Request, res: Response) => {
    try {
      const { 
        userWallet, 
        campaignId, 
        secretCode,
        userEmail,
        location,
        referrer
      } = req.body;

      console.log('🏅 POAP CLAIM STARTED');
      console.log(`👤 User: ${userWallet}`);
      console.log(`🎪 Campaign: ${campaignId}`);
      console.log(`📧 Email: ${userEmail}`);

      // 1. Get campaign details
      const campaign = await this.poapService.getCampaign(campaignId);
      if (!campaign || !campaign.isActive) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found or inactive',
          code: 'CAMPAIGN_NOT_FOUND'
        });
      }

      // 2. Get organizer details
      const organizer = await this.poapService.getOrganizer(campaign.organizerId);
      if (!organizer || !organizer.isActive) {
        return res.status(404).json({
          success: false,
          error: 'Event organizer not found',
          code: 'ORGANIZER_NOT_FOUND'
        });
      }

      // 3. Check subscription limits
      if (organizer.usedPOAPsThisMonth >= organizer.monthlyPOAPLimit) {
        return res.status(429).json({
          success: false,
          error: 'Organizer has reached monthly POAP limit',
          code: 'MONTHLY_LIMIT_EXCEEDED'
        });
      }

      // 4. Validate claim timing
      const now = new Date();
      if (now < campaign.claimStartDate) {
        return res.status(400).json({
          success: false,
          error: 'Claiming has not started yet',
          code: 'CLAIMING_NOT_STARTED',
          data: { claimStartDate: campaign.claimStartDate }
        });
      }

      if (now > campaign.claimEndDate) {
        return res.status(400).json({
          success: false,
          error: 'Claiming period has ended',
          code: 'CLAIMING_ENDED',
          data: { claimEndDate: campaign.claimEndDate }
        });
      }

      // 5. Verify claim method requirements
      const claimValidation = await this.validateClaimMethod(campaign, {
        secretCode,
        userWallet,
        userEmail
      });

      if (!claimValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: claimValidation.error,
          code: claimValidation.code
        });
      }

      // 6. Check if already claimed
      const existingClaim = await this.poapService.hasUserClaimed(campaignId, userWallet);
      if (existingClaim) {
        return res.status(400).json({
          success: false,
          error: 'POAP already claimed for this event',
          code: 'ALREADY_CLAIMED',
          data: {
            claimedAt: existingClaim.claimedAt,
            nftMint: existingClaim.nftMint,
            transactionSignature: existingClaim.transactionSignature
          }
        });
      }

      // 7. Check supply limit
      if (campaign.maxSupply && campaign.totalClaimed >= campaign.maxSupply) {
        return res.status(400).json({
          success: false,
          error: 'Maximum supply reached for this POAP',
          code: 'MAX_SUPPLY_REACHED',
          data: { maxSupply: campaign.maxSupply, totalClaimed: campaign.totalClaimed }
        });
      }

      // 8. Create enhanced POAP metadata
      const poapMetadata = this.createPOAPMetadata(campaign, organizer, {
        userWallet,
        claimNumber: campaign.totalClaimed + 1
      });

      // 9. Mint POAP NFT
      const user = new PublicKey(userWallet);
      const mintResult = await this.nftMintService.mintNFTToUser(
        user,
        poapMetadata
      );

      if (!mintResult.success) {
        console.error('❌ POAP minting failed:', mintResult.error);
        return res.status(500).json({
          success: false,
          error: mintResult.error || 'Failed to mint POAP',
          code: 'MINTING_FAILED'
        });
      }

      // 10. Record claim in database
      const claimRecord = await this.poapService.recordClaim({
        campaignId,
        userWallet,
        userEmail,
        nftMint: mintResult.mintAddress!,
        transactionSignature: mintResult.transactionSignature!,
        claimMethod: campaign.claimMethod,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        location,
        metadata: {
          referrer,
          claimNumber: campaign.totalClaimed + 1,
          gasCost: mintResult.gasCost
        }
      });

      // 11. Update campaign and organizer stats
      await Promise.all([
        this.poapService.incrementClaimCount(campaignId),
        this.poapService.incrementOrganizerUsage(organizer.id)
      ]);

      // 12. Send confirmation email (if email provided)
      if (userEmail) {
        this.emailService.sendPOAPConfirmation({
          email: userEmail,
          campaignName: campaign.name,
          nftMint: mintResult.mintAddress!,
          transactionSignature: mintResult.transactionSignature!,
          organizerBranding: organizer.customBranding
        }).catch(console.error); // Don't block response on email failure
      }

      // 13. Track analytics
      this.analyticsService.trackPOAPClaim({
        campaignId,
        organizerId: organizer.id,
        userWallet,
        claimMethod: campaign.claimMethod,
        location,
        timestamp: new Date()
      }).catch(console.error);

      console.log('🎉 POAP CLAIMED SUCCESSFULLY!');
      console.log(`🎨 Mint: ${mintResult.mintAddress}`);
      console.log(`📦 TX: ${mintResult.transactionSignature}`);

      res.status(201).json({
        success: true,
        data: {
          message: '🏅 POAP badge claimed successfully!',
          campaign: {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            eventDate: campaign.eventDate,
            location: campaign.location,
            organizer: {
              name: organizer.name,
              company: organizer.company
            }
          },
          nft: {
            mint: mintResult.mintAddress,
            tokenAccount: mintResult.userTokenAccount,
            transactionSignature: mintResult.transactionSignature,
            explorerUrl: `https://explorer.solana.com/tx/${mintResult.transactionSignature}?cluster=devnet`
          },
          metadata: poapMetadata,
          claimNumber: campaign.totalClaimed + 1,
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
  };

  /**
   * 🎪 Create new POAP campaign (Organizer only)
   */
  createCampaign = async (req: Request, res: Response) => {
    try {
      const organizerId = req.user?.id; // From auth middleware
      
      const {
        name,
        description,
        eventDate,
        location,
        timezone,
        image,
        maxSupply,
        claimStartDate,
        claimEndDate,
        claimMethod,
        secretCode,
        whitelistedWallets,
        whitelistedEmails,
        tags,
        category,
        customMetadata
      } = req.body;

      // Validate organizer subscription
      const organizer = await this.poapService.getOrganizer(organizerId);
      if (!organizer || !organizer.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Invalid organizer account',
          code: 'INVALID_ORGANIZER'
        });
      }

      // Create campaign
      const campaign = await this.poapService.createCampaign({
        organizerId,
        name,
        description,
        eventDate: new Date(eventDate),
        location,
        timezone,
        image,
        maxSupply,
        claimStartDate: new Date(claimStartDate),
        claimEndDate: new Date(claimEndDate),
        claimMethod,
        secretCode,
        whitelistedWallets,
        whitelistedEmails,
        tags: tags || [],
        category,
        customMetadata
      });

      // Generate widget embed code
      const widgetCode = this.generateWidgetCode(campaign.id, organizer.customBranding);

      res.status(201).json({
        success: true,
        data: {
          campaign,
          widgetCode,
          claimUrl: `${process.env.FRONTEND_URL}/claim/${campaign.id}`,
          qrCodeUrl: `${process.env.API_URL}/api/campaigns/${campaign.id}/qr`
        }
      });

    } catch (error) {
      console.error('❌ Error creating campaign:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  };

  /**
   * 📊 Get campaign analytics
   */
  getCampaignAnalytics = async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;
      const organizerId = req.user?.id;

      // Verify ownership
      const campaign = await this.poapService.getCampaign(campaignId);
      if (!campaign || campaign.organizerId !== organizerId) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
          code: 'CAMPAIGN_NOT_FOUND'
        });
      }

      const analytics = await this.analyticsService.getCampaignAnalytics(campaignId);
      
      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      console.error('❌ Error getting analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  /**
   * 🔍 Get public campaign info (for widget)
   */
  getPublicCampaignInfo = async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;

      const campaign = await this.poapService.getCampaign(campaignId);
      if (!campaign || !campaign.isActive) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found',
          code: 'CAMPAIGN_NOT_FOUND'
        });
      }

      const organizer = await this.poapService.getOrganizer(campaign.organizerId);

      // Return public info only
      res.json({
        success: true,
        data: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          eventDate: campaign.eventDate,
          location: campaign.location,
          image: campaign.image,
          maxSupply: campaign.maxSupply,
          totalClaimed: campaign.totalClaimed,
          claimStartDate: campaign.claimStartDate,
          claimEndDate: campaign.claimEndDate,
          claimMethod: campaign.claimMethod,
          category: campaign.category,
          tags: campaign.tags,
          organizer: {
            name: organizer?.name,
            company: organizer?.company,
            branding: organizer?.customBranding
          },
          isClaimable: this.isCampaignClaimable(campaign),
          remainingSupply: campaign.maxSupply ? campaign.maxSupply - campaign.totalClaimed : null
        }
      });

    } catch (error) {
      console.error('❌ Error getting public campaign info:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  // Helper methods
  private async validateClaimMethod(campaign: any, claimData: any) {
    switch (campaign.claimMethod) {
      case 'open':
        return { isValid: true };
      
      case 'code':
        if (!claimData.secretCode || claimData.secretCode !== campaign.secretCode) {
          return { 
            isValid: false, 
            error: 'Invalid or missing secret code',
            code: 'INVALID_SECRET_CODE'
          };
        }
        return { isValid: true };
      
      case 'whitelist':
        if (!campaign.whitelistedWallets?.includes(claimData.userWallet)) {
          return { 
            isValid: false, 
            error: 'Wallet not whitelisted for this event',
            code: 'WALLET_NOT_WHITELISTED'
          };
        }
        return { isValid: true };
      
      case 'email':
        if (!claimData.userEmail || !campaign.whitelistedEmails?.includes(claimData.userEmail)) {
          return { 
            isValid: false, 
            error: 'Email not whitelisted for this event',
            code: 'EMAIL_NOT_WHITELISTED'
          };
        }
        return { isValid: true };
      
      default:
        return { isValid: true };
    }
  }

  private createPOAPMetadata(campaign: any, organizer: any, claimData: any) {
    return {
      name: `${campaign.name} - POAP #${claimData.claimNumber}`,
      symbol: 'POAP',
      description: `${campaign.description}\n\n🎪 Event: ${campaign.name}\n📅 Date: ${campaign.eventDate.toDateString()}\n📍 Location: ${campaign.location || 'Virtual'}\n🏢 Organizer: ${organizer.name}${organizer.company ? ` (${organizer.company})` : ''}\n🏅 Badge #${claimData.claimNumber}`,
      image: campaign.image,
      external_url: `${process.env.FRONTEND_URL}/poap/${campaign.id}`,
      attributes: [
        { trait_type: 'Event', value: campaign.name },
        { trait_type: 'Date', value: campaign.eventDate.toISOString().split('T')[0] },
        { trait_type: 'Location', value: campaign.location || 'Virtual' },
        { trait_type: 'Category', value: campaign.category },
        { trait_type: 'Organizer', value: organizer.name },
        { trait_type: 'Badge Number', value: claimData.claimNumber.toString() },
        { trait_type: 'Claim Method', value: campaign.claimMethod },
        { trait_type: 'Network', value: 'Solana' },
        { trait_type: 'Standard', value: 'POAP' },
        ...campaign.tags.map((tag: string) => ({ trait_type: 'Tag', value: tag }))
      ],
      properties: {
        category: 'POAP',
        creators: [
          {
            address: organizer.walletAddress,
            share: 100
          }
        ]
      }
    };
  }

  private generateWidgetCode(campaignId: string, branding?: any) {
    const theme = branding ? 'custom' : 'default';
    return `<!-- POAP Widget -->
<div id="poap-widget-${campaignId}"></div>
<script>
  (function() {
    var script = document.createElement('script');
    script.src = '${process.env.WIDGET_CDN_URL}/widget.js';
    script.onload = function() {
      POAPWidget.init({
        campaignId: '${campaignId}',
        theme: '${theme}',
        apiUrl: '${process.env.API_URL}',
        ${branding ? `customBranding: ${JSON.stringify(branding)},` : ''}
      });
    };
    document.head.appendChild(script);
  })();
</script>`;
  }

  private isCampaignClaimable(campaign: any): boolean {
    const now = new Date();
    return campaign.isActive && 
           now >= campaign.claimStartDate && 
           now <= campaign.claimEndDate &&
           (!campaign.maxSupply || campaign.totalClaimed < campaign.maxSupply);
  }
}