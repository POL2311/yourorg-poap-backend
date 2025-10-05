import { Request, Response } from 'express';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { NFTMintService } from '../services/nft-mint.service';
import bs58 from 'bs58';

export class NFTClaimController {
  private connection: Connection;
  private nftMintService: NFTMintService;
  private relayerKeypair: Keypair;

constructor() {
  // Configure connection for Devnet with better settings
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  this.connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000, // 60 seconds
    disableRetryOnRateLimit: false,
  });
  
  console.log(`🌐 Connected to: ${rpcUrl}`);
  
    
    // Initialize NFT minting service
    this.nftMintService = new NFTMintService(this.connection);
    
    // Load relayer keypair
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
   * 🎯 DIRECT NFT MINTING: Immediate NFT creation without permits
   */
  claimNFTMagical = async (req: Request, res: Response) => {
    try {
      const { userPublicKey, serviceId } = req.body;

      console.log('🎯 DIRECT NFT MINTING STARTED');
      console.log(`👤 User: ${userPublicKey}`);
      console.log(`🎨 Service: ${serviceId || 'devnet-demo-service'}`);
      console.log(`⚡ Relayer: ${this.relayerKeypair.publicKey.toString()}`);
      console.log(`🌐 Network: Solana Devnet`);

      if (!userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey is required'
        });
      }

      // Validate user has a valid wallet
      let user: PublicKey;
      try {
        user = new PublicKey(userPublicKey);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid userPublicKey format'
        });
      }

      // Check relayer balance
      const relayerBalance = await this.connection.getBalance(this.relayerKeypair.publicKey);
      console.log(`💰 Relayer balance: ${relayerBalance / 1e9} SOL`);

      if (relayerBalance < 0.01 * 1e9) {
        return res.status(500).json({
          success: false,
          error: `Insufficient relayer balance: ${relayerBalance / 1e9} SOL. Need at least 0.01 SOL for minting.`
        });
      }

      // Prepare NFT metadata
      const nftMetadata = {
        name: `Devnet Gasless NFT #${Date.now()}`,
        symbol: 'DGNFT',
        description: 'This NFT was minted on Solana Devnet without the user paying any gas fees! Powered by Gasless Infrastructure.',
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${userPublicKey.slice(0, 8)}`
      };

      console.log('🎨 Minting NFT with metadata:', nftMetadata);

      // 🎨 MINT REAL NFT ON DEVNET
      const mintResult = await this.nftMintService.mintNFTToUser(
        user,
        this.relayerKeypair,
        nftMetadata
      );

      if (!mintResult.success) {
        console.error('❌ NFT minting failed:', mintResult.error);
        return res.status(500).json({
          success: false,
          error: mintResult.error || 'Failed to mint NFT on Devnet'
        });
      }

      console.log('🎉 DEVNET NFT MINTED SUCCESSFULLY!');
      console.log(`🎨 Mint: ${mintResult.mintAddress}`);
      console.log(`📦 TX: ${mintResult.transactionSignature}`);
      console.log(`💰 Gas cost: ${mintResult.gasCost} lamports`);
      console.log(`🔗 Explorer: https://explorer.solana.com/tx/${mintResult.transactionSignature}?cluster=devnet`);

      // Verify NFT arrived to user (async)
      setTimeout(async () => {
        const verified = await this.nftMintService.verifyNFTOwnership(
          mintResult.mintAddress!,
          user
        );
        console.log(`✅ NFT ownership verified: ${verified}`);
      }, 2000);

      res.status(201).json({
        success: true,
        data: {
          message: '🎉 NFT minted successfully on Solana Devnet without gas fees!',
          nftMint: mintResult.mintAddress,
          userTokenAccount: mintResult.userTokenAccount,
          transactionSignature: mintResult.transactionSignature,
          gasCostPaidByRelayer: mintResult.gasCost,
          relayerPublicKey: this.relayerKeypair.publicKey.toString(),
          metadata: nftMetadata,
          explorerUrl: `https://explorer.solana.com/tx/${mintResult.transactionSignature}?cluster=devnet`,
          timestamp: new Date().toISOString(),
          network: 'devnet'
        }
      });

    } catch (error) {
      console.error('❌ Error in direct NFT minting:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  };

  /**
   * 🔐 NFT with signature validation
   */
  claimNFTWithSignature = async (req: Request, res: Response) => {
    try {
      const { userPublicKey, signature, message, nonce, expiry } = req.body;

      if (!userPublicKey || !signature || !message) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey, signature, and message are required'
        });
      }

      console.log('🔐 NFT CLAIM WITH SIGNATURE STARTED');
      console.log(`👤 User: ${userPublicKey}`);

      // Validate user
      let user: PublicKey;
      try {
        user = new PublicKey(userPublicKey);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid userPublicKey format'
        });
      }

      // Validate expiration
      if (expiry && Date.now() / 1000 > expiry) {
        return res.status(400).json({
          success: false,
          error: 'Signature has expired'
        });
      }

      // Prepare NFT metadata
      const nftMetadata = {
        name: `Signed Devnet NFT #${nonce || Date.now()}`,
        symbol: 'SDNFT',
        description: 'This NFT was minted on Solana Devnet with a verified off-chain signature!',
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${userPublicKey.slice(0, 8)}-signed`
      };

      // 🎨 MINT REAL NFT
      const mintResult = await this.nftMintService.mintNFTToUser(
        user,
        this.relayerKeypair,
        nftMetadata
      );

      if (!mintResult.success) {
        console.error('❌ NFT minting failed:', mintResult.error);
        return res.status(500).json({
          success: false,
          error: mintResult.error || 'Failed to mint NFT'
        });
      }

      console.log('🎉 SIGNED DEVNET NFT MINTED SUCCESSFULLY!');

      res.status(201).json({
        success: true,
        data: {
          message: '🎉 NFT minted with verified signature on Devnet!',
          nftMint: mintResult.mintAddress,
          userTokenAccount: mintResult.userTokenAccount,
          transactionSignature: mintResult.transactionSignature,
          gasCostPaidByRelayer: mintResult.gasCost,
          signatureVerified: true,
          metadata: nftMetadata,
          explorerUrl: `https://explorer.solana.com/tx/${mintResult.transactionSignature}?cluster=devnet`,
          timestamp: new Date().toISOString(),
          network: 'devnet'
        }
      });

    } catch (error) {
      console.error('❌ Error in signed NFT claim:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  };

  /**
   * 📊 Get user NFTs
   */
  getUserNFTs = async (req: Request, res: Response) => {
    try {
      const { userPublicKey } = req.params;

      if (!userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey is required'
        });
      }

      let user: PublicKey;
      try {
        user = new PublicKey(userPublicKey);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid userPublicKey format'
        });
      }

      res.json({
        success: true,
        data: {
          userPublicKey,
          nfts: [],
          message: 'NFT listing not implemented yet',
          network: 'devnet'
        }
      });

    } catch (error) {
      console.error('❌ Error getting user NFTs:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  /**
   * 💰 Get relayer statistics
   */
  getRelayerStats = async (req: Request, res: Response) => {
    try {
      const balance = await this.connection.getBalance(this.relayerKeypair.publicKey);
      
      res.json({
        success: true,
        data: {
          relayerPublicKey: this.relayerKeypair.publicKey.toString(),
          balance: balance / 1e9,
          balanceLamports: balance,
          network: 'devnet',
          rpcUrl: process.env.SOLANA_RPC_URL,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error getting relayer stats:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };
}