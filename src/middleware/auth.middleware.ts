// src/middleware/auth.middleware.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
// Reusa una sola instancia de Prisma
import { prisma } from '../lib/prisma';
import { ensureOrganizerByEmail } from '../services/organizer.service';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    organizerId: string;
    role: string;
  };
  organizer?: {
    id: string;
    email: string;
    tier: string;
    name: string;
  };
  apiKey?: {
    id: string;
    organizerId: string;
    name: string;
  };
}

/**
 * AUTH universal (user u organizer).
 * - Verifica JWT
 * - Busca cuenta por email (users/organizers)
 * - Garantiza organizer (free) con ensureOrganizerByEmail
 * - Pone req.user y req.organizer coherentes SIEMPRE
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as any;

    const email: string | undefined = decoded?.email;
    if (!email) {
      return res
        .status(401)
        .json({ success: false, error: 'Invalid token payload' });
    }

    // 1) intenta como user
    let account =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.organizer.findUnique({ where: { email } }));

    if (!account || !('isActive' in account) || !account.isActive) {
      return res
        .status(401)
        .json({ success: false, error: 'Invalid or inactive account' });
    }

    // 2) role “visible” para el front
    const role =
      'role' in account && account.role ? (account.role as string) : 'ORGANIZER';

    // 3) Garantiza organizer y cuelga en req
    const org = await ensureOrganizerByEmail(email, (account as any).name);


    req.organizer = {
      id: org.id,
      email: org.email,
      tier: org.tier,   // ← antes decía org.free
      name: org.name,
    };

    req.user = {
      id: (account as any).id,
      email,
      role,
      organizerId: org.id, // SIEMPRE presente
    };

    return next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
};

/**
 * API Key Authentication (permanece igual; sólo reusa prisma compartido)
 */
export const authenticateApiKey = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const apiKey =
    authHeader && authHeader.startsWith('ApiKey ')
      ? authHeader.substring(7)
      : null;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required. Use header: Authorization: ApiKey <your-key>',
    });
  }

  try {
    const keyRecord = await prisma.apiKey.findFirst({
      where: { key: apiKey, isActive: true },
      include: { organizer: true },
    });

    if (!keyRecord || !keyRecord.organizer.isActive) {
      return res
        .status(401)
        .json({ success: false, error: 'Invalid or inactive API key' });
    }

    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    req.apiKey = {
      id: keyRecord.id,
      organizerId: keyRecord.organizerId,
      name: keyRecord.name,
    };

    req.organizer = {
      id: keyRecord.organizer.id,
      email: keyRecord.organizer.email,
      tier: keyRecord.organizer.tier,
      name: keyRecord.organizer.name,
    };

    return next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

// Alias legacy (se mantiene)
export const authenticateToken = authenticate;

// Guard por rol (se mantiene tal cual)
export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
};

// Compat: delega en authenticate (no se elimina la export)
export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => authenticate(req, res, next);

/**
 * Verifica que el organizer exista/activo (por si alguna ruta lo requiere explícitamente)
 */
export const requireOrganization = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.organizer?.id) {
    return res
      .status(401)
      .json({ success: false, error: 'Authentication required' });
  }
  try {
    const organizer = await prisma.organizer.findUnique({
      where: { id: req.organizer.id },
    });
    if (!organizer || !organizer.isActive) {
      return res
        .status(403)
        .json({ success: false, error: 'Organizer not found or inactive' });
    }
    next();
  } catch {
    return res.status(500).json({ success: false, error: 'Database error' });
  }
};
