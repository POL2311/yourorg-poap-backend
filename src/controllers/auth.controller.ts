import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const prisma = new PrismaClient();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  company: z.string().min(1).max(100).optional(),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(50)
});

export class AuthController {
  /**
   * Register new organizer
   */
  static async register(req: Request, res: Response) {
    try {
      const validatedData = registerSchema.parse(req.body);

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
      const passwordHash = await bcrypt.hash(validatedData.password, 12);

      // Create organizer
      const organizer = await prisma.organizer.create({
        data: {
          email: validatedData.email,
          name: validatedData.name,
          company: validatedData.company,
          passwordHash,
          isActive: true,
          tier: 'free'
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
      const token = jwt.sign(
        {
          organizerId: organizer.id,
          email: organizer.email,
          tier: organizer.tier
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

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
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
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
      const validatedData = loginSchema.parse(req.body);

      // Find organizer
      const organizer = await prisma.organizer.findUnique({
        where: { email: validatedData.email },
      });

      if (!organizer || !organizer.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(
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
      const token = jwt.sign(
        {
          organizerId: organizer.id,
          email: organizer.email,
          tier: organizer.tier
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

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
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
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
  static async getProfile(req: any, res: Response) {
    try {
      const organizerId = req.user?.id || req.organizer?.id;

      if (!organizerId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const organizer = await prisma.organizer.findUnique({
        where: { id: organizerId },
        include: {
          _count: {
            select: {
              campaigns: true,
              apiKeys: true
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
        data: {
          id: organizer.id,
          email: organizer.email,
          name: organizer.name,
          company: organizer.company,
          tier: organizer.tier,
          stats: {
            totalCampaigns: organizer._count.campaigns,
            totalApiKeys: organizer._count.apiKeys
          },
          createdAt: organizer.createdAt
        },
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
  static async createApiKey(req: any, res: Response) {
    try {
      const validatedData = createApiKeySchema.parse(req.body);
      const organizerId = req.user?.id || req.organizer?.id;

      if (!organizerId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Check API key limit (basic limit for now)
      const existingKeys = await prisma.apiKey.count({
        where: {
          organizerId,
          isActive: true,
        },
      });

      if (existingKeys >= 10) {
        return res.status(400).json({
          success: false,
          error: 'Maximum API keys reached (10)',
        });
      }

      // Generate API key
      const key = `pk_${uuidv4().replace(/-/g, '')}`;

      const apiKey = await prisma.apiKey.create({
        data: {
          key,
          name: validatedData.name,
          organizerId,
          isActive: true
        },
        select: {
          id: true,
          key: true,
          name: true,
          createdAt: true,
        },
      });

      console.log(`🔑 API key created for organizer ${organizerId}: ${validatedData.name}`);

      return res.status(201).json({
        success: true,
        data: {
          ...apiKey,
          message: 'API key created successfully',
        },
      });
    } catch (error) {
      console.error('❌ Create API key error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
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
  static async listApiKeys(req: any, res: Response) {
    try {
      const organizerId = req.user?.id || req.organizer?.id;

      if (!organizerId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

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
  static async deactivateApiKey(req: any, res: Response) {
    try {
      const { keyId } = req.params;
      const organizerId = req.user?.id || req.organizer?.id;

      if (!organizerId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

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