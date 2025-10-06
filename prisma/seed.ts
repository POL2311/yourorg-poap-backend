import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo organizer
  const hashedPassword = await bcrypt.hash('demo123', 10);
  
  const demoOrganizer = await prisma.organizer.upsert({
    where: { email: 'demo@poap-infra.com' },
    update: {},
    create: {
      email: 'demo@poap-infra.com',
      name: 'Demo Organizer',
      company: 'POAP Infrastructure Demo',
      passwordHash: hashedPassword,
      tier: 'pro',
    },
  });

  console.log('👤 Created demo organizer:', demoOrganizer.email);

  // Create API key for demo organizer
  const apiKey = await prisma.apiKey.upsert({
    where: { key: 'demo_' + uuidv4().replace(/-/g, '') },
    update: {},
    create: {
      key: 'demo_' + uuidv4().replace(/-/g, ''),
      name: 'Demo API Key',
      organizerId: demoOrganizer.id,
    },
  });

  console.log('🔑 Created API key:', apiKey.key);

  // Create demo campaign
  const demoCampaign = await prisma.campaign.upsert({
    where: { id: 'demo-campaign-id' },
    update: {},
    create: {
      id: 'demo-campaign-id',
      name: 'Solana Breakpoint 2024',
      description: 'Official POAP for Solana Breakpoint 2024 attendees',
      eventDate: new Date('2024-09-20'),
      location: 'Singapore',
      imageUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=breakpoint2024&backgroundColor=6366f1',
      externalUrl: 'https://solana.com/breakpoint',
      secretCode: 'BREAKPOINT2024',
      maxClaims: 1000,
      organizerId: demoOrganizer.id,
      metadata: {
        type: 'conference',
        category: 'blockchain',
        tags: ['solana', 'web3', 'defi'],
      },
    },
  });

  console.log('🎪 Created demo campaign:', demoCampaign.name);

  console.log('✅ Database seeded successfully!');
  console.log('\n📋 Demo Credentials:');
  console.log(`Email: ${demoOrganizer.email}`);
  console.log(`Password: demo123`);
  console.log(`API Key: ${apiKey.key}`);
  console.log(`Campaign ID: ${demoCampaign.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });