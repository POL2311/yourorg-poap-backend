import { Request, Response } from 'express';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { PrismaClient } from '@prisma/client';
import { NFTMintService } from '../services/nft-mint.service';

const prisma = new PrismaClient();

export class MultiTenantNFTController {
  private connection: Connection;
  private nftMintService: NFTMintService;
  private relayerKeypair: Keypair;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60_000,
      disableRetryOnRateLimit: false,
    });

    console.log(`🌐 Connected to: ${rpcUrl}`);

    this.nftMintService = new NFTMintService(this.connection);

    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerPrivateKey) {
      throw new Error('RELAYER_PRIVATE_KEY not configured');
    }

    try {
      const privateKeyArray = JSON.parse(relayerPrivateKey);
      this.relayerKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      console.log(`⚡ Relayer loaded: ${this.relayerKeypair.publicKey.toString()}`);
    } catch (error) {
      console.error('Error loading relayer keypair:', error);
      throw new Error('Invalid RELAYER_PRIVATE_KEY format');
    }
  }

  /**
   * 🏅 Multi-tenant POAP claiming with database integration
   */
  claimPOAP = async (req: Request, res: Response) => {
    try {
      const { userPublicKey, campaignId, secretCode } = req.body;

      console.log('🏅 MULTI-TENANT POAP CLAIM STARTED');
      console.log(`👤 User: ${userPublicKey}`);
      console.log(`🎪 Campaign: ${campaignId}`);
      console.log(`⚡ Relayer: ${this.relayerKeypair.publicKey.toString()}`);

      if (!userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey is required',
        });
      }

      // Validate user public key
      let user: PublicKey;
      try {
        user = new PublicKey(userPublicKey);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid userPublicKey format',
        });
      }

      // Check relayer balance
      const relayerBalance = await this.connection.getBalance(this.relayerKeypair.publicKey);
      console.log(`💰 Relayer balance: ${relayerBalance / 1e9} SOL`);
      
      if (relayerBalance < 0.01 * 1e9) {
        return res.status(500).json({
          success: false,
          error: `Insufficient relayer balance: ${relayerBalance / 1e9} SOL. Need at least 0.01 SOL for minting.`,
        });
      }

      // Get campaign details from database
      const campaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          isActive: true,
        },
        include: {
          organizer: {
            select: {
              name: true,
              email: true,
              company: true,
              tier: true,
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
          error: 'Campaign not found or inactive',
        });
      }

      // Check if user already claimed
      const existingClaim = await prisma.claim.findUnique({
        where: {
          campaignId_userPublicKey: {
            campaignId,
            userPublicKey,
          },
        },
      });

      if (existingClaim) {
        return res.status(400).json({
          success: false,
          error: 'POAP already claimed for this campaign',
          data: {
            claimedAt: existingClaim.claimedAt,
            mintAddress: existingClaim.mintAddress,
            transactionHash: existingClaim.transactionHash,
          },
        });
      }

      // Check max claims limit
      if (campaign.maxClaims && campaign._count.claims >= campaign.maxClaims) {
        return res.status(400).json({
          success: false,
          error: 'Campaign has reached maximum claims limit',
        });
      }

      // Validate secret code if required
      if (campaign.secretCode && secretCode !== campaign.secretCode) {
        return res.status(400).json({
          success: false,
          error: 'Invalid secret code for this campaign'
        });
      }

      // Build POAP metadata
      const seed = campaignId + '-' + userPublicKey.slice(0, 8);
      const imageUrl = campaign.imageUrl || 
        `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=6366f1`;
      
      const poapMetadata = {
        name: `${campaign.name} - POAP`,
        symbol: 'POAP',
        description: `Proof of Attendance for ${campaign.name}\n\n🎪 Event: ${campaign.name}\n📅 Date: ${campaign.eventDate.toISOString().split('T')[0]}\n📍 Location: ${campaign.location || 'Virtual'}\n🏢 Organizer: ${campaign.organizer.name}\n\n✨ This POAP was minted gaslessly on Solana.`,
        image: imageUrl,
        external_url: campaign.externalUrl || `https://poap-infra.com/campaign/${campaignId}`,
        attributes: [
          { trait_type: 'Type', value: 'POAP' },
          { trait_type: 'Event', value: campaign.name },
          { trait_type: 'Date', value: campaign.eventDate.toISOString().split('T')[0] },
          { trait_type: 'Location', value: campaign.location || 'Virtual' },
          { trait_type: 'Organizer', value: campaign.organizer.name },
          { trait_type: 'Campaign ID', value: campaignId },
          { trait_type: 'Network', value: 'Solana' },
          { trait_type: 'Gasless', value: 'true' },
        ],
        properties: {
          category: 'POAP',
          files: [{ uri: imageUrl, type: 'image/svg+xml' }],
        },
      };

      console.log('🎨 Minting POAP with metadata:', poapMetadata);

      // Mint NFT
      const mintResult = await this.nftMintService.mintNFTToUser(user, this.relayerKeypair, poapMetadata);
      
      if (!mintResult.success) {
        console.error('❌ NFT minting failed:', mintResult.error);
        return res.status(500).json({
          success: false,
          error: mintResult.error || 'Failed to mint POAP',
        });
      }

      // Record claim in database
      const claim = await prisma.claim.create({
        data: {
          campaignId,
          userPublicKey,
          mintAddress: mintResult.mintAddress!,
          tokenAccount: mintResult.userTokenAccount!,
          transactionHash: mintResult.transactionSignature!,
          gasCost: mintResult.gasCost,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
          metadata: {},
        },
      });

      console.log('🎉 POAP MINTED SUCCESSFULLY!');
      console.log(`🎨 Mint: ${mintResult.mintAddress}`);
      console.log(`📦 TX: ${mintResult.transactionSignature}`);
      console.log(`💰 Gas cost: ${mintResult.gasCost} lamports`);
      console.log(`🔗 Explorer: https://explorer.solana.com/tx/${mintResult.transactionSignature}?cluster=devnet`);

      return res.status(201).json({
        success: true,
        data: {
          message: '🏅 POAP claimed successfully!',
          campaign: {
            id: campaign.id,
            name: campaign.name,
            organizer: campaign.organizer.name,
            eventDate: campaign.eventDate,
            location: campaign.location,
          },
          nft: {
            mint: mintResult.mintAddress,
            tokenAccount: mintResult.userTokenAccount,
            transactionSignature: mintResult.transactionSignature,
          },
          claim: {
            id: claim.id,
            claimedAt: claim.claimedAt,
          },
          gasCostPaidByRelayer: mintResult.gasCost,
          metadata: poapMetadata,
          explorerUrl: `https://explorer.solana.com/tx/${mintResult.transactionSignature}?cluster=devnet`,
          timestamp: new Date().toISOString(),
          network: 'devnet',
        },
      });
    } catch (error) {
      console.error('❌ Error in multi-tenant POAP claim:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  };

  /**
   * 📊 Get user's POAPs across all campaigns
   */
  getUserPOAPs = async (req: Request, res: Response) => {
    try {
      const { userPublicKey } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (!userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey is required',
        });
      }

      // Validate public key format
      try {
        new PublicKey(userPublicKey);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid userPublicKey format',
        });
      }

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const [claims, total] = await Promise.all([
        prisma.claim.findMany({
          where: { userPublicKey },
          skip,
          take,
          include: {
            campaign: {
              select: {
                id: true,
                name: true,
                description: true,
                eventDate: true,
                location: true,
                imageUrl: true,
                externalUrl: true,
                organizer: {
                  select: {
                    name: true,
                    company: true,
                  },
                },
              },
            },
          },
          orderBy: { claimedAt: 'desc' },
        }),
        prisma.claim.count({
          where: { userPublicKey },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          userPublicKey,
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
      console.error('❌ Error getting user POAPs:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get user POAPs',
      });
    }
  };

  /**
   * 🏆 Get authenticated user's claim statistics and badges
   */
  getUserClaimStatsAuth = async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      console.log('📊 Getting claim stats for authenticated user:', userId);

      // Get total claims count for the authenticated user
      const totalClaims = await prisma.claim.count({
        where: { userId },
      });

      console.log('📈 Total claims found:', totalClaims);

      // Get claims by month for recent activity
      const monthlyClaims = await prisma.$queryRaw<{ month: string; count: bigint }[]>`
        SELECT 
          TO_CHAR("claimedAt", 'YYYY-MM') as month,
          COUNT(*)::bigint as count
        FROM "claims" 
        WHERE "userId" = ${userId}
        GROUP BY TO_CHAR("claimedAt", 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 12
      `;

      // Calculate badges based on claim count
      const badges = this.calculateBadges(totalClaims);

      return res.json({
        success: true,
        data: {
          userId,
          totalClaims,
          monthlyStats: monthlyClaims.map(item => ({
            month: item.month,
            count: Number(item.count)
          })),
          badges,
          level: this.calculateLevel(totalClaims),
        },
      });
    } catch (error) {
      console.error('❌ Error getting user claim stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get user claim stats',
      });
    }
  };

  /**
   * 🏆 Get user's claim statistics and badges (public endpoint)
   */
  getUserClaimStats = async (req: Request, res: Response) => {
    try {
      const { userPublicKey } = req.params;

      if (!userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey is required',
        });
      }

      console.log('📊 Getting claim stats for:', userPublicKey);

      // Check if userPublicKey is an email (for testing) or a valid Solana public key
      let whereClause: any = {};
      
      if (userPublicKey.includes('@')) {
        // If it's an email, find the user by email and get claims by userId
        const user = await prisma.user.findUnique({
          where: { email: userPublicKey }
        });
        
        if (!user) {
          return res.json({
            success: true,
            data: {
              userPublicKey,
              totalClaims: 0,
              monthlyStats: [],
              badges: this.calculateBadges(0),
              level: this.calculateLevel(0),
            },
          });
        }
        
        whereClause = { userId: user.id };
      } else {
        // If it's a Solana public key, validate it and search by userPublicKey
        try {
          new PublicKey(userPublicKey);
          whereClause = { userPublicKey };
        } catch {
          return res.status(400).json({
            success: false,
            error: 'Invalid userPublicKey format - must be a valid Solana public key or email',
          });
        }
      }

      // Get total claims count
      const totalClaims = await prisma.claim.count({
        where: whereClause,
      });

      console.log('📈 Total claims found:', totalClaims);

      // Get claims by month for recent activity
      const monthlyClaims = await prisma.$queryRaw<{ month: string; count: bigint }[]>`
        SELECT 
          TO_CHAR("claimedAt", 'YYYY-MM') as month,
          COUNT(*)::bigint as count
        FROM "claims" 
        WHERE ${whereClause.userId ? `"userId" = ${whereClause.userId}` : `"userPublicKey" = ${whereClause.userPublicKey}`}
        GROUP BY TO_CHAR("claimedAt", 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 12
      `;

      // Calculate badges based on claim count
      const badges = this.calculateBadges(totalClaims);

      return res.json({
        success: true,
        data: {
          userPublicKey,
          totalClaims,
          monthlyStats: monthlyClaims.map(item => ({
            month: item.month,
            count: Number(item.count)
          })),
          badges,
          level: this.calculateLevel(totalClaims),
        },
      });
    } catch (error) {
      console.error('❌ Error getting user claim stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get user claim stats',
      });
    }
  };

  /**
   * 🏅 Calculate badges based on claim count
   */
  private calculateBadges(totalClaims: number) {
    const badges = [];

    if (totalClaims >= 1) {
      badges.push({
        id: 'first_claim',
        name: 'Primer Claim',
        description: '¡Has reclamado tu primer token!',
        icon: '🎯',
        rarity: 'common',
        unlocked: true,
      });
    }

    if (totalClaims >= 5) {
      badges.push({
        id: 'collector',
        name: 'Coleccionista',
        description: 'Has reclamado 5 tokens',
        icon: '🏆',
        rarity: 'uncommon',
        unlocked: true,
      });
    }

    if (totalClaims >= 10) {
      badges.push({
        id: 'enthusiast',
        name: 'Entusiasta',
        description: 'Has reclamado 10 tokens',
        icon: '⭐',
        rarity: 'rare',
        unlocked: true,
      });
    }

    if (totalClaims >= 25) {
      badges.push({
        id: 'expert',
        name: 'Experto',
        description: 'Has reclamado 25 tokens',
        icon: '💎',
        rarity: 'epic',
        unlocked: true,
      });
    }

    if (totalClaims >= 50) {
      badges.push({
        id: 'master',
        name: 'Maestro',
        description: 'Has reclamado 50 tokens',
        icon: '👑',
        rarity: 'legendary',
        unlocked: true,
      });
    }

    if (totalClaims >= 100) {
      badges.push({
        id: 'legend',
        name: 'Leyenda',
        description: 'Has reclamado 100 tokens',
        icon: '🌟',
        rarity: 'mythic',
        unlocked: true,
      });
    }

    // Add locked badges for motivation
    if (totalClaims < 5) {
      badges.push({
        id: 'collector_locked',
        name: 'Coleccionista',
        description: 'Reclama 5 tokens para desbloquear',
        icon: '🔒',
        rarity: 'uncommon',
        unlocked: false,
        progress: totalClaims,
        target: 5,
      });
    }

    if (totalClaims < 10) {
      badges.push({
        id: 'enthusiast_locked',
        name: 'Entusiasta',
        description: 'Reclama 10 tokens para desbloquear',
        icon: '🔒',
        rarity: 'rare',
        unlocked: false,
        progress: totalClaims,
        target: 10,
      });
    }

    return badges;
  }

  /**
   * 📈 Calculate user level based on claim count
   */
  private calculateLevel(totalClaims: number) {
    if (totalClaims >= 100) return { level: 10, name: 'Leyenda', color: 'purple' };
    if (totalClaims >= 50) return { level: 9, name: 'Maestro', color: 'gold' };
    if (totalClaims >= 25) return { level: 8, name: 'Experto', color: 'blue' };
    if (totalClaims >= 10) return { level: 7, name: 'Entusiasta', color: 'green' };
    if (totalClaims >= 5) return { level: 6, name: 'Coleccionista', color: 'orange' };
    if (totalClaims >= 1) return { level: 5, name: 'Iniciado', color: 'gray' };
    return { level: 1, name: 'Novato', color: 'gray' };
  }

  /**
   * 📊 Get public campaign info (no auth required)
   */
  getPublicCampaign = async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;

      const campaign = await prisma.campaign.findFirst({
        where: {
          id: campaignId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
          eventDate: true,
          location: true,
          imageUrl: true,
          externalUrl: true,
          maxClaims: true,
          isActive: true,
          organizer: {
            select: {
              name: true,
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
          error: 'Campaign not found or inactive',
        });
      }

      return res.json({
        success: true,
        data: {
          ...campaign,
          claimsRemaining: campaign.maxClaims ? campaign.maxClaims - campaign._count.claims : null,
        },
      });
    } catch (error) {
      console.error('❌ Error getting public campaign:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get campaign',
      });
    }
  };

  /**
   * 💰 Get relayer stats
   */
  getRelayerStats = async (_req: Request, res: Response) => {
    try {
      const balance = await this.connection.getBalance(this.relayerKeypair.publicKey);

      // Get total claims and gas costs from database
      const stats = await prisma.claim.aggregate({
        _count: true,
        _sum: {
          gasCost: true,
        },
      });

      return res.json({
        success: true,
        data: {
          relayerPublicKey: this.relayerKeypair.publicKey.toString(),
          balance: balance / 1e9,
          balanceLamports: balance,
          totalClaims: stats._count,
          totalGasCost: stats._sum.gasCost || 0,
          totalGasCostSOL: (stats._sum.gasCost || 0) / 1e9,
          network: 'devnet',
          rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('❌ Error getting relayer stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get relayer stats',
      });
    }
  };
}