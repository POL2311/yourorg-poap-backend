// backend/src/controllers/nft-claim-simple.controller.ts
import { Request, Response } from 'express';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { NFTMintSimpleService } from '../services/nft-mint-simple.service';
import bs58 from 'bs58';

export class NFTClaimSimpleController {
  private connection: Connection;
  private nftMintService: NFTMintSimpleService;
  private relayerKeypair: Keypair;

  constructor() {
    // Configurar conexión
    const rpcUrl = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Inicializar servicio de minteo
    this.nftMintService = new NFTMintSimpleService(this.connection);
    
    // Cargar relayer keypair
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
   * 🎯 ENDPOINT MÁGICO: Claim NFT Real sin firmas (versión simple)
   */
  claimNFTMagical = async (req: Request, res: Response) => {
    try {
      const { userPublicKey } = req.body;

      if (!userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey is required'
        });
      }

      console.log('🎯 MAGICAL SIMPLE NFT CLAIM STARTED');
      console.log(`👤 User: ${userPublicKey}`);
      console.log(`⚡ Relayer: ${this.relayerKeypair.publicKey.toString()}`);

      // Validar que el usuario tenga una wallet válida
      let user: PublicKey;
      try {
        user = new PublicKey(userPublicKey);
      } catch (error) {
        console.error('Invalid userPublicKey:', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid userPublicKey format'
        });
      }

      // Verificar balance del relayer
      const relayerBalance = await this.connection.getBalance(this.relayerKeypair.publicKey);
      console.log(`💰 Relayer balance: ${relayerBalance / 1e9} SOL`);

      if (relayerBalance < 0.01 * 1e9) { // Menos de 0.01 SOL
        return res.status(500).json({
          success: false,
          error: 'Insufficient relayer balance for minting'
        });
      }

      // Preparar metadata del NFT
      const nftMetadata = {
        name: `Simple Gasless NFT #${Date.now()}`,
        symbol: 'SGNFT',
        description: 'This simple NFT was minted without the user paying any gas fees! Powered by Gasless Infrastructure.',
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${userPublicKey.slice(0, 8)}`
      };

      console.log('🎨 Minting simple NFT with metadata:', nftMetadata);

      // 🎨 MINTEAR NFT SIMPLE
      const mintResult = await this.nftMintService.mintNFTToUser(
        user,
        this.relayerKeypair,
        nftMetadata
      );

      if (!mintResult.success) {
        console.error('❌ Simple NFT minting failed:', mintResult.error);
        return res.status(500).json({
          success: false,
          error: mintResult.error || 'Failed to mint NFT'
        });
      }

      console.log('🎉 SIMPLE NFT MINTED SUCCESSFULLY!');
      console.log(`🎨 Mint: ${mintResult.mintAddress}`);
      console.log(`📦 TX: ${mintResult.transactionSignature}`);
      console.log(`💰 Gas cost: ${mintResult.gasCost} lamports`);

      res.status(201).json({
        success: true,
        data: {
          message: '🎉 Simple NFT minted successfully without gas fees!',
          nftMint: mintResult.mintAddress,
          userTokenAccount: mintResult.userTokenAccount,
          transactionSignature: mintResult.transactionSignature,
          gasCostPaidByRelayer: mintResult.gasCost,
          relayerPublicKey: this.relayerKeypair.publicKey.toString(),
          metadata: nftMetadata,
          timestamp: new Date().toISOString(),
          network: process.env.SOLANA_RPC_URL?.includes('localhost') ? 'localnet' : 'devnet',
          type: 'simple_spl_token'
        }
      });

    } catch (error) {
      console.error('❌ Error in magical simple NFT claim:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  };

  /**
   * 💰 Obtener estadísticas del relayer
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
          network: process.env.SOLANA_RPC_URL?.includes('localhost') ? 'localnet' : 'devnet',
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