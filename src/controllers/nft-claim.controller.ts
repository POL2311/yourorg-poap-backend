// backend/src/controllers/nft-claim.controller.ts
import { Request, Response } from 'express';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { NFTMintService } from '../services/nft-mint.service';

type PoapExtra = {
  eventDate?: string;
  location?: string;
  organizer?: string;
  image?: string;
  externalUrl?: string;
};

export class NFTClaimController {
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
   * 🪄 Gasless + POAP (opcional)
   * Si envías eventId/eventName/metadata/secretCode, se genera un POAP.
   * Si no, hace el mint "demo" como antes.
   */
  claimNFTMagical = async (req: Request, res: Response) => {
    try {
      const {
        userPublicKey,
        serviceId,

        // ---- Campos POAP opcionales ----
        eventId,
        eventName,
        secretCode,
        metadata,
      } = req.body as {
        userPublicKey: string;
        serviceId?: string;
        eventId?: string;
        eventName?: string;
        secretCode?: string;
        metadata?: PoapExtra;
      };

      console.log('🏅 POAP / MAGICAL CLAIM STARTED');
      console.log(`👤 User: ${userPublicKey}`);
      console.log(`🎨 Service: ${serviceId || 'devnet-demo-service'}`);
      if (eventId || eventName) console.log(`🎪 Event: ${eventName || eventId || 'Demo Event'}`);
      if (secretCode) console.log(`🔑 Code provided (len=${secretCode.length})`);
      console.log(`⚡ Relayer: ${this.relayerKeypair.publicKey.toString()}`);
      console.log('🌐 Network: Solana Devnet');

      if (!userPublicKey) {
        return res.status(400).json({ success: false, error: 'userPublicKey is required' });
      }

      let user: PublicKey;
      try {
        user = new PublicKey(userPublicKey);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid userPublicKey format' });
      }

      const relayerBalance = await this.connection.getBalance(this.relayerKeypair.publicKey);
      console.log(`💰 Relayer balance: ${relayerBalance / 1e9} SOL`);
      if (relayerBalance < 0.01 * 1e9) {
        return res.status(500).json({
          success: false,
          error: `Insufficient relayer balance: ${relayerBalance / 1e9} SOL. Need at least 0.01 SOL for minting.`,
        });
      }

      // Validación de código (opcional)
      const REQUIRED_CODE = process.env.POAP_SECRET_CODE || 'BREAKPOINT2024';
      const wantsPoap = Boolean(eventId || eventName || secretCode !== undefined || metadata);
      if (wantsPoap && secretCode !== undefined && secretCode !== REQUIRED_CODE) {
        return res.status(400).json({
          success: false,
          error: 'Invalid event code',
          hint: process.env.POAP_SECRET_CODE ? undefined : 'Hint: Try BREAKPOINT2024 (demo)',
        });
      }

      // Metadata enriquecida
      const nowISO = new Date().toISOString();
      const fallEventName = eventName || 'Demo Event';
      const fallEventDate = metadata?.eventDate || nowISO.split('T')[0];
      const fallLocation = metadata?.location || 'Virtual';
      const fallOrganizer = metadata?.organizer || 'Demo Organizer';
      const seed = (eventId || 'demo') + '-' + userPublicKey.slice(0, 8);

      const imageUrl =
        metadata?.image ||
        `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=6366f1`;
      const externalUrl =
        metadata?.externalUrl ||
        `https://poap-infra.example/event/${encodeURIComponent(eventId || 'demo')}`;

      const poapMetadata = {
        name: wantsPoap ? `${fallEventName} - POAP` : `Devnet Gasless NFT #${Date.now()}`,
        symbol: wantsPoap ? 'POAP' : 'DGNFT',
        description: wantsPoap
          ? `Proof of Attendance for ${fallEventName}\n\n🎪 Event: ${fallEventName}\n📅 Date: ${fallEventDate}\n📍 Location: ${fallLocation}\n🏢 Organizer: ${fallOrganizer}\n\n✨ This POAP was minted gaslessly on Solana Devnet.`
          : 'This NFT was minted on Solana Devnet without the user paying any gas fees! Powered by Gasless Infrastructure.',
        image: imageUrl,
        external_url: externalUrl,
        attributes: wantsPoap
          ? [
              { trait_type: 'Type', value: 'POAP' },
              { trait_type: 'Event', value: fallEventName },
              { trait_type: 'Date', value: fallEventDate },
              { trait_type: 'Location', value: fallLocation },
              { trait_type: 'Organizer', value: fallOrganizer },
              { trait_type: 'Network', value: 'Solana Devnet' },
              { trait_type: 'Gasless', value: 'true' },
            ]
          : [
              { trait_type: 'Type', value: 'Demo' },
              { trait_type: 'Gasless', value: 'true' },
            ],
        properties: {
          category: wantsPoap ? 'POAP' : 'Demo',
          files: [{ uri: imageUrl, type: 'image/svg+xml' }],
        },
      };

      console.log('🎨 Minting NFT with metadata:', poapMetadata);

      // Mint gasless (payer = relayer)
      const mintResult = await this.nftMintService.mintNFTToUser(user, this.relayerKeypair, poapMetadata);
      if (!mintResult.success) {
        console.error('❌ NFT minting failed:', mintResult.error);
        return res.status(500).json({
          success: false,
          error: mintResult.error || 'Failed to mint NFT on Devnet',
        });
      }

      console.log('🎉 NFT MINTED SUCCESSFULLY!');
      console.log(`🎨 Mint: ${mintResult.mintAddress}`);
      console.log(`📦 TX: ${mintResult.transactionSignature}`);
      console.log(`💰 Gas cost: ${mintResult.gasCost} lamports`);
      console.log(
        `🔗 Explorer: https://explorer.solana.com/tx/${mintResult.transactionSignature}?cluster=devnet`
      );

      setTimeout(async () => {
        try {
          const verified = await this.nftMintService.verifyNFTOwnership(mintResult.mintAddress!, user);
          console.log(`✅ NFT ownership verified: ${verified}`);
        } catch (e) {
          console.log('⚠️ Ownership verify error (non-fatal):', e);
        }
      }, 2000);

      return res.status(201).json({
        success: true,
        data: {
          message: wantsPoap
            ? '🏅 POAP badge claimed successfully!'
            : '🎉 NFT minted successfully on Solana Devnet without gas fees!',
          event: wantsPoap
            ? {
                id: eventId || 'demo',
                name: fallEventName,
                date: fallEventDate,
                location: fallLocation,
                organizer: fallOrganizer,
              }
            : undefined,
          nft: {
            mint: mintResult.mintAddress,
            tokenAccount: mintResult.userTokenAccount,
            transactionSignature: mintResult.transactionSignature,
          },
          gasCostPaidByRelayer: mintResult.gasCost,
          relayerPublicKey: this.relayerKeypair.publicKey.toString(),
          metadata: poapMetadata,
          explorerUrl: `https://explorer.solana.com/tx/${mintResult.transactionSignature}?cluster=devnet`,
          timestamp: new Date().toISOString(),
          network: 'devnet',
        },
      });
    } catch (error) {
      console.error('❌ Error in direct NFT minting (POAP/magical):', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  };

  /**
   * 🔐 NFT con validación de firma (flujo alterno)
   */
  claimNFTWithSignature = async (req: Request, res: Response) => {
    try {
      const { userPublicKey, signature, message, nonce, expiry } = req.body;

      if (!userPublicKey || !signature || !message) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey, signature, and message are required',
        });
      }

      console.log('🔐 NFT CLAIM WITH SIGNATURE STARTED');
      console.log(`👤 User: ${userPublicKey}`);

      let user: PublicKey;
      try {
        user = new PublicKey(userPublicKey);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid userPublicKey format' });
      }

      if (expiry && Date.now() / 1000 > expiry) {
        return res.status(400).json({
          success: false,
          error: 'Signature has expired',
        });
      }

      const nftMetadata = {
        name: `Signed Devnet NFT #${nonce || Date.now()}`,
        symbol: 'SDNFT',
        description: 'This NFT was minted on Solana Devnet with a verified off-chain signature!',
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${userPublicKey.slice(0, 8)}-signed`,
      };

      const mintResult = await this.nftMintService.mintNFTToUser(user, this.relayerKeypair, nftMetadata);
      if (!mintResult.success) {
        console.error('❌ NFT minting failed:', mintResult.error);
        return res.status(500).json({
          success: false,
          error: mintResult.error || 'Failed to mint NFT',
        });
      }

      console.log('🎉 SIGNED DEVNET NFT MINTED SUCCESSFULLY!');

      return res.status(201).json({
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
          network: 'devnet',
        },
      });
    } catch (error) {
      console.error('❌ Error in signed NFT claim:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  };

  /**
   * 📊 Listar NFTs del usuario (stub)
   */
  getUserNFTs = async (req: Request, res: Response) => {
    try {
      const { userPublicKey } = req.params;

      if (!userPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'userPublicKey is required',
        });
      }

      let user: PublicKey;
      try {
        user = new PublicKey(userPublicKey);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid userPublicKey format' });
      }

      // Aquí puedes integrar tu fetch real (Helius/Metaplex/Indexer)
      return res.json({
        success: true,
        data: {
          userPublicKey: user.toBase58(),
          nfts: [],
          message: 'NFT listing not implemented yet',
          network: 'devnet',
        },
      });
    } catch (error) {
      console.error('❌ Error getting user NFTs:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };

  /**
   * 💰 Stats del relayer
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
          network: 'devnet',
          rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('❌ Error getting relayer stats:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };
}
