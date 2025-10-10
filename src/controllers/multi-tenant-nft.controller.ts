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