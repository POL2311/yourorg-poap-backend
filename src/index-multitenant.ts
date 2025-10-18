// src/index-multitenant.ts - ENHANCED VERSION WITH SYSTEM MONITORING + USER SUPPORT
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Controllers
import { AuthController } from './controllers/auth.controller';
import { CampaignController } from './controllers/campaign.controller';
import { MultiTenantNFTController } from './controllers/multi-tenant-nft.controller';
import { NFTClaimController } from './controllers/nft-claim.controller'; // Legacy support
import { SystemController } from './controllers/system.controller';
import { AnalyticsController } from './controllers/analytics.controller';

// Middleware
import { authenticate, authenticateApiKey, authenticateUser } from './middleware/auth.middleware';

// User routes
import userRoutes from './routes/user.routes';

const app = express();

// ===== GLOBAL MIDDLEWARE =====
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// ===== RATE LIMITING =====
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
  },
});

// ===== INITIALIZE CONTROLLERS =====
let multiTenantNFTController: MultiTenantNFTController;
let legacyNFTController: NFTClaimController;
let analyticsController: AnalyticsController;

try {
  multiTenantNFTController = new MultiTenantNFTController();
  legacyNFTController = new NFTClaimController();
  analyticsController = new AnalyticsController();
  console.log('✅ Controllers initialized');
} catch (error) {
  console.error('❌ Error initializing controllers:', error);
  process.exit(1);
}

// ===== SYSTEM MONITORING ROUTES =====
app.get('/health', SystemController.healthCheck);
app.get('/api/system/stats', SystemController.getSystemStats);
app.get('/api/system/migration-status', SystemController.getMigrationStatus);
app.get('/api/system/test-db', SystemController.testDatabaseOperations);

// ===== AUTH ROUTES (Organizers) =====
app.post('/api/auth/register', authLimiter, AuthController.register);
app.post('/api/auth/login', authLimiter, AuthController.login);
app.get('/api/auth/profile', authenticate, AuthController.getProfile);
app.post('/api/auth/api-keys', authenticate, AuthController.createApiKey);
app.get('/api/auth/api-keys', authenticate, AuthController.listApiKeys);
app.delete('/api/auth/api-keys/:keyId', authenticate, AuthController.deactivateApiKey);

// ===== USER ROUTES (NORMAL USERS) =====
app.use('/api/user', userRoutes); // 👈 /api/user/profile

// ===== CAMPAIGN MANAGEMENT ROUTES (JWT Auth) =====
app.post('/api/campaigns', authenticate, CampaignController.createCampaign);
app.get('/api/campaigns', authenticate, CampaignController.listCampaigns);
app.get('/api/campaigns/:campaignId', authenticate, CampaignController.getCampaign);
app.put('/api/campaigns/:campaignId', authenticate, CampaignController.updateCampaign);
app.delete('/api/campaigns/:campaignId', authenticate, CampaignController.deleteCampaign);
app.get('/api/campaigns/:campaignId/analytics', authenticate, CampaignController.getCampaignAnalytics);
app.get('/api/campaigns/:campaignId/claims', authenticate, CampaignController.getCampaignClaims);

// ===== ANALYTICS ROUTES =====
app.get('/api/analytics/dashboard', authenticate, (req, res) =>
  analyticsController.getDashboardStats(req, res)
);
app.get('/api/analytics/claims/daily', authenticate, (req, res) =>
  analyticsController.getDailyClaims(req, res)
);
app.get('/api/analytics/trend/monthly', authenticate, (req, res) =>
  analyticsController.getMonthlyTrend(req, res)
);

// ===== PUBLIC POAP CLAIMING ROUTES =====
app.post('/api/poap/claim', multiTenantNFTController.claimPOAP);
app.get('/api/campaigns/:campaignId/public', multiTenantNFTController.getPublicCampaign);
app.get('/api/poap/user/:userPublicKey', multiTenantNFTController.getUserPOAPs);
app.get('/api/poap/user/:userPublicKey/stats', multiTenantNFTController.getUserClaimStats);

