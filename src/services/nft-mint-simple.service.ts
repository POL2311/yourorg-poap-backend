// backend/src/services/nft-mint-simple.service.ts
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
} from '@solana/spl-token';

export interface NFTMintResult {
  success: boolean;
  mintAddress?: string;
  userTokenAccount?: string;
  transactionSignature?: string;
  error?: string;
  gasCost?: number;
}

export class NFTMintSimpleService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Mintea un NFT usando SPL Token estándar (más compatible)
   */
  async mintNFTToUser(
    userPublicKey: PublicKey,
    relayerKeypair: Keypair,
    nftMetadata: {
      name: string;
      symbol: string;
      description: string;
      image: string;
    }
  ): Promise<NFTMintResult> {
    try {
      console.log('🎨 Starting SIMPLE NFT mint process...');
      console.log(`👤 User: ${userPublicKey.toString()}`);
      console.log(`⚡ Relayer: ${relayerKeypair.publicKey.toString()}`);

      // 1. Generar nueva mint keypair
      const mintKeypair = Keypair.generate();
      console.log(`🎨 NFT Mint: ${mintKeypair.publicKey.toString()}`);

      // 2. Calcular ATA del usuario
      const userTokenAccount = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        userPublicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      console.log(`📦 User Token Account: ${userTokenAccount.toString()}`);

      // 3. Calcular rent para mint
      const mintRent = await this.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
      console.log(`💰 Mint rent: ${mintRent} lamports`);

      // 4. Crear transacción
      const transaction = new Transaction();

      // 4.1. Crear cuenta de mint
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: relayerKeypair.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // 4.2. Inicializar mint (0 decimals = NFT)
      transaction.add(
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          0, // 0 decimals para NFT
          relayerKeypair.publicKey, // mint authority
          null, // freeze authority
          TOKEN_PROGRAM_ID
        )
      );

      // 4.3. Crear ATA del usuario
      transaction.add(
        createAssociatedTokenAccountInstruction(
          relayerKeypair.publicKey, // payer
          userTokenAccount,
          userPublicKey, // owner
          mintKeypair.publicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

      // 4.4. Mintear 1 NFT al usuario
      transaction.add(
        createMintToInstruction(
          mintKeypair.publicKey,
          userTokenAccount,
          relayerKeypair.publicKey, // mint authority
          1, // amount (1 NFT)
          [],
          TOKEN_PROGRAM_ID
        )
      );

      // 5. Configurar transacción
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = relayerKeypair.publicKey;

      // 6. Firmar transacción
      transaction.sign(relayerKeypair, mintKeypair);

      console.log('📝 Transaction signed, sending...');

      // 7. Enviar transacción
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }
      );

      console.log(`📦 Transaction sent: ${signature}`);

      // 8. Confirmar transacción
      const confirmation = await this.connection.confirmTransaction(
        signature,
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // 9. Calcular costo real
      const txInfo = await this.connection.getTransaction(signature, {
        commitment: 'confirmed'
      });
      const gasCost = txInfo?.meta?.fee || 0;

      console.log('🎉 SIMPLE NFT MINTED SUCCESSFULLY!');
      console.log(`🎨 Mint Address: ${mintKeypair.publicKey.toString()}`);
      console.log(`👤 User Token Account: ${userTokenAccount.toString()}`);
      console.log(`📦 Transaction: ${signature}`);
      console.log(`💰 Gas Cost: ${gasCost} lamports`);

      return {
        success: true,
        mintAddress: mintKeypair.publicKey.toString(),
        userTokenAccount: userTokenAccount.toString(),
        transactionSignature: signature,
        gasCost
      };

    } catch (error) {
      console.error('❌ Error minting simple NFT:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verifica si un NFT existe y pertenece al usuario
   */
  async verifyNFTOwnership(
    mintAddress: string,
    userPublicKey: PublicKey
  ): Promise<boolean> {
    try {
      const mint = new PublicKey(mintAddress);
      const userTokenAccount = getAssociatedTokenAddressSync(
        mint,
        userPublicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const accountInfo = await this.connection.getTokenAccountBalance(userTokenAccount);
      return accountInfo.value.uiAmount === 1;
    } catch (error) {
      console.error('Error verifying NFT ownership:', error);
      return false;
    }
  }
}