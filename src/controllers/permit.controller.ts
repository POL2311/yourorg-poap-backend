import { Request, Response } from 'express';
import { PublicKey, Keypair } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { SolanaService } from '../services/solana.service';
import { PermitService } from '../services/permit.service';
import { RelayerService } from '../services/relayer.service';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/errors';
import bs58 from 'bs58';

export class PermitController {
  private solanaService: SolanaService;
  private permitService: PermitService;
  private relayerService: RelayerService;

  constructor() {
    this.solanaService = new SolanaService();
    this.permitService = new PermitService();
    this.relayerService = new RelayerService();
  }

  // Create permit
  createPermit = async (req: Request, res: Response) => {
    try {
      const {
        userPublicKey,
        serviceId,
        instructionData,
        targetProgram,
        expiry,
        maxFee,
        signature
      } = req.body;

      // Validate inputs
      const user = new PublicKey(userPublicKey);
      const targetProgramPubkey = new PublicKey(targetProgram);
      const instructionBuffer = Buffer.from(instructionData, 'base64');
      const signatureBuffer = bs58.decode(signature);

      // Generate nonce
      const nonce = await this.permitService.generateNonce(user.toString(), serviceId);

      // Verify signature
      const isValidSignature = this.solanaService.verifyPermitSignature(
        user,
        serviceId,
        nonce,
        instructionBuffer,
        targetProgramPubkey,
        expiry,
        maxFee,
        signatureBuffer
      );

      if (!isValidSignature) {
        throw new ApiError(400, 'Invalid signature');
      }

      // Check if permit is expired
      if (Date.now() / 1000 > expiry) {
        throw new ApiError(400, 'Permit is expired');
      }

      // Validate service exists and is active
      const serviceInfo = await this.solanaService.getServiceInfo(serviceId);
      if (!serviceInfo.isActive) {
        throw new ApiError(400, 'Service is not active');
      }

      // Check if target program is whitelisted
      const isWhitelisted = serviceInfo.allowedPrograms.some(
        (program: PublicKey) => program.equals(targetProgramPubkey)
      );
      if (!isWhitelisted) {
        throw new ApiError(400, 'Target program is not whitelisted');
      }

      // Create permit in database
      const permit = await this.permitService.createPermit({
        userPublicKey: user.toString(),
        serviceId,
        nonce,
        instructionData: instructionData,
        targetProgram: targetProgram,
        expiry,
        maxFee,
        signature,
        status: 'pending'
      });

      // Create permit on-chain (using relayer as fee payer)
      const relayerKeypair = this.relayerService.getRelayerKeypair();
      
      const txSignature = await this.solanaService.createUserPermit(
        user,
        serviceId,
        new BN(nonce),
        instructionBuffer,
        targetProgramPubkey,
        new BN(expiry),
        new BN(maxFee),
        signatureBuffer,
        relayerKeypair
      );

      // Update permit with transaction signature
      await this.permitService.updatePermit(permit.id, {
        transactionSignature: txSignature
      });

      logger.info(`Permit created: ${permit.id} for user: ${userPublicKey}`);

      res.status(201).json({
        success: true,
        data: {
          permitId: permit.id,
          nonce,
          transactionSignature: txSignature,
          status: 'pending'
        }
      });
    } catch (error) {
      logger.error('Error creating permit:', error);
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  };

  // Get permit status
  getPermitStatus = async (req: Request, res: Response) => {
    try {
      const { permitId } = req.params;

      const permit = await this.permitService.getPermitById(permitId);
      if (!permit) {
        throw new ApiError(404, 'Permit not found');
      }

      // Check if permit is expired
      const isExpired = Date.now() / 1000 > permit.expiry;
      if (isExpired && permit.status === 'pending') {
        await this.permitService.updatePermit(permitId, { status: 'expired' });
        permit.status = 'expired';
      }

      res.json({
        success: true,
        data: {
          permitId: permit.id,
          status: permit.status,
          userPublicKey: permit.userPublicKey,
          serviceId: permit.serviceId,
          nonce: permit.nonce,
          expiry: permit.expiry,
          maxFee: permit.maxFee,
          transactionSignature: permit.transactionSignature,
          executedAt: permit.executedAt,
          createdAt: permit.createdAt
        }
      });
    } catch (error) {
      logger.error('Error getting permit status:', error);
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  };

  // Get user permits
  getUserPermits = async (req: Request, res: Response) => {
    try {
      const { userPublicKey } = req.params;
      const { serviceId, status, page = 1, limit = 20 } = req.query;

      const filters: any = { userPublicKey };
      if (serviceId) filters.serviceId = serviceId;
      if (status) filters.status = status;

      const permits = await this.permitService.getUserPermits(
        filters,
        parseInt(page as string),
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: permits
      });
    } catch (error) {
      logger.error('Error getting user permits:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  // Execute permit (relayer only)
  executePermit = async (req: Request, res: Response) => {
    try {
      const { permitId } = req.params;
      const { relayerPublicKey } = req.body;

      const permit = await this.permitService.getPermitById(permitId);
      if (!permit) {
        throw new ApiError(404, 'Permit not found');
      }

      if (permit.status !== 'pending') {
        throw new ApiError(400, 'Permit is not pending');
      }

      // Check if permit is expired
      if (Date.now() / 1000 > permit.expiry) {
        await this.permitService.updatePermit(permitId, { status: 'expired' });
        throw new ApiError(400, 'Permit is expired');
      }

      // Verify relayer is authorized
      const relayer = new PublicKey(relayerPublicKey);
      const isAuthorized = await this.relayerService.isRelayerAuthorized(relayer);
      if (!isAuthorized) {
        throw new ApiError(403, 'Relayer is not authorized');
      }

      // Execute gasless transaction
      const relayerKeypair = this.relayerService.getRelayerKeypair();
      const user = new PublicKey(permit.userPublicKey);

      const txSignature = await this.solanaService.executeGaslessTransaction(
        relayerKeypair,
        user,
        permit.serviceId,
        new BN(permit.nonce)
      );

      // Update permit status
      await this.permitService.updatePermit(permitId, {
        status: 'executed',
        executedAt: new Date(),
        executionTransactionSignature: txSignature
      });

      logger.info(`Permit executed: ${permitId} by relayer: ${relayerPublicKey}`);

      res.json({
        success: true,
        data: {
          permitId,
          transactionSignature: txSignature,
          status: 'executed'
        }
      });
    } catch (error) {
      logger.error('Error executing permit:', error);
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  };

  // Validate signature
  validateSignature = async (req: Request, res: Response) => {
    try {
      const {
        userPublicKey,
        serviceId,
        nonce,
        instructionData,
        targetProgram,
        expiry,
        maxFee,
        signature
      } = req.body;

      const user = new PublicKey(userPublicKey);
      const targetProgramPubkey = new PublicKey(targetProgram);
      const instructionBuffer = Buffer.from(instructionData, 'base64');
      const signatureBuffer = bs58.decode(signature);

      const isValid = this.solanaService.verifyPermitSignature(
        user,
        serviceId,
        nonce,
        instructionBuffer,
        targetProgramPubkey,
        expiry,
        maxFee,
        signatureBuffer
      );

      res.json({
        success: true,
        data: {
          isValid,
          userPublicKey,
          serviceId,
          nonce
        }
      });
    } catch (error) {
      logger.error('Error validating signature:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };

  // Get permit analytics
  getPermitAnalytics = async (req: Request, res: Response) => {
    try {
      const { serviceId, startDate, endDate } = req.query;

      const analytics = await this.permitService.getPermitAnalytics({
        serviceId: serviceId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      });

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      logger.error('Error getting permit analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };
}