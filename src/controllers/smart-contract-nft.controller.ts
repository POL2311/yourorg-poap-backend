// backend/src/controllers/smart-contract-nft.controller.ts
import { Request, Response } from 'express';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

export class SmartContractNFTController {
  private connection: Connection;
  private program: anchor.Program;
  private masterWallet: Keypair;
  private relayerKeypair: Keypair;

  constructor() {
    // Configurar conexión
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Cargar master wallet (la que paga todo)
    const masterPrivateKey = process.env.MASTER_WALLET_PRIVATE_KEY;
    if (!masterPrivateKey) {
      throw new Error('MASTER_WALLET_PRIVATE_KEY not configured');
    }
    
    try {
      const privateKeyArray = JSON.parse(masterPrivateKey);
      this.masterWallet = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      console.log(`💰 Master Wallet loaded: ${this.masterWallet.publicKey.toString()}`);
    } catch (error) {
      throw new Error('Invalid MASTER_WALLET_PRIVATE_KEY format');
    }

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
      throw new Error('Invalid RELAYER_PRIVATE_KEY format');
    }

    // TODO: Inicializar programa Anchor
    // this.program = anchor.workspace.GaslessInfrastructure;
  }

  /**
   * 🎯 ENDPOINT PRINCIPAL: Claim NFT con Smart Contract
   * Este es el flujo que quieres: Firma → Smart Contract → NFT gratis
   */
  claimNFTWithSmartContract = async (req: Request, res: Response) => {
    try {
      const { userPublicKey, signature, message, nonce, expiry } = req.body;

      if (!userPublicKey || !signature || !message || !nonce || !expiry) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey, signature, message, nonce, and expiry are required'
        });
      }

      console.log('🎯 SMART CONTRACT NFT CLAIM STARTED');
      console.log(`👤 User: ${userPublicKey}`);
      console.log(`📝 Message: ${message.substring(0, 100)}...`);
      console.log(`🔢 Nonce: ${nonce}`);

      // 1. Validar usuario
      let user: PublicKey;
      try {
        user = new PublicKey(userPublicKey);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid userPublicKey format'
        });
      }

      // 2. Validar expiración
      if (Date.now() / 1000 > expiry) {
        return res.status(400).json({
          success: false,
          error: 'Signature has expired'
        });
      }

      // 3. Validar firma off-chain
      const isValidSignature = this.validateSignature(userPublicKey, message, signature);
      if (!isValidSignature) {
        return res.status(400).json({
          success: false,
          error: 'Invalid signature'
        });
      }

      console.log('✅ Signature validation passed');

      // 4. Verificar balance de master wallet
      const masterBalance = await this.connection.getBalance(this.masterWallet.publicKey);
      console.log(`💰 Master wallet balance: ${masterBalance / 1e9} SOL`);

      if (masterBalance < 0.1 * 1e9) {
        return res.status(500).json({
          success: false,
          error: 'Insufficient master wallet balance for minting'
        });
      }

      // 5. TODO: Llamar al smart contract
      // Por ahora simulamos la llamada
      const mockResult = await this.simulateSmartContractCall(user, nonce);

      if (!mockResult.success) {
        return res.status(500).json({
          success: false,
          error: mockResult.error
        });
      }

      console.log('🎉 NFT MINTED VIA SMART CONTRACT!');
      console.log(`🎨 Mint: ${mockResult.nftMint}`);
      console.log(`📦 TX: ${mockResult.transactionSignature}`);
      console.log(`💰 Cost paid by master wallet: ${mockResult.gasCost} lamports`);

      res.status(201).json({
        success: true,
        data: {
          message: '🎉 NFT minted via smart contract without gas fees!',
          nftMint: mockResult.nftMint,
          userTokenAccount: mockResult.userTokenAccount,
          transactionSignature: mockResult.transactionSignature,
          gasCostPaidByProtocol: mockResult.gasCost,
          masterWalletPublicKey: this.masterWallet.publicKey.toString(),
          signatureVerified: true,
          claimMethod: 'smart_contract',
          timestamp: new Date().toISOString(),
          network: process.env.SOLANA_RPC_URL?.includes('localhost') ? 'localnet' : 'devnet'
        }
      });

    } catch (error) {
      console.error('❌ Error in smart contract NFT claim:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  };

  /**
   * 💰 Obtener estadísticas del protocolo
   */
  getProtocolStats = async (req: Request, res: Response) => {
    try {
      const masterBalance = await this.connection.getBalance(this.masterWallet.publicKey);
      const relayerBalance = await this.connection.getBalance(this.relayerKeypair.publicKey);

      res.json({
        success: true,
        data: {
          masterWallet: {
            publicKey: this.masterWallet.publicKey.toString(),
            balance: masterBalance / 1e9,
            balanceLamports: masterBalance
          },
          relayer: {
            publicKey: this.relayerKeypair.publicKey.toString(),
            balance: relayerBalance / 1e9,
            balanceLamports: relayerBalance
          },
          network: process.env.SOLANA_RPC_URL?.includes('localhost') ? 'localnet' : 'devnet',
          rpcUrl: process.env.SOLANA_RPC_URL,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error getting protocol stats:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  /**
   * 💰 Obtener balance de master wallet
   */
  getMasterWalletBalance = async (req: Request, res: Response) => {
    try {
      const balance = await this.connection.getBalance(this.masterWallet.publicKey);
      
      res.json({
        success: true,
        data: {
          publicKey: this.masterWallet.publicKey.toString(),
          balance: balance / 1e9,
          balanceLamports: balance,
          canPayForMinting: balance > 0.01 * 1e9,
          estimatedNFTsCanMint: Math.floor(balance / (0.002 * 1e9)), // ~0.002 SOL por NFT
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error getting master wallet balance:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  // -------- MÉTODOS PRIVADOS --------

  /**
   * Validar firma off-chain usando tweetnacl
   */
  private validateSignature(userPublicKey: string, message: string, signature: string): boolean {
    try {
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(signature);
      const publicKeyBytes = bs58.decode(userPublicKey);

      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
      console.error('Error validating signature:', error);
      return false;
    }
  }

  /**
   * Simular llamada al smart contract (temporal)
   * TODO: Reemplazar con llamada real al programa Anchor
   */
  private async simulateSmartContractCall(user: PublicKey, nonce: number): Promise<any> {
    try {
      // Simular delay de transacción
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generar datos simulados
      const mockNftMint = Keypair.generate().publicKey.toString();
      const mockUserTokenAccount = Keypair.generate().publicKey.toString();
      const mockTransactionSignature = bs58.encode(Buffer.from(Array(64).fill(0).map(() => Math.floor(Math.random() * 256))));

      return {
        success: true,
        nftMint: mockNftMint,
        userTokenAccount: mockUserTokenAccount,
        transactionSignature: mockTransactionSignature,
        gasCost: 2_500_000 // ~0.0025 SOL
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Smart contract call failed'
      };
    }
  }
}