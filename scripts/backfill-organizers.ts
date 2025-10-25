import { prisma } from '../src/lib/prisma';
import { ensureOrganizerByEmail } from '../src/services/organizer.service';

async function main() {
  const users = await prisma.user.findMany({ select: { email: true, name: true }});
  for (const u of users) {
    await ensureOrganizerByEmail(u.email, u.name ?? undefined);
  }
  console.log('Backfill OK');
}

main().finally(() => prisma.$disconnect());
