// src/services/organizer.service.ts
import { prisma } from '../lib/prisma';

/**
 * Garantiza que exista un Organizer para el email dado.
 * - Si ya existe, lo devuelve.
 * - Si no existe, lo crea con valores por defecto.
 */
export async function ensureOrganizerByEmail(email: string, name?: string) {
  const safeName = name ?? email.split('@')[0];
  const organizer = await prisma.organizer.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: safeName,
      passwordHash: 'DUMMY',
      tier: 'free',
      isActive: true,
    },
    select: { id: true, email: true, name: true, tier: true }, // ← tier incluido
  });
  return organizer;
}