// ===== AUTHENTICATED USER ROUTES =====
app.get('/api/user/claim-stats', authenticateUser, multiTenantNFTController.getUserClaimStatsAuth);

// ===== RELAYER AND SYSTEM ROUTES =====
app.get('/api/relayer/stats', multiTenantNFTController.getRelayerStats);

// ===== LEGACY COMPATIBILITY ROUTES =====
app.post('/api/nft/claim-magical', legacyNFTController.claimNFTMagical);
app.post('/api/nft/claim-with-signature', legacyNFTController.claimNFTWithSignature);
app.get('/api/nft/user/:userPublicKey', legacyNFTController.getUserNFTs);

// ===== PERMITS (Legacy Info) =====
app.get('/api/permits', (req, res) => {
  res.json({
    ok: true,
    message: 'Multi-Tenant Gasless infrastructure API v2.0',
    network: 'devnet',
    migration: {
      notice: 'This API has been upgraded to a multi-tenant SaaS platform',
      newEndpoints: [
        'POST /api/auth/register - Register as organizer',
        'POST /api/auth/login - Login organizer',
        'POST /api/campaigns - Create POAP campaign',
        'POST /api/poap/claim - Claim POAP with secret code validation',
      ],
      legacySupport: ['POST /api/nft/claim-magical - Legacy demo endpoint'],
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
    title: 'Multi-Tenant Gasless infrastructure API',
    version: '2.1.0',
    description: 'SaaS platform for gasless POAP minting on Solana with secret code validation',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    authentication: {
      jwt: {
        description: 'For organizer and user dashboard operations',
        header: 'Authorization: Bearer <token>',
        endpoints: ['/auth/*', '/user/*', '/campaigns/*'],
      },
      apiKey: {
        description: 'For POAP claiming operations (optional)',
        header: 'Authorization: ApiKey <key>',
        endpoints: ['/poap/claim'],
      },
    },
    features: {
      secretCodeValidation: {
        description: 'Campaigns can require secret codes for claiming',
        implementation: 'Set secretCode field when creating campaigns',
      },
      gaslessMinting: {
        description: 'Users pay no gas fees for POAP minting',
        implementation: 'Relayer pays transaction costs',
        network: 'Solana Devnet',
      },
      multiTenant: {
        description: 'Multiple organizers can create independent campaigns',
        isolation: 'JWT-based data isolation between organizers',
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

// ===== 404 HANDLER =====
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health - System health check',
      'GET /api/docs - API documentation',
      'POST /api/nft/claim-magical - Legacy NFT minting',
      'POST /api/poap/claim - POAP claiming with secret codes',
      'GET /api/relayer/stats - Relayer statistics',
      'GET /api/system/stats - System statistics',
      'GET /api/user/profile - Authenticated user profile',
    ],
  });
});

// ===== START SERVER =====
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log('🚀 MULTI-TENANT Gasless infrastructure STARTED');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`📊 System Stats: http://localhost:${PORT}/api/system/stats`);
  console.log('');
  console.log('🎯 KEY FEATURES:');
  console.log('   🔐 JWT Auth - Organizer and User roles supported');
  console.log('   🔑 API Keys - Campaign-based authentication');
  console.log('   🎨 Gasless NFT Minting - Users pay no fees');
  console.log('   🏢 Multi-Tenant SaaS - Multiple organizers supported');
  console.log('   📊 Real-time Analytics - Campaign performance tracking');
  console.log('   🛡️ Comprehensive Security - Helmet, Rate Limit, JWT verification');
  console.log('');
  console.log('🌐 Network: Solana Devnet');
  console.log('💾 Database: PostgreSQL with Prisma ORM');
  console.log('🎨 Ready for production POAP & user dashboards!');
});
