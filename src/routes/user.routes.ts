import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/user/profile
 * Devuelve la información del usuario autenticado
 */
router.get('/profile', authenticate, async (req: any, res) => {
  try {
    if (!req.user || req.user.role !== 'USER') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: not a user account',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
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
      data: user,
    });
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
