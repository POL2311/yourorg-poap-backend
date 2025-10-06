import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../services/auth.service';
import { RegisterOrganizerSchema, LoginOrganizerSchema, CreateApiKeySchema } from '../schemas';

const prisma = new PrismaClient();

export class AuthController {
  /**
   * Register new organizer
   */
  static async register(req: Request, res: Response) {
    try {
      const validatedData = RegisterOrganizerSchema.parse(req.body);

      // Check if organizer already exists
      const existingOrganizer = await prisma.organizer.findUnique({
        where: { email: validatedData.email },
      });

      if (existingOrganizer) {
        return res.status(400).json({
          success: false,
          error: 'Organizer with this email already exists',
        });
      }

      // Hash password
      const passwordHash = await AuthService.hashPassword(validatedData.password);

      // Create organizer
      const organizer = await prisma.organizer.create({
        data: {
          email: validatedData.email,
          name: validatedData.name,
          company: validatedData.company,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          tier: true,
          createdAt: true,
        },
      });

      // Generate JWT token
      const token = AuthService.generateToken({
        organizerId: organizer.id,
        email: organizer.email,
        tier: organizer.tier,
      });

      console.log(`✅ New organizer registered: ${organizer.email}`);

      return res.status(201).json({
        success: true,
        data: {
          organizer,
          token,
          message: 'Organizer registered successfully',
        },
      });
    } catch (error) {
      console.error('❌ Registration error:', error);
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Registration failed',
      });
    }
  }

  /**
   * Login organizer
   */
  static async login(req: Request, res: Response) {
    try {
      const validatedData = LoginOrganizerSchema.parse(req.body);

      // Find organizer
      const organizer = await prisma.organizer.findUnique({
        where: { email: validatedData.email },
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          tier: true,
          passwordHash: true,
          isActive: true,
        },
      });

      if (!organizer || !organizer.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Verify password
      const isValidPassword = await AuthService.verifyPassword(
        validatedData.password,
        organizer.passwordHash
      );

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Generate JWT token
      const token = AuthService.generateToken({
        organizerId: organizer.id,
        email: organizer.email,
        tier: organizer.tier,
      });

      console.log(`✅ Organizer logged in: ${organizer.email}`);

      return res.json({
        success: true,
        data: {
          organizer: {
            id: organizer.id,
            email: organizer.email,
            name: organizer.name,
            company: organizer.company,
            tier: organizer.tier,
          },
          token,
          message: 'Login successful',
        },
      });
    } catch (error) {
      console.error('❌ Login error:', error);
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Login failed',
      });
    }
  }

  /**
   * Get organizer profile
   */
  static async getProfile(req: Request, res: Response) {
    try {
      const organizerId = req.organizer!.id;

      const organizer = await prisma.organizer.findUnique({
        where: { id: organizerId },
        select: {
          id: true,
          email: true,
          name: true,
          company: true,
          tier: true,
          createdAt: true,
          _count: {
            select: {
              campaigns: true,
              apiKeys: true,
            },
          },
        },
      });

      if (!organizer) {
        return res.status(404).json({
          success: false,
          error: 'Organizer not found',
        });
      }

      return res.json({
        success: true,
        data: organizer,
      });
    } catch (error) {
      console.error('❌ Get profile error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get profile',
      });
    }
  }

  /**
   * Create API key
   */
  static async createApiKey(req: Request, res: Response) {
    try {
      const validatedData = CreateApiKeySchema.parse(req.body);
      const organizerId = req.organizer!.id;

      // Check API key limit based on tier
      const existingKeys = await prisma.apiKey.count({
        where: {
          organizerId,
          isActive: true,
        },
      });

      const tier = req.organizer!.tier;
      const maxKeys = tier === 'free' ? 2 : tier === 'pro' ? 10 : 50;

      if (existingKeys >= maxKeys) {
        return res.status(400).json({
          success: false,
          error: `Maximum API keys reached for ${tier} tier (${maxKeys})`,
        });
      }

      // Generate API key
      const key = AuthService.generateApiKey();

      const apiKey = await prisma.apiKey.create({
        data: {
          key,
          name: validatedData.name,
          organizerId,
        },
        select: {
          id: true,
          key: true,
          name: true,
          createdAt: true,
        },
      });

      console.log(`🔑 API key created for organizer ${req.organizer!.email}: ${validatedData.name}`);

      return res.status(201).json({
        success: true,
        data: {
          ...apiKey,
          message: 'API key created successfully',
        },
      });
    } catch (error) {
      console.error('❌ Create API key error:', error);
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create API key',
      });
    }
  }

  /**
   * List API keys
   */
  static async listApiKeys(req: Request, res: Response) {
    try {
      const organizerId = req.organizer!.id;

      const apiKeys = await prisma.apiKey.findMany({
        where: { organizerId },
        select: {
          id: true,
          name: true,
          key: true,
          isActive: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({
        success: true,
        data: apiKeys,
      });
    } catch (error) {
      console.error('❌ List API keys error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to list API keys',
      });
    }
  }

  /**
   * Deactivate API key
   */
  static async deactivateApiKey(req: Request, res: Response) {
    try {
      const { keyId } = req.params;
      const organizerId = req.organizer!.id;

      const apiKey = await prisma.apiKey.findFirst({
        where: {
          id: keyId,
          organizerId,
        },
      });

      if (!apiKey) {
        return res.status(404).json({
          success: false,
          error: 'API key not found',
        });
      }

      await prisma.apiKey.update({
        where: { id: keyId },
        data: { isActive: false },
      });

      console.log(`🔑 API key deactivated: ${apiKey.name}`);

      return res.json({
        success: true,
        message: 'API key deactivated successfully',
      });
    } catch (error) {
      console.error('❌ Deactivate API key error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to deactivate API key',
      });
    }
  }
}