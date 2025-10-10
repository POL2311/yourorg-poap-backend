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
  company: z.string().min(1).max(100),
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

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'User with this email already exists',
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(validatedData.password, 12);

      // Create organization and user in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create organization
        const organization = await tx.organization.create({
          data: {
            name: validatedData.company,
            isActive: true
          }
        });

        // Create user
        const user = await tx.user.create({
          data: {
            email: validatedData.email,
            name: validatedData.name,
            passwordHash,
            organizationId: organization.id,
            role: 'admin',
            isActive: true
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            organizationId: true,
            createdAt: true,
          },
        });

        return { user, organization };
      });

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: result.user.id,
          email: result.user.email,
          organizationId: result.user.organizationId,
          role: result.user.role
        },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      console.log(`✅ New user registered: ${result.user.email}`);

      return res.status(201).json({
        success: true,
        data: {
          user: result.user,
          organization: result.organization,
          token,
          message: 'User registered successfully',
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
   * Login user
   */
  static async login(req: Request, res: Response) {
    try {
      const validatedData = loginSchema.parse(req.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: validatedData.email },
        include: { organization: true }
      });

      if (!user || !user.isActive || !user.organization.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(
        validatedData.password,
        user.passwordHash
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
          userId: user.id,
          email: user.email,
          organizationId: user.organizationId,
          role: user.role
        },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      console.log(`✅ User logged in: ${user.email}`);

      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            organizationId: user.organizationId,
          },
          organization: {
            id: user.organization.id,
            name: user.organization.name
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
   * Get user profile
   */
  static async getProfile(req: any, res: Response) {
    try {
      const userId = req.user!.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          organization: true,
          _count: {
            select: {
              campaigns: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      return res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organization: user.organization,
          stats: {
            totalCampaigns: user._count.campaigns
          },
          createdAt: user.createdAt
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
      const organizationId = req.user!.organizationId;

      // Check API key limit (basic limit for now)
      const existingKeys = await prisma.apiKey.count({
        where: {
          organizationId,
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
          organizationId,
          isActive: true
        },
        select: {
          id: true,
          key: true,
          name: true,
          createdAt: true,
        },
      });

      console.log(`🔑 API key created for organization ${organizationId}: ${validatedData.name}`);

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
      const organizationId = req.user!.organizationId;

      const apiKeys = await prisma.apiKey.findMany({
        where: { organizationId },
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
      const organizationId = req.user!.organizationId;

      const apiKey = await prisma.apiKey.findFirst({
        where: {
          id: keyId,
          organizationId,
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