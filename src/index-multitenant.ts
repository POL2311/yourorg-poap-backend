// src/index-multitenant.ts - MULTI-TENANT SAAS BACKEND
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

// Controllers
import { AuthController } from './controllers/auth.controller';
import { CampaignController } from './controllers/campaign.controller';
import { MultiTenantNFTController } from './controllers/multi-tenant-nft.controller';
import { NFTClaimController } from './controllers/nft-claim.controller'; // Legacy support

// Middleware
import { authenticate, authenticateApiKey } from './middleware/auth.middleware';

const app = express();
const prisma = new PrismaClient();

// ===== MIDDLEWARE =====

app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
});
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
  },
});

// ===== INITIALIZE CONTROLLERS =====

let multiTenantNFTController: MultiTenantNFTController;
let legacyNFTController: NFTClaimController;

try {
  multiTenantNFTController = new MultiTenantNFTController();
  legacyNFTController = new NFTClaimController(); // For backward compatibility
  console.log('✅ Controllers initialized');
} catch (error) {
  console.error('❌ Error initializing controllers:', error);
  process.exit(1);
}

// ===== HEALTH CHECK =====

app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      ok: true,
      uptime: process.uptime(),
      service: 'Multi-Tenant POAP Infrastructure - SaaS Backend',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      database: 'connected',
      relayerConfigured: !!process.env.RELAYER_PRIVATE_KEY,
      rpcUrl: process.env.SOLANA_RPC_URL,
      network: 'devnet',
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// ===== AUTHENTICATION ROUTES =====

app.post('/api/auth/register', authLimiter, AuthController.register);
app.post('/api/auth/login', authLimiter, AuthController.login);
app.get('/api/auth/profile', authenticate, AuthController.getProfile);

// API Key management
app.post('/api/auth/api-keys', authenticate, AuthController.createApiKey);
app.get('/api/auth/api-keys', authenticate, AuthController.listApiKeys);
app.delete('/api/auth/api-keys/:keyId', authenticate, AuthController.deactivateApiKey);

// ===== CAMPAIGN MANAGEMENT ROUTES (JWT Auth) =====

app.post('/api/campaigns', authenticate, CampaignController.createCampaign);
app.get('/api/campaigns', authenticate, CampaignController.listCampaigns);
app.get('/api/campaigns/:campaignId', authenticate, CampaignController.getCampaign);
app.put('/api/campaigns/:campaignId', authenticate, CampaignController.updateCampaign);
app.delete('/api/campaigns/:campaignId', authenticate, CampaignController.deleteCampaign);

// Campaign analytics
app.get('/api/campaigns/:campaignId/analytics', authenticate, CampaignController.getCampaignAnalytics);
app.get('/api/campaigns/:campaignId/claims', authenticate, CampaignController.getCampaignClaims);

// ===== PUBLIC POAP CLAIMING ROUTES (API Key Auth) =====

// Main POAP claiming endpoint
app.post('/api/poap/claim', authenticateApiKey, multiTenantNFTController.claimPOAP);

// Public campaign info (no auth required)
app.get('/api/campaigns/:campaignId/public', multiTenantNFTController.getPublicCampaign);

// User's POAPs across all campaigns (no auth required)
app.get('/api/poap/user/:userPublicKey', multiTenantNFTController.getUserPOAPs);

// ===== SYSTEM ROUTES =====

// Relayer statistics
app.get('/api/relayer/stats', multiTenantNFTController.getRelayerStats);

// ===== LEGACY COMPATIBILITY ROUTES =====

// Legacy demo endpoint (for backward compatibility)
app.post('/api/nft/claim-magical', legacyNFTController.claimNFTMagical);
app.post('/api/nft/claim-with-signature', legacyNFTController.claimNFTWithSignature);
app.get('/api/nft/user/:userPublicKey', legacyNFTController.getUserNFTs);

