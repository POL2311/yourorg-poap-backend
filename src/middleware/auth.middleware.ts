import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
  };
  apiKey?: {
    id: string;
    organizationId: string;
    name: string;
  };
}

// JWT Authentication (for dashboard/organizer operations)
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { organization: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'Invalid or inactive user' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role
    };

    next();
  } catch (error) {
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
};

// API Key Authentication (for POAP claiming operations)
export const authenticateApiKey = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const apiKey = authHeader && authHeader.startsWith('ApiKey ') 
    ? authHeader.substring(7) 
    : null;

  if (!apiKey) {
    return res.status(401).json({ 
      success: false, 
      error: 'API key required. Use header: Authorization: ApiKey <your-key>' 
    });
  }

  try {
    // Find active API key
    const keyRecord = await prisma.apiKey.findFirst({
      where: { 
        key: apiKey,
        isActive: true 
      },
      include: { organization: true }
    });

    if (!keyRecord || !keyRecord.organization.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or inactive API key' 
      });
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() }
    });

    req.apiKey = {
      id: keyRecord.id,
      organizationId: keyRecord.organizationId,
      name: keyRecord.name
    };

    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication error' 
    });
  }
};

// Legacy alias for backward compatibility
export const authenticateToken = authenticate;

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }
    next();
  };
};

export const requireOrganization = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const organization = await prisma.organization.findUnique({
      where: { id: req.user.organizationId }
    });

    if (!organization || !organization.isActive) {
      return res.status(403).json({ 
        success: false, 
        error: 'Organization not found or inactive' 
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Database error' });
  }
};