// src/index-multitenant.ts - ENHANCED VERSION WITH SYSTEM MONITORING
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

// Middleware
import { authenticate, authenticateApiKey } from './middleware/auth.middleware';

const app = express();

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

// ===== SYSTEM MONITORING ROUTES =====

// Comprehensive health check
app.get('/health', SystemController.healthCheck);

// System statistics
app.get('/api/system/stats', SystemController.getSystemStats);

// Database migration status
app.get('/api/system/migration-status', SystemController.getMigrationStatus);

// Test database operations
app.get('/api/system/test-db', SystemController.testDatabaseOperations);

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

// ===== PUBLIC POAP CLAIMING ROUTES =====

// Main POAP claiming endpoint with secret code validation
app.post('/api/poap/claim', multiTenantNFTController.claimPOAP);

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
        'POST /api/poap/claim - Claim POAP with secret code validation',
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
    description: 'SaaS platform for gasless POAP minting on Solana with secret code validation',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    authentication: {
      jwt: {
        description: 'For organizer dashboard operations',
        header: 'Authorization: Bearer <token>',
        endpoints: ['/auth/*', '/campaigns/*'],
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
        validation: 'Users must provide correct code to claim POAPs',
      },
      gaslessMinting: {
        description: 'Users pay no gas fees for POAP minting',
        implementation: 'Relayer pays all transaction costs',
        network: 'Solana Devnet',
      },
      multiTenant: {
        description: 'Multiple organizers can create independent campaigns',
        implementation: 'JWT-based authentication and authorization',
        isolation: 'Complete data isolation between organizers',
      },
    },
    endpoints: {
      system: {
        'GET /health': 'Comprehensive system health check',
        'GET /system/stats': 'System statistics and metrics',
        'GET /system/migration-status': 'Database migration status',
        'GET /system/test-db': 'Test database operations',
      },
      auth: {
        'POST /auth/register': 'Register new organizer',
        'POST /auth/login': 'Login organizer',
        'GET /auth/profile': 'Get organizer profile',
        'POST /auth/api-keys': 'Create API key',
        'GET /auth/api-keys': 'List API keys',
        'DELETE /auth/api-keys/:keyId': 'Deactivate API key',
      },
      campaigns: {
        'POST /campaigns': 'Create campaign (with optional secret code)',
        'GET /campaigns': 'List campaigns',
        'GET /campaigns/:id': 'Get campaign',
        'PUT /campaigns/:id': 'Update campaign',
        'DELETE /campaigns/:id': 'Delete campaign',
        'GET /campaigns/:id/analytics': 'Campaign analytics',
        'GET /campaigns/:id/claims': 'Campaign claims',
      },
      poap: {
        'POST /poap/claim': 'Claim POAP (with secret code validation)',
        'GET /campaigns/:id/public': 'Public campaign info',
        'GET /poap/user/:userPublicKey': 'User POAPs',
      },
      relayer: {
        'GET /relayer/stats': 'Relayer statistics',
      },
    },
    examples: {
      createCampaignWithSecretCode: {
        url: 'POST /api/campaigns',
        headers: {
          'Authorization': 'Bearer <jwt_token>',
          'Content-Type': 'application/json',
        },
        body: {
          name: 'Solana Breakpoint 2024',
          description: 'Official POAP for Solana Breakpoint conference',
          eventDate: '2024-09-20T10:00:00Z',
          location: 'Amsterdam, Netherlands',
          secretCode: 'BREAKPOINT2024',
          maxClaims: 1000,
        },
      },
      claimPOAPWithSecretCode: {
        url: 'POST /api/poap/claim',
        body: {
          userPublicKey: 'user_solana_public_key',
          campaignId: 'campaign_id',
          secretCode: 'BREAKPOINT2024',
        },
      },
      legacyNFT: {
        url: 'POST /api/nft/claim-magical',
        body: {
          userPublicKey: 'user_solana_public_key',
          serviceId: 'devnet-demo-service',
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
      'GET /health - Comprehensive health check',
      'GET /api/docs - API documentation',
      'POST /api/nft/claim-magical - Legacy NFT minting',
      'POST /api/poap/claim - POAP claiming with secret codes',
      'GET /api/relayer/stats - Relayer statistics',
      'GET /api/system/stats - System statistics',
    ],
  });
});

// ===== START SERVER =====

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log('🚀 MULTI-TENANT POAP INFRASTRUCTURE STARTED');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`📊 System Stats: http://localhost:${PORT}/api/system/stats`);
  console.log('');
  console.log('🎯 KEY FEATURES:');
  console.log('   🔐 Secret Code Validation - Campaigns can require access codes');
  console.log('   🎨 Gasless NFT Minting - Users pay no fees');
  console.log('   🏢 Multi-Tenant SaaS - Multiple organizers supported');
  console.log('   📊 Real-time Analytics - Campaign performance tracking');
  console.log('   🛡️ Comprehensive Security - JWT auth + input validation');
  console.log('');
  console.log('🌐 Network: Solana Devnet');
  console.log('💾 Database: PostgreSQL with Prisma ORM');
  console.log('🎨 Ready for production POAP campaigns!');
});