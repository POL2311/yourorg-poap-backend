import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const prisma = new PrismaClient();

// ========================
// VALIDACIONES
// ========================
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  company: z.string().min(1).max(100).optional(),
  password: z.string().min(6),
  type: z.enum(['user', 'organizer']).default('user') // 👈 indica el tipo de registro
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
   * ========================
   * REGISTRO DE USUARIO / ORGANIZADOR
   * ========================
   */
  static async register(req: Request, res: Response) {
    try {
      const validatedData = registerSchema.parse(req.body);
      const { email, name, company, password, type } = validatedData;

      // Comprobamos si ya existe en User u Organizer
      const existingUser = await prisma.user.findUnique({ where: { email } });
      const existingOrganizer = await prisma.organizer.findUnique({ where: { email } });

      if (existingUser || existingOrganizer) {
        return res.status(400).json({
          success: false,
          error: 'El correo ya está registrado',
        });
      }

      // Encriptamos la contraseña
      const passwordHash = await bcrypt.hash(password, 12);

      let account: any;
      let role: string;

      if (type === 'organizer') {
        // Crear organizador
        account = await prisma.organizer.create({
          data: {
            email,
            name,
            company,
            passwordHash,
            isActive: true,
            tier: 'free',
          },
        });
        role = 'ORGANIZER';
      } else {
        // Crear usuario normal
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

      // Generamos el token JWT
      const token = jwt.sign(
        {
          id: account.id,
          userId: type === 'user' ? account.id : undefined,
          organizerId: type === 'organizer' ? account.id : undefined,
          email: account.email,
          role,
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      console.log(`✅ Nuevo ${role.toLowerCase()} registrado: ${account.email}`);

      return res.status(201).json({
        success: true,
        data: {
          id: account.id,
          email: account.email,
          name: account.name,
          company: account.company || null,
          role,
          token,
          // Para compatibilidad con el frontend, siempre devolver como 'organizer'
          organizer: {
            id: account.id,
            email: account.email,
            name: account.name,
            company: account.company || null,
            tier: type === 'organizer' ? 'free' : 'user',
            role: role,
            createdAt: account.createdAt,
          },
          redirect:
            role === 'USER'
              ? '/user'
              : role === 'ORGANIZER'
              ? '/dashboard'
              : '/admin',
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

      return res.status(500).json({
        success: false,
        error: 'Error interno al registrar',
      });
    }
  }

  /**
   * ========================
   * LOGIN UNIFICADO
   * ========================
   */
  static async login(req: Request, res: Response) {
    try {
      const validatedData = loginSchema.parse(req.body);
      const { email, password } = validatedData;

      // Buscar primero en users, luego en organizers
      const user = await prisma.user.findUnique({ where: { email } });
      const organizer = !user ? await prisma.organizer.findUnique({ where: { email } }) : null;

      const account = user || organizer;
      const role = user ? user.role : organizer ? 'ORGANIZER' : null;

      if (!account || !account.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Credenciales inválidas',
        });
      }

      // Verificar contraseña
      const validPassword = await bcrypt.compare(password, account.passwordHash);
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          error: 'Credenciales inválidas',
        });
      }

      // Generar token
      const token = jwt.sign(
        {
          id: account.id,
          userId: user ? user.id : undefined,
          organizerId: organizer ? organizer.id : undefined,
          email: account.email,
          role,
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      console.log(`✅ ${role} inició sesión: ${account.email}`);

      return res.json({
        success: true,
        data: {
          id: account.id,
          email: account.email,
          name: account.name,
          company: 'company' in account ? account.company : null,
          role,
          token,
          redirect:
            role === 'USER'
              ? '/user'
              : role === 'ORGANIZER'
              ? '/dashboard'
              : '/admin',
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

      return res.status(500).json({
        success: false,
        error: 'Error interno al iniciar sesión',
      });
    }
  }

  /**
   * ========================
   * PERFIL DE ORGANIZADOR
   * ========================
   */
  static async getProfile(req: any, res: Response) {
    try {
      const organizerId = req.user?.id || req.organizer?.id;

      if (!organizerId) {
        return res.status(401).json({
          success: false,
          error: 'Autenticación requerida',
        });
      }

      const organizer = await prisma.organizer.findUnique({
        where: { id: organizerId },
        include: {
          _count: {
            select: { campaigns: true, apiKeys: true },
          },
        },
      });

      if (!organizer) {
        return res.status(404).json({
          success: false,
          error: 'Organizador no encontrado',
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
            totalApiKeys: organizer._count.apiKeys,
          },
          createdAt: organizer.createdAt,
        },
      });
    } catch (error) {
      console.error('❌ Error al obtener perfil:', error);
      return res.status(500).json({
        success: false,
        error: 'No se pudo obtener el perfil',
      });
    }
  }

  /**
   * ========================
   * CREAR API KEY (solo ORGANIZER)
   * ========================
   */
  static async createApiKey(req: any, res: Response) {
    try {
      const validatedData = createApiKeySchema.parse(req.body);
      const organizerId = req.user?.id || req.organizer?.id;

      if (!organizerId) {
        return res.status(401).json({
          success: false,
          error: 'Autenticación requerida',
        });
      }

      const activeKeys = await prisma.apiKey.count({
        where: { organizerId, isActive: true },
      });

      if (activeKeys >= 10) {
        return res.status(400).json({
          success: false,
          error: 'Límite máximo de 10 API Keys alcanzado',
        });
      }

      const key = `pk_${uuidv4().replace(/-/g, '')}`;

      const apiKey = await prisma.apiKey.create({
        data: {
          key,
          name: validatedData.name,
          organizerId,
          isActive: true,
        },
      });

      console.log(`🔑 API Key creada: ${validatedData.name}`);

      return res.status(201).json({
        success: true,
        data: {
          id: apiKey.id,
          key: apiKey.key,
          name: apiKey.name,
          createdAt: apiKey.createdAt,
        },
      });
    } catch (error) {
      console.error('❌ Error al crear API Key:', error);
      return res.status(500).json({
        success: false,
        error: 'Error interno al crear API Key',
      });
    }
  }

  /**
   * ========================
   * LISTAR API KEYS
   * ========================
   */
  static async listApiKeys(req: any, res: Response) {
    try {
      const organizerId = req.user?.id || req.organizer?.id;

      if (!organizerId) {
        return res.status(401).json({
          success: false,
          error: 'Autenticación requerida',
        });
      }

      const apiKeys = await prisma.apiKey.findMany({
        where: { organizerId },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, data: apiKeys });
    } catch (error) {
      console.error('❌ Error al listar API Keys:', error);
      return res.status(500).json({
        success: false,
        error: 'Error interno al listar API Keys',
      });
    }
  }

  /**
   * ========================
   * DESACTIVAR API KEY
   * ========================
   */
  static async deactivateApiKey(req: any, res: Response) {
    try {
      const { keyId } = req.params;
      const organizerId = req.user?.id || req.organizer?.id;

      if (!organizerId) {
        return res.status(401).json({
          success: false,
          error: 'Autenticación requerida',
        });
      }

      const apiKey = await prisma.apiKey.findFirst({
        where: { id: keyId, organizerId },
      });

      if (!apiKey) {
        return res.status(404).json({
          success: false,
          error: 'API Key no encontrada',
        });
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
}
