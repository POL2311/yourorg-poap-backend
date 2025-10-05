// backend/src/services/nft-mint.service.ts - IMPROVED WITH TIMEOUT HANDLING
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
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
   * Mint a real NFT on Solana Devnet with improved error handling and timeouts
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
      console.log('🎨 Starting DEVNET NFT mint process...');
      console.log(`👤 User: ${userPublicKey.toString()}`);
      console.log(`⚡ Relayer: ${relayerKeypair.publicKey.toString()}`);

      // 1. Check relayer balance with timeout
      console.log('💰 Checking relayer balance...');
      const relayerBalance = await this.withTimeout(
        this.connection.getBalance(relayerKeypair.publicKey),
        10000,
        'Timeout getting relayer balance'
      );
      console.log(`💰 Relayer balance: ${relayerBalance / 1e9} SOL`);

      if (relayerBalance < 0.01 * 1e9) {
        throw new Error(`Insufficient relayer balance: ${relayerBalance / 1e9} SOL. Need at least 0.01 SOL for minting.`);
      }

      // 2. Generate new mint keypair
      const mintKeypair = Keypair.generate();
      console.log(`🎨 NFT Mint: ${mintKeypair.publicKey.toString()}`);

      // 3. Calculate user's ATA
      const userTokenAccount = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        userPublicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      console.log(`📦 User Token Account: ${userTokenAccount.toString()}`);

      // 4. Calculate rent needed with timeout
      console.log('💰 Calculating rent requirements...');
      const [mintRent, ataRent] = await Promise.all([
        this.withTimeout(
          this.connection.getMinimumBalanceForRentExemption(MINT_SIZE),
          10000,
          'Timeout getting mint rent'
        ),
        this.withTimeout(
          this.connection.getMinimumBalanceForRentExemption(165),
          10000,
          'Timeout getting ATA rent'
        )
      ]);
      
      const totalRentNeeded = mintRent + ataRent;
      
      console.log(`💰 Mint rent: ${mintRent} lamports`);
      console.log(`💰 ATA rent: ${ataRent} lamports`);
      console.log(`💰 Total rent needed: ${totalRentNeeded} lamports`);

      // 5. Check if relayer has enough funds
      const bufferAmount = 5_000_000; // 0.005 SOL buffer for fees
      if (relayerBalance < totalRentNeeded + bufferAmount) {
        throw new Error(`Insufficient funds for rent. Need ${(totalRentNeeded + bufferAmount) / 1e9} SOL, have ${relayerBalance / 1e9} SOL`);
      }

      // 6. Check if ATA already exists with timeout
      console.log('📦 Checking if ATA exists...');
      let createATA = true;
      try {
        const ataInfo = await this.withTimeout(
          this.connection.getAccountInfo(userTokenAccount),
          10000,
          'Timeout checking ATA'
        );
        if (ataInfo) {
          console.log('📦 ATA already exists, skipping creation');
          createATA = false;
        }
      } catch (error) {
        console.log('📦 ATA does not exist, will create');
      }

      // 7. Get latest blockhash with timeout
      console.log('🔗 Getting latest blockhash...');
      const { blockhash, lastValidBlockHeight } = await this.withTimeout(
        this.connection.getLatestBlockhash('confirmed'),
        15000,
        'Timeout getting blockhash'
      );
      console.log(`🔗 Blockhash: ${blockhash}`);

      // 8. Create transaction
      console.log('📝 Building transaction...');
      const transaction = new Transaction();

      // 8.1. Create mint account
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: relayerKeypair.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // 8.2. Initialize mint (NFT = 0 decimals)
      transaction.add(
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          0, // 0 decimals for NFT
          relayerKeypair.publicKey, // mint authority
          relayerKeypair.publicKey, // freeze authority
          TOKEN_PROGRAM_ID
        )
      );

      // 8.3. Create user's ATA (only if it doesn't exist)
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

      // 8.4. Mint 1 NFT to user
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

      // 9. Configure transaction
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = relayerKeypair.publicKey;

      console.log('✍️ Signing transaction...');
      transaction.sign(relayerKeypair, mintKeypair);

      // 10. Simulate transaction first with timeout
      console.log('🧪 Simulating transaction...');
      try {
        const simulation = await this.withTimeout(
          this.connection.simulateTransaction(transaction),
          15000,
          'Timeout simulating transaction'
        );
        
        if (simulation.value.err) {
          console.error('❌ Simulation error:', simulation.value.err);
          console.error('❌ Simulation logs:', simulation.value.logs);
          throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }
        
        console.log('✅ Transaction simulation successful');
        if (simulation.value.logs) {
          console.log('📊 Simulation logs:', simulation.value.logs.slice(-3));
        }
      } catch (simError) {
        console.error('❌ Simulation failed:', simError);
        throw new Error(`Simulation failed. ${simError instanceof Error ? simError.message : 'Unknown simulation error'}`);
      }

      // 11. Send and confirm transaction with timeout
      console.log('📤 Sending transaction to Devnet...');
      const signature = await this.withTimeout(
        sendAndConfirmTransaction(
          this.connection,
          transaction,
          [relayerKeypair, mintKeypair],
          {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed',
            maxRetries: 3,
          }
        ),
        60000, // 60 second timeout for transaction
        'Timeout sending transaction'
      );

      console.log(`📦 Transaction confirmed: ${signature}`);

      // 12. Calculate real cost
      let gasCost = 0;
      try {
        const txInfo = await this.withTimeout(
          this.connection.getTransaction(signature, { commitment: 'confirmed' }),
          10000,
          'Timeout getting transaction info'
        );
        gasCost = txInfo?.meta?.fee || 0;
      } catch (error) {
        console.warn('Could not get transaction fee info:', error);
        gasCost = 5000; // Estimate
      }

      console.log('🎉 DEVNET NFT MINTED SUCCESSFULLY!');
      console.log(`🎨 Mint Address: ${mintKeypair.publicKey.toString()}`);
      console.log(`👤 User Token Account: ${userTokenAccount.toString()}`);
      console.log(`📦 Transaction: ${signature}`);
      console.log(`💰 Gas Cost: ${gasCost} lamports`);
      console.log(`🔗 Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

      return {
        success: true,
        mintAddress: mintKeypair.publicKey.toString(),
        userTokenAccount: userTokenAccount.toString(),
        transactionSignature: signature,
        gasCost
      };

    } catch (error) {
      console.error('❌ Error minting Devnet NFT:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Helper function to add timeout to promises
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Verify if an NFT exists and belongs to the user
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

      const accountInfo = await this.withTimeout(
        this.connection.getTokenAccountBalance(userTokenAccount),
        10000,
        'Timeout verifying NFT ownership'
      );
      return accountInfo.value.uiAmount === 1;
    } catch (error) {
      console.error('Error verifying NFT ownership:', error);
      return false;
    }
  }

  /**
   * Get NFT metadata
   */
  async getNFTMetadata(mintAddress: string): Promise<any> {
    try {
      return {
        mint: mintAddress,
        name: 'Devnet Gasless NFT',
        description: 'NFT minted without gas fees on Solana Devnet',
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${mintAddress}`,
        attributes: [
          { trait_type: 'Type', value: 'Gasless NFT' },
          { trait_type: 'Standard', value: 'SPL Token' },
          { trait_type: 'Network', value: 'Solana Devnet' }
        ]
      };
    } catch (error) {
      console.error('Error getting NFT metadata:', error);
      return null;
    }
  }
}