// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { assertCanCreateApiKey } from '../utils/quota';
import { prisma } from '../lib/prisma';
import { ensureOrganizerByEmail } from '../services/organizer.service';

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  company: z.string().min(1).max(100).optional(),
  password: z.string().min(6),
  type: z.enum(['user', 'organizer']).default('user'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(50),
});

export class AuthController {
  /**
   * REGISTRO (user u organizer)
   */
  static async register(req: Request, res: Response) {
    try {
      const { email, name, company, password, type } = registerSchema.parse(
        req.body
      );

      const existingUser = await prisma.user.findUnique({ where: { email } });
      const existingOrganizer = await prisma.organizer.findUnique({
        where: { email },
      });

      if (existingUser || existingOrganizer) {
        return res
          .status(400)
          .json({ success: false, error: 'El correo ya está registrado' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      let role: 'USER' | 'ORGANIZER';
      let account:
        | (typeof existingUser)
        | (typeof existingOrganizer)
        | Record<string, any>;

      if (type === 'organizer') {
        // Crea organizer "real"
        account = await prisma.organizer.create({
          data: {
            email,
            name,
            company,
            passwordHash,
            isActive: true,
            tier: 'free', // TEXT en minúsculas
          },
        });
        role = 'ORGANIZER';
      } else {
        // Crea usuario
        account = await prisma.user.create({
          data: {
            email,
            name,
            passwordHash,
            role: 'USER',
            isActive: true,
          },
        });
        role = 'USER';
      }

      // Asegura que exista su organizer (para no romper al crear campañas/API keys luego)
      const organizer = await ensureOrganizerByEmail(email, name);

      const token = jwt.sign(
        {
          id: account.id, // id del registro creado
          userId: role === 'USER' ? account.id : undefined,
          organizerId: organizer.id, // siempre presente
          email,
          role,
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      console.log(`✅ Nuevo ${role.toLowerCase()} registrado: ${email}`);

      return res.status(201).json({
        success: true,
        data: {
          id: account.id,
          email,
          name,
          company: (account as any).company ?? null,
          role,
          token,
          organizer: {
            id: organizer.id,
            email: organizer.email,
            name: organizer.name,
            tier: 'free',
          },
          redirect:
            role === 'USER' ? '/user' : role === 'ORGANIZER' ? '/dashboard' : '/',
        },
      });
    } catch (error) {
      console.error('❌ Error en registro:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: error.errors,
        });
      }
      return res
        .status(500)
        .json({ success: false, error: 'Error interno al registrar' });
    }
  }

  /**
   * LOGIN unificado
   */
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({ where: { email } });
      const organizer =
        !user && (await prisma.organizer.findUnique({ where: { email } }));

      const account: any = user || organizer;
      const role: 'USER' | 'ORGANIZER' | null = user
        ? 'USER'
        : organizer
        ? 'ORGANIZER'
        : null;

      if (!account || !account.isActive) {
        return res
          .status(401)
          .json({ success: false, error: 'Credenciales inválidas' });
      }

      const validPassword = await bcrypt.compare(
        password,
        account.passwordHash
      );
      if (!validPassword) {
        return res
          .status(401)
          .json({ success: false, error: 'Credenciales inválidas' });
      }

      // Asegura organizer (por si no existía)
      const ensuredOrg = await ensureOrganizerByEmail(email, account.name);

      const token = jwt.sign(
        {
          id: account.id,
          userId: role === 'USER' ? account.id : undefined,
          organizerId: ensuredOrg.id,
          email,
          role,
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      console.log(`✅ ${role} inició sesión: ${email}`);

      return res.json({
        success: true,
        data: {
          id: account.id,
          email,
          name: account.name,
          company: 'company' in account ? account.company : null,
          role,
          token,
          organizer: {
            id: ensuredOrg.id,
            email: ensuredOrg.email,
            name: ensuredOrg.name,
            tier: 'free',
          },
          redirect:
            role === 'USER' ? '/user' : role === 'ORGANIZER' ? '/dashboard' : '/',
        },
      });
    } catch (error) {
      console.error('❌ Error en login:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          details: error.errors,
        });
      }
      return res
        .status(500)
        .json({ success: false, error: 'Error interno al iniciar sesión' });
    }
  }

  /**
   * PERFIL de organizer
   */
  static async getProfile(req: any, res: Response) {
    try {
      const email = req.user?.email;
      if (!email) {
        return res
          .status(401)
          .json({ success: false, error: 'Autenticación requerida' });
      }

      // Siempre tomamos el organizer a partir del email autenticado
      const organizer = await prisma.organizer.findUnique({
        where: { email },
        include: {
          _count: { select: { campaigns: true, apiKeys: true } },
        },
      });

      if (!organizer) {
        return res
          .status(404)
          .json({ success: false, error: 'Organizador no encontrado' });
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
            totalApiKeys: organizer._count.apiKeys,
          },
          createdAt: organizer.createdAt,
        },
      });
    } catch (error) {
      console.error('❌ Error al obtener perfil:', error);
      return res
        .status(500)
        .json({ success: false, error: 'No se pudo obtener el perfil' });
    }
  }

  /**
   * CREAR API KEY (organizer)
   */


