import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../services/auth.service';

const prisma = new PrismaClient();

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      organizer?: {
        id: string;
        email: string;
        tier: string;
      };
    }
  }
}

/**
 * JWT Authentication Middleware
 */
export const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = AuthService.extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
      });
    }

    const payload = AuthService.verifyToken(token);
    
    // Verify organizer still exists and is active
    const organizer = await prisma.organizer.findFirst({
      where: {
        id: payload.organizerId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        tier: true,
      },
    });

    if (!organizer) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    req.organizer = organizer;
    next();
  } catch (error) {
    console.error('JWT authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
};

/**
 * API Key Authentication Middleware
 */
export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = AuthService.extractApiKeyFromHeader(req.headers.authorization);
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
      });
    }

    // Find and validate API key
    const keyRecord = await prisma.apiKey.findFirst({
      where: {
        key: apiKey,
        isActive: true,
      },
      include: {
        organizer: {
          select: {
            id: true,
            email: true,
            tier: true,
            isActive: true,
          },
        },
      },
    });

    if (!keyRecord || !keyRecord.organizer.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
      });
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    req.organizer = keyRecord.organizer;
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

/**
 * Flexible authentication - accepts both JWT and API key
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: 'Authorization header required',
    });
  }

  if (authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  } else if (authHeader.startsWith('ApiKey ')) {
    return authenticateApiKey(req, res, next);
  } else {
    return res.status(401).json({
      success: false,
      error: 'Invalid authorization format. Use "Bearer <token>" or "ApiKey <key>"',
    });
  }
};