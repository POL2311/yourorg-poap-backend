// src/services/auth.service.ts
import jwt, { type SignOptions, type Secret, type JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET: Secret =
  (process.env.JWT_SECRET as string) || 'your-super-secret-jwt-key-change-in-production';

const JWT_EXPIRES_IN: SignOptions['expiresIn'] =
  ((process.env.JWT_EXPIRES_IN as string) || '7d') as SignOptions['expiresIn'];

export interface JWTPayload extends JwtPayload {
  organizerId: string;
  email: string;
  tier: string;
}

export class AuthService {
  /** Hash password */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /** Verify password */
  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  /** Generate JWT token */
  static generateToken(payload: JWTPayload): string {
    const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
    return jwt.sign(payload, JWT_SECRET, options);
  }

  /** Verify JWT token */
  static verifyToken(token: string): JWTPayload {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  }

  /** Generate API key */
  static generateApiKey(): string {
    return 'pk_' + uuidv4().replace(/-/g, '');
  }

  /** Extract token from Authorization header */
  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
  }

  /** Extract API key from header */
  static extractApiKeyFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('ApiKey ')) return null;
    return authHeader.substring(7);
  }
}
