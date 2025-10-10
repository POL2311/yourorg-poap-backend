import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
} from '@solana/web3.js';
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import { uploadToIPFS } from '../utils/ipfs';

export class MetaplexNFTService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async mintNFTWithMetadata(
    userPublicKey: PublicKey,
    relayerKeypair: Keypair,
    nftData: {
      name: string;
      symbol: string;
      description: string;
      image: string;
      attributes?: Array<{ trait_type: string; value: string }>;
    }
  ) {
    try {
      // 1. Upload metadata to IPFS
      const metadata = {
        name: nftData.name,
        symbol: nftData.symbol,
        description: nftData.description,
        image: nftData.image,
        attributes: nftData.attributes || [],
        properties: {
          files: [{ uri: nftData.image, type: 'image/png' }],
          category: 'image',
        },
      };

      const metadataUri = await uploadToIPFS(metadata);
      console.log(`📄 Metadata uploaded to IPFS: ${metadataUri}`);

      // 2. Create mint account (from existing service)
      const mintResult = await this.createMintAccount(userPublicKey, relayerKeypair);
      if (!mintResult.success) {
        throw new Error(mintResult.error);
      }

      // 3. Create metadata account
      const metadataAccount = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          new PublicKey(mintResult.mintAddress!).toBuffer(),
        ],
        METADATA_PROGRAM_ID
      )[0];

      const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataAccount,
          mint: new PublicKey(mintResult.mintAddress!),
          mintAuthority: relayerKeypair.publicKey,
          payer: relayerKeypair.publicKey,
          updateAuthority: relayerKeypair.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: nftData.name,
              symbol: nftData.symbol,
              uri: metadataUri,
              sellerFeeBasisPoints: 0,
              creators: [
                {
                  address: relayerKeypair.publicKey,
                  verified: true,
                  share: 100,
                },
              ],
              collection: null,
              uses: null,
            },
            isMutable: false,
            collectionDetails: null,
          },
        }
      );

      // 4. Send metadata transaction
      const metadataTransaction = new Transaction().add(createMetadataInstruction);
      const { blockhash } = await this.connection.getLatestBlockhash();
      metadataTransaction.recentBlockhash = blockhash;
      metadataTransaction.feePayer = relayerKeypair.publicKey;

      const metadataSignature = await this.connection.sendTransaction(
        metadataTransaction,
        [relayerKeypair],
        { commitment: 'confirmed' }
      );

      console.log(`📄 Metadata transaction: ${metadataSignature}`);

      return {
        success: true,
        mintAddress: mintResult.mintAddress,
        userTokenAccount: mintResult.userTokenAccount,
        transactionSignature: mintResult.transactionSignature,
        metadataSignature,
        metadataUri,
        gasCost: mintResult.gasCost,
      };
    } catch (error) {
      console.error('❌ Error creating NFT with metadata:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async createMintAccount(userPublicKey: PublicKey, relayerKeypair: Keypair) {
    // Implementation from existing NFTMintService
    // This would be refactored to work with the metadata creation
    return { success: true, mintAddress: '', userTokenAccount: '', transactionSignature: '', gasCost: 0 };
  }
}