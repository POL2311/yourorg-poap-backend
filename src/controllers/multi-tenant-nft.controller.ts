import { Request, Response } from 'express';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { NFTMintService } from '../services/nft-mint.service';

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
   * 🏅 Multi-tenant POAP claiming (simplified version)
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

      // For now, create a demo POAP (later integrate with database)
      const campaignName = campaignId || 'Demo Campaign';
      const seed = campaignName + '-' + userPublicKey.slice(0, 8);
      const imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=6366f1`;
      
      const poapMetadata = {
        name: `${campaignName} - POAP`,
        symbol: 'POAP',
        description: `Proof of Attendance for ${campaignName}\n\n🎪 Event: ${campaignName}\n📅 Date: ${new Date().toISOString().split('T')[0]}\n📍 Location: Virtual\n🏢 Organizer: Demo Organizer\n\n✨ This POAP was minted gaslessly on Solana.`,
        image: imageUrl,
        external_url: `https://poap-infra.com/campaign/${campaignId}`,
        attributes: [
          { trait_type: 'Type', value: 'POAP' },
          { trait_type: 'Event', value: campaignName },
          { trait_type: 'Date', value: new Date().toISOString().split('T')[0] },
          { trait_type: 'Location', value: 'Virtual' },
          { trait_type: 'Campaign ID', value: campaignId || 'demo' },
          { trait_type: 'Network', value: 'Solana Devnet' },
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
            id: campaignId || 'demo',
            name: campaignName,
            organizer: 'Demo Organizer',
            eventDate: new Date().toISOString(),
            location: 'Virtual',
          },
          nft: {
            mint: mintResult.mintAddress,
            tokenAccount: mintResult.userTokenAccount,
            transactionSignature: mintResult.transactionSignature,
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
   * 📊 Get user's POAPs (simplified version)
   */
  getUserPOAPs = async (req: Request, res: Response) => {
    try {
      const { userPublicKey } = req.params;

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

      // For now, return empty array (later integrate with database)
      return res.json({
        success: true,
        data: {
          userPublicKey,
          claims: [],
          message: 'POAP listing not implemented yet - database integration needed',
          pagination: {
            page: 1,
            limit: 20,
            total: 0,
            pages: 0,
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
   * 📊 Get public campaign info (simplified version)
   */
  getPublicCampaign = async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;

      // For now, return demo campaign (later integrate with database)
      return res.json({
        success: true,
        data: {
          id: campaignId,
          name: `Demo Campaign ${campaignId}`,
          description: 'This is a demo campaign for testing POAP claiming',
          eventDate: new Date().toISOString(),
          location: 'Virtual',
          imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${campaignId}`,
          maxClaims: null,
          isActive: true,
          organizer: {
            name: 'Demo Organizer',
            company: 'Demo Company',
          },
          _count: {
            claims: 0,
          },
          claimsRemaining: null,
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

      return res.json({
        success: true,
        data: {
          relayerPublicKey: this.relayerKeypair.publicKey.toString(),
          balance: balance / 1e9,
          balanceLamports: balance,
          totalClaims: 0, // Will be updated when database is integrated
          totalGasCost: 0,
          totalGasCostSOL: 0,
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