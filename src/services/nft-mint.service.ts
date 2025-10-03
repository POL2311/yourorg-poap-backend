// backend/src/services/nft-mint.service.ts - FIXED SIMULATION
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

export class NFTMintService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Mintea un NFT simple usando SPL Token (más estable que Token-2022)
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
      console.log('🎨 Starting SIMPLE NFT mint process...');
      console.log(`👤 User: ${userPublicKey.toString()}`);
      console.log(`⚡ Relayer: ${relayerKeypair.publicKey.toString()}`);

      // 1. Verificar balance del relayer ANTES de proceder
      const relayerBalance = await this.connection.getBalance(relayerKeypair.publicKey);
      console.log(`💰 Relayer balance: ${relayerBalance / 1e9} SOL`);

      if (relayerBalance < 0.01 * 1e9) { // Menos de 0.01 SOL
        throw new Error(`Insufficient relayer balance: ${relayerBalance / 1e9} SOL. Need at least 0.01 SOL for minting.`);
      }

      // 2. Generar nueva mint keypair
      const mintKeypair = Keypair.generate();
      console.log(`🎨 NFT Mint: ${mintKeypair.publicKey.toString()}`);

      // 3. Calcular ATA del usuario
      const userTokenAccount = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        userPublicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      console.log(`📦 User Token Account: ${userTokenAccount.toString()}`);

      // 4. Calcular rent necesario
      const mintRent = await this.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
      const ataRent = await this.connection.getMinimumBalanceForRentExemption(165); // ATA size
      const totalRentNeeded = mintRent + ataRent;
      
      console.log(`💰 Mint rent: ${mintRent} lamports`);
      console.log(`💰 ATA rent: ${ataRent} lamports`);
      console.log(`💰 Total rent needed: ${totalRentNeeded} lamports`);

      // 5. Verificar que el relayer tiene suficientes fondos
      const bufferAmount = 5_000_000; // 0.005 SOL buffer para fees
      if (relayerBalance < totalRentNeeded + bufferAmount) {
        throw new Error(`Insufficient funds for rent. Need ${(totalRentNeeded + bufferAmount) / 1e9} SOL, have ${relayerBalance / 1e9} SOL`);
      }

      // 6. Verificar si la ATA ya existe
      let createATA = true;
      try {
        const ataInfo = await this.connection.getAccountInfo(userTokenAccount);
        if (ataInfo) {
          console.log('📦 ATA already exists, skipping creation');
          createATA = false;
        }
      } catch (error) {
        console.log('📦 ATA does not exist, will create');
      }

      // 7. Crear transacción
      const transaction = new Transaction();

      // 7.1. Crear cuenta de mint
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: relayerKeypair.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // 7.2. Inicializar mint (NFT = 0 decimals)
      transaction.add(
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          0, // 0 decimals para NFT
          relayerKeypair.publicKey, // mint authority
          relayerKeypair.publicKey, // freeze authority
          TOKEN_PROGRAM_ID
        )
      );

      // 7.3. Crear ATA del usuario (solo si no existe)
      if (createATA) {
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
      }

      // 7.4. Mintear 1 NFT al usuario
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

      // 8. Configurar transacción
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = relayerKeypair.publicKey;

      // 9. Firmar transacción
      transaction.sign(relayerKeypair, mintKeypair);

      console.log('📝 Transaction signed, simulating...');

      // 10. Simular transacción primero (SINTAXIS CORREGIDA)
      try {
        const simulation = await this.connection.simulateTransaction(transaction);
        
        if (simulation.value.err) {
          console.error('❌ Simulation error:', simulation.value.err);
          console.error('❌ Simulation logs:', simulation.value.logs);
          throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }
        
        console.log('✅ Transaction simulation successful');
        console.log('📊 Simulation logs:', simulation.value.logs?.slice(-5)); // Últimos 5 logs
      } catch (simError) {
        console.error('❌ Simulation failed:', simError);
        throw new Error(`Simulation failed. ${simError instanceof Error ? simError.message : 'Unknown simulation error'}`);
      }

      // 11. Enviar transacción
      console.log('📤 Sending transaction...');
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        }
      );

      console.log(`📦 Transaction sent: ${signature}`);

      // 12. Confirmar transacción
      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // 13. Calcular costo real
      let gasCost = 0;
      try {
        const txInfo = await this.connection.getTransaction(signature, {
          commitment: 'confirmed'
        });
        gasCost = txInfo?.meta?.fee || 0;
      } catch (error) {
        console.warn('Could not get transaction fee info');
      }

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

  /**
   * Obtiene metadata de un NFT
   */
  async getNFTMetadata(mintAddress: string): Promise<any> {
    try {
      const mint = new PublicKey(mintAddress);
      return {
        mint: mintAddress,
        name: 'Simple Gasless NFT',
        description: 'NFT minted without gas fees using SPL Token',
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${mintAddress}`,
        attributes: [
          { trait_type: 'Type', value: 'Gasless NFT' },
          { trait_type: 'Standard', value: 'SPL Token' },
          { trait_type: 'Network', value: 'Solana' }
        ]
      };
    } catch (error) {
      console.error('Error getting NFT metadata:', error);
      return null;
    }
  }
}