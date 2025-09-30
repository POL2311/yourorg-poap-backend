import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { logger } from '../utils/logger';
import { GaslessInfrastructure } from '../types/anchor-types';
import idl from '../idl/gasless_infrastructure.json';

export class SolanaService {
  private connection: Connection;
  private program: Program<GaslessInfrastructure>;
  private provider: AnchorProvider;
  private programId: PublicKey;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    this.programId = new PublicKey(process.env.PROGRAM_ID!);
    
    // Create a dummy wallet for read-only operations
    const dummyKeypair = Keypair.generate();
    const wallet = new Wallet(dummyKeypair);
    
    this.provider = new AnchorProvider(this.connection, wallet, {
      commitment: 'confirmed'
    });
    
    this.program = new Program(idl as any, this.programId, this.provider);
  }

  // Get protocol PDA
  getProtocolPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('gasless_protocol')],
      this.programId
    );
  }

  // Get service provider PDA
  getServiceProviderPDA(serviceId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('service'), Buffer.from(serviceId)],
      this.programId
    );
  }

  // Get user permit PDA
  getUserPermitPDA(user: PublicKey, service: PublicKey, nonce: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('permit'),
        user.toBuffer(),
        service.toBuffer(),
        nonce.toArrayLike(Buffer, 'le', 8)
      ],
      this.programId
    );
  }

  // Get relayer config PDA
  getRelayerConfigPDA(relayer: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('relayer'), relayer.toBuffer()],
      this.programId
    );
  }

  // Get fee vault PDA
  getFeeVaultPDA(service: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('fee_vault'), service.toBuffer()],
      this.programId
    );
  }

  // Initialize protocol (admin only)
  async initializeProtocol(
    admin: Keypair,
    masterTreasury: PublicKey,
    protocolFeeBps: number
  ): Promise<string> {
    try {
      const [protocolPDA] = this.getProtocolPDA();

      const tx = await this.program.methods
        .initializeProtocol(protocolFeeBps)
        .accounts({
          protocol: protocolPDA,
          admin: admin.publicKey,
          masterTreasury,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      logger.info(`Protocol initialized: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error initializing protocol:', error);
      throw error;
    }
  }

  // Register service
  async registerService(
    owner: Keypair,
    serviceId: string,
    feeCollector: PublicKey,
    serviceFeeBps: number,
    maxTransactionAmount: BN,
    allowedPrograms: PublicKey[]
  ): Promise<string> {
    try {
      const [protocolPDA] = this.getProtocolPDA();
      const [servicePDA] = this.getServiceProviderPDA(serviceId);
      const [feeVaultPDA] = this.getFeeVaultPDA(servicePDA);

      // Get USDC mint (you'll need to set this in env)
      const usdcMint = new PublicKey(process.env.USDC_MINT!);
      
      // Get vault authority PDA for USDC vault
      const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_authority'), servicePDA.toBuffer()],
        this.programId
      );

      const usdcVault = await getAssociatedTokenAddress(
        usdcMint,
        vaultAuthority,
        true
      );

      const tx = await this.program.methods
        .registerService(
          serviceId,
          serviceFeeBps,
          maxTransactionAmount,
          allowedPrograms
        )
        .accounts({
          protocol: protocolPDA,
          service: servicePDA,
          feeVault: feeVaultPDA,
          owner: owner.publicKey,
          feeCollector,
          usdcVault,
          usdcMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      logger.info(`Service registered: ${serviceId}, tx: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error registering service:', error);
      throw error;
    }
  }

  // Create user permit
  async createUserPermit(
    user: PublicKey,
    serviceId: string,
    nonce: BN,
    instructionData: Buffer,
    targetProgram: PublicKey,
    expiry: BN,
    maxFee: BN,
    signature: Buffer,
    payer: Keypair
  ): Promise<string> {
    try {
      const [servicePDA] = this.getServiceProviderPDA(serviceId);
      const [userPermitPDA] = this.getUserPermitPDA(user, servicePDA, nonce);

      const tx = await this.program.methods
        .createUserPermit(
          nonce,
          Array.from(instructionData),
          targetProgram,
          expiry,
          maxFee,
          Array.from(signature)
        )
        .accounts({
          service: servicePDA,
          userPermit: userPermitPDA,
          user,
          feePayer: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      logger.info(`User permit created: ${userPermitPDA.toString()}, tx: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error creating user permit:', error);
      throw error;
    }
  }

  // Execute gasless transaction
  async executeGaslessTransaction(
    relayer: Keypair,
    user: PublicKey,
    serviceId: string,
    nonce: BN
  ): Promise<string> {
    try {
      const [protocolPDA] = this.getProtocolPDA();
      const [servicePDA] = this.getServiceProviderPDA(serviceId);
      const [userPermitPDA] = this.getUserPermitPDA(user, servicePDA, nonce);
      const [relayerConfigPDA] = this.getRelayerConfigPDA(relayer.publicKey);
      const [feeVaultPDA] = this.getFeeVaultPDA(servicePDA);

      const tx = await this.program.methods
        .executeGaslessTransaction(nonce)
        .accounts({
          protocol: protocolPDA,
          service: servicePDA,
          userPermit: userPermitPDA,
          relayerConfig: relayerConfigPDA,
          feeVault: feeVaultPDA,
          relayer: relayer.publicKey,
          user,
          systemProgram: SystemProgram.programId,
        })
        .signers([relayer])
        .rpc();

      logger.info(`Gasless transaction executed: ${tx}`);
      return tx;
    } catch (error) {
      logger.error('Error executing gasless transaction:', error);
      throw error;
    }
  }

  // Get service info
  async getServiceInfo(serviceId: string) {
    try {
      const [servicePDA] = this.getServiceProviderPDA(serviceId);
      const serviceAccount = await this.program.account.serviceProvider.fetch(servicePDA);
      return serviceAccount;
    } catch (error) {
      logger.error('Error fetching service info:', error);
      throw error;
    }
  }

  // Get protocol info
  async getProtocolInfo() {
    try {
      const [protocolPDA] = this.getProtocolPDA();
      const protocolAccount = await this.program.account.gaslessProtocol.fetch(protocolPDA);
      return protocolAccount;
    } catch (error) {
      logger.error('Error fetching protocol info:', error);
      throw error;
    }
  }

  // Get user permit info
  async getUserPermitInfo(user: PublicKey, serviceId: string, nonce: BN) {
    try {
      const [servicePDA] = this.getServiceProviderPDA(serviceId);
      const [userPermitPDA] = this.getUserPermitPDA(user, servicePDA, nonce);
      const permitAccount = await this.program.account.userPermit.fetch(userPermitPDA);
      return permitAccount;
    } catch (error) {
      logger.error('Error fetching user permit info:', error);
      throw error;
    }
  }

  // Verify signature (off-chain verification)
  verifyPermitSignature(
    user: PublicKey,
    serviceId: string,
    nonce: number,
    instructionData: Buffer,
    targetProgram: PublicKey,
    expiry: number,
    maxFee: number,
    signature: Buffer
  ): boolean {
    try {
      // Create message to verify
      const message = Buffer.concat([
        Buffer.from('gasless_permit'),
        user.toBuffer(),
        Buffer.from(serviceId),
        Buffer.from(nonce.toString()),
        instructionData,
        targetProgram.toBuffer(),
        Buffer.from(expiry.toString()),
        Buffer.from(maxFee.toString())
      ]);

      // Verify signature using tweetnacl
      const nacl = require('tweetnacl');
      return nacl.sign.detached.verify(
        message,
        signature,
        user.toBuffer()
      );
    } catch (error) {
      logger.error('Error verifying signature:', error);
      return false;
    }
  }
}