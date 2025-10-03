// backend/src/services/nft-mint.service.ts - OPTIMIZADO
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  ExtensionType,
  createInitializeMetadataPointerInstruction,
  createInitializeInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token';
import { createInitializeInstruction as createMetadataInitializeInstruction } from '@solana/spl-token-metadata';

export interface NFTMintResult {
  success: boolean;
  mintAddress?: string;
  userTokenAccount?: string;
  transactionSignature?: string;
  error?: string;
  gasCost?: number;
}

export class NFTMintService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Mintea un NFT real usando Token-2022 + Metadata
   * El relayer paga todos los costos, el NFT va al usuario
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
      console.log('🎨 Starting NFT mint process...');
      console.log(`👤 User: ${userPublicKey.toString()}`);
      console.log(`⚡ Relayer: ${relayerKeypair.publicKey.toString()}`);

      // 1. Verificar balance del relayer ANTES de proceder
      const relayerBalance = await this.connection.getBalance(relayerKeypair.publicKey);
      console.log(`💰 Relayer balance: ${relayerBalance / 1e9} SOL`);

      if (relayerBalance < 0.1 * 1e9) { // Menos de 0.1 SOL
        throw new Error(`Insufficient relayer balance: ${relayerBalance / 1e9} SOL. Need at least 0.1 SOL for minting.`);
      }

      // 2. Generar nueva mint keypair
      const mintKeypair = Keypair.generate();
      console.log(`🎨 NFT Mint: ${mintKeypair.publicKey.toString()}`);

      // 3. Calcular ATA del usuario
      const userTokenAccount = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        userPublicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      console.log(`📦 User Token Account: ${userTokenAccount.toString()}`);

      // 4. Preparar metadata más simple para reducir costos
      const metadata: TokenMetadata = {
        updateAuthority: relayerKeypair.publicKey,
        mint: mintKeypair.publicKey,
        name: nftMetadata.name,
        symbol: nftMetadata.symbol,
        uri: `data:application/json;base64,${Buffer.from(JSON.stringify({
          name: nftMetadata.name,
          description: nftMetadata.description,
          image: nftMetadata.image,
          attributes: [
            { trait_type: 'Type', value: 'Gasless NFT' },
            { trait_type: 'Network', value: 'Solana' }
          ]
        })).toString('base64')}`,
        additionalMetadata: [
          ['description', nftMetadata.description],
          ['gasless', 'true']
        ],
      };

      // 5. Calcular espacio necesario para la mint
      const extensions = [ExtensionType.MetadataPointer];
      const mintLen = getMintLen(extensions);

      // 6. Calcular rent con buffer adicional
      const mintRent = await this.connection.getMinimumBalanceForRentExemption(mintLen);
      const ataRent = await this.connection.getMinimumBalanceForRentExemption(165); // ATA size
      const totalRentNeeded = mintRent + ataRent;
      
      console.log(`💰 Mint rent: ${mintRent} lamports`);
      console.log(`💰 ATA rent: ${ataRent} lamports`);
      console.log(`💰 Total rent needed: ${totalRentNeeded} lamports`);
      console.log(`📏 Mint length: ${mintLen} bytes`);

      // 7. Verificar que el relayer tiene suficientes fondos para el rent
      if (relayerBalance < totalRentNeeded + 10_000_000) { // +0.01 SOL buffer para fees
        throw new Error(`Insufficient funds for rent. Need ${(totalRentNeeded + 10_000_000) / 1e9} SOL, have ${relayerBalance / 1e9} SOL`);
      }

      // 8. Verificar si la ATA ya existe
      let createATA = true;
      try {
        const ataInfo = await this.connection.getAccountInfo(userTokenAccount);
        if (ataInfo) {
          console.log('📦 ATA already exists, skipping creation');
          createATA = false;
        }
      } catch (error) {
        // ATA no existe, necesitamos crearla
        console.log('📦 ATA does not exist, will create');
      }

      // 9. Crear transacción
      const transaction = new Transaction();

      // 9.1. Crear cuenta de mint
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: relayerKeypair.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: mintLen,
          lamports: mintRent,
          programId: TOKEN_2022_PROGRAM_ID,
        })
      );

      // 9.2. Inicializar metadata pointer
      transaction.add(
        createInitializeMetadataPointerInstruction(
          mintKeypair.publicKey,
          relayerKeypair.publicKey,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );

      // 9.3. Inicializar mint
      transaction.add(
        createInitializeMint2Instruction(
          mintKeypair.publicKey,
          0, // 0 decimals para NFT
          relayerKeypair.publicKey, // mint authority
          null, // freeze authority
          TOKEN_2022_PROGRAM_ID
        )
      );

      // 9.4. Inicializar metadata
      transaction.add(
        createMetadataInitializeInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          metadata: mintKeypair.publicKey,
          updateAuthority: relayerKeypair.publicKey,
          mint: mintKeypair.publicKey,
          mintAuthority: relayerKeypair.publicKey,
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadata.uri,
        })
      );

      // 9.5. Crear ATA del usuario (solo si no existe)
      if (createATA) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            relayerKeypair.publicKey, // payer
            userTokenAccount,
            userPublicKey, // owner
            mintKeypair.publicKey,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // 9.6. Mintear 1 NFT al usuario
      transaction.add(
        createMintToInstruction(
          mintKeypair.publicKey,
          userTokenAccount,
          relayerKeypair.publicKey, // mint authority
          1, // amount (1 NFT)
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      // 10. Configurar transacción con prioridad
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = relayerKeypair.publicKey;

      // 11. Firmar transacción
      transaction.sign(relayerKeypair, mintKeypair);

      console.log('📝 Transaction signed, sending...');

      // 12. Simular transacción primero
      try {
        const simulation = await this.connection.simulateTransaction(transaction);
        if (simulation.value.err) {
          throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }
        console.log('✅ Transaction simulation successful');
      } catch (simError) {
        console.error('❌ Simulation failed:', simError);
        throw new Error(`Simulation failed. ${simError instanceof Error ? simError.message : 'Unknown simulation error'}`);
      }

      // 13. Enviar transacción
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        }
      );

      console.log(`📦 Transaction sent: ${signature}`);

      // 14. Confirmar transacción
      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // 15. Calcular costo real
      const txInfo = await this.connection.getTransaction(signature, {
        commitment: 'confirmed'
      });
      const gasCost = txInfo?.meta?.fee || 0;

      console.log('🎉 NFT MINTED SUCCESSFULLY!');
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
      console.error('❌ Error minting NFT:', error);
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
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const accountInfo = await this.connection.getTokenAccountBalance(userTokenAccount);
      return accountInfo.value.uiAmount === 1;
    } catch (error) {
      console.error('Error verifying NFT ownership:', error);
      return false;
    }
  }

  /**
   * Obtiene metadata de un NFT
   */
  async getNFTMetadata(mintAddress: string): Promise<any> {
    try {
      const mint = new PublicKey(mintAddress);
      // Aquí podrías implementar la lectura de metadata desde la mint
      // Por ahora retornamos info básica
      return {
        mint: mintAddress,
        name: 'Gasless NFT',
        description: 'NFT minted without gas fees',
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${mintAddress}`
      };
    } catch (error) {
      console.error('Error getting NFT metadata:', error);
      return null;
    }
  }
}