// Legacy permits endpoint
app.get('/api/permits', (req, res) => {
  res.json({
    ok: true,
    message: 'Multi-Tenant POAP Infrastructure API v2.0',
    network: 'devnet',
    migration: {
      notice: 'This API has been upgraded to multi-tenant SaaS platform',
      newEndpoints: [
        'POST /api/auth/register - Register as organizer',
        'POST /api/auth/login - Login organizer',
        'POST /api/campaigns - Create POAP campaign',
        'POST /api/poap/claim - Claim POAP (requires API key)',
      ],
      legacySupport: [
        'POST /api/nft/claim-magical - Legacy demo endpoint',
      ],
    },
  });
});

app.post('/api/permits/create', (req, res) => {
  console.log('🔄 Legacy permit endpoint hit, redirecting to demo...');
  legacyNFTController.claimNFTMagical(req, res);
});

// ===== DOCUMENTATION ROUTE =====

app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Multi-Tenant POAP Infrastructure API',
    version: '2.0.0',
    description: 'SaaS platform for gasless POAP minting on Solana',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    authentication: {
      jwt: {
        description: 'For organizer dashboard operations',
        header: 'Authorization: Bearer <token>',
        endpoints: ['/auth/*', '/campaigns/*'],
      },
      apiKey: {
        description: 'For POAP claiming operations',
        header: 'Authorization: ApiKey <key>',
        endpoints: ['/poap/claim'],
      },
    },
    endpoints: {
      auth: {
        'POST /auth/register': 'Register new organizer',
        'POST /auth/login': 'Login organizer',
        'GET /auth/profile': 'Get organizer profile',
        'POST /auth/api-keys': 'Create API key',
        'GET /auth/api-keys': 'List API keys',
        'DELETE /auth/api-keys/:keyId': 'Deactivate API key',
      },
      campaigns: {
        'POST /campaigns': 'Create campaign',
        'GET /campaigns': 'List campaigns',
        'GET /campaigns/:id': 'Get campaign',
        'PUT /campaigns/:id': 'Update campaign',
        'DELETE /campaigns/:id': 'Delete campaign',
        'GET /campaigns/:id/analytics': 'Campaign analytics',
        'GET /campaigns/:id/claims': 'Campaign claims',
      },
      poap: {
        'POST /poap/claim': 'Claim POAP (API key required)',
        'GET /campaigns/:id/public': 'Public campaign info',
        'GET /poap/user/:userPublicKey': 'User POAPs',
      },
      system: {
        'GET /health': 'Health check',
        'GET /relayer/stats': 'Relayer statistics',
      },
    },
    examples: {
      registerOrganizer: {
        url: 'POST /api/auth/register',
        body: {
          email: 'organizer@example.com',
          name: 'Event Organizer',
          company: 'My Company',
          password: 'securepassword',
        },
      },
      createCampaign: {
        url: 'POST /api/campaigns',
        headers: { Authorization: 'Bearer <jwt_token>' },
        body: {
          name: 'My Event 2024',
          description: 'Amazing blockchain event',
          eventDate: '2024-12-31T23:59:59Z',
          location: 'Virtual',
          secretCode: 'MYEVENT2024',
          maxClaims: 1000,
        },
      },
      claimPOAP: {
        url: 'POST /api/poap/claim',
        headers: { Authorization: 'ApiKey <api_key>' },
        body: {
          userPublicKey: 'user_solana_public_key',
          campaignId: 'campaign_id',
          secretCode: 'MYEVENT2024',
        },
      },
    },
  });
});

// ===== ERROR HANDLING =====

app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /api/docs',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/campaigns',
      'POST /api/poap/claim',
    ],
  });
});

// ===== GRACEFUL SHUTDOWN =====

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// ===== START SERVER =====

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log('🚀 MULTI-TENANT POAP INFRASTRUCTURE STARTED');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('🎯 NEW ENDPOINTS:');
  console.log(`   📝 Register: POST /api/auth/register`);
  console.log(`   🔐 Login: POST /api/auth/login`);
  console.log(`   🎪 Campaigns: POST /api/campaigns`);
  console.log(`   🏅 Claim POAP: POST /api/poap/claim`);
  console.log('');
  console.log('🔄 LEGACY SUPPORT:');
  console.log(`   🎨 Demo NFT: POST /api/nft/claim-magical`);
  console.log('');
  console.log('🌐 Network: Solana Devnet');
  console.log('🎨 Ready for multi-tenant POAP minting!');
});