static async createApiKey(req: any, res: Response) {
  try {
    const { name } = createApiKeySchema.parse(req.body);

    const email = req.user?.email;
    if (!email) {
      return res.status(401).json({ success: false, error: 'Autenticación requerida' });
    }

    const organizer = await ensureOrganizerByEmail(email);

    // ✅ enforcer por plan
    await assertCanCreateApiKey(
      organizer.id,
      organizer.tier as any,
      async (orgId: string) => prisma.apiKey.count({ where: { organizerId: orgId, isActive: true } })
    );

    const key = `pk_${uuidv4().replace(/-/g, '')}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        key,
        name,
        organizerId: organizer.id,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: { id: apiKey.id, key: apiKey.key, name: apiKey.name, createdAt: apiKey.createdAt },
    });
  } catch (error: any) {
    if (error?.code === 'PLAN_LIMIT') {
      return res.status(error.status || 402).json({
        success: false,
        code: error.code,
        error: error.message,
        meta: { requiredPlan: 'pro' },
      });
    }
    console.error('❌ Error al crear API Key:', error);
    return res.status(500).json({ success: false, error: 'Error interno al crear API Key' });
  }
}


  /**
   * LISTAR API KEYS
   */
  static async listApiKeys(req: any, res: Response) {
    try {
      const email = req.user?.email;
      if (!email) {
        return res
          .status(401)
          .json({ success: false, error: 'Autenticación requerida' });
      }

      const organizer = await ensureOrganizerByEmail(email);

      const apiKeys = await prisma.apiKey.findMany({
        where: { organizerId: organizer.id },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, data: apiKeys });
    } catch (error) {
      console.error('❌ Error al listar API Keys:', error);
      return res
        .status(500)
        .json({ success: false, error: 'Error interno al listar API Keys' });
    }
  }

  /**
   * DESACTIVAR API KEY
   */
  static async deactivateApiKey(req: any, res: Response) {
    try {
      const { keyId } = req.params;

      const email = req.user?.email;
      if (!email) {
        return res
          .status(401)
          .json({ success: false, error: 'Autenticación requerida' });
      }

      const organizer = await ensureOrganizerByEmail(email);

      const apiKey = await prisma.apiKey.findFirst({
        where: { id: keyId, organizerId: organizer.id },
      });

      if (!apiKey) {
        return res
          .status(404)
          .json({ success: false, error: 'API Key no encontrada' });
      }

      await prisma.apiKey.update({
        where: { id: keyId },
        data: { isActive: false },
      });

      console.log(`🔒 API Key desactivada: ${apiKey.name}`);

      return res.json({
        success: true,
        message: 'API Key desactivada correctamente',
      });
    } catch (error) {
      console.error('❌ Error al desactivar API Key:', error);
      return res.status(500).json({
        success: false,
        error: 'Error interno al desactivar API Key',
      });
    }
  }
static async me(req: any, res: Response) {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ success: false, error: 'No auth' });
    }
    return res.json({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        organizerId: req.user.organizerId, // ← aquí
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Error en /me' });
  }
}
}

