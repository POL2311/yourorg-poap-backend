// src/index-multitenant.ts - FIXED VERSION
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

// ===== HEALTH CHECK =====

app.get('/health', async (req, res) => {
  try {
    res.json({
      ok: true,
      uptime: process.uptime(),
      service: 'Multi-Tenant POAP Infrastructure - SaaS Backend',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      database: 'not connected (demo mode)',
      relayerConfigured: !!process.env.RELAYER_PRIVATE_KEY,
      rpcUrl: process.env.SOLANA_RPC_URL,
      network: 'devnet',
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Health check failed',
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

// ===== PUBLIC POAP CLAIMING ROUTES =====

// Main POAP claiming endpoint (simplified - no API key required for demo)
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
    message: 'Multi-Tenant POAP Infrastructure API v2.0 (Demo Mode)',
    network: 'devnet',
    migration: {
      notice: 'This API has been upgraded to multi-tenant SaaS platform',
      newEndpoints: [
        'POST /api/auth/register - Register as organizer (demo)',
        'POST /api/auth/login - Login organizer (demo)',
        'POST /api/campaigns - Create POAP campaign (demo)',
        'POST /api/poap/claim - Claim POAP (demo)',
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
    description: 'SaaS platform for gasless POAP minting on Solana (Demo Mode)',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    note: 'Currently running in demo mode - database integration needed for full functionality',
    authentication: {
      jwt: {
        description: 'For organizer dashboard operations (demo)',
        header: 'Authorization: Bearer <token>',
        endpoints: ['/auth/*', '/campaigns/*'],
      },
      apiKey: {
        description: 'For POAP claiming operations (not required in demo)',
        header: 'Authorization: ApiKey <key>',
        endpoints: ['/poap/claim'],
      },
    },
    endpoints: {
      auth: {
        'POST /auth/register': 'Register new organizer (demo)',
        'POST /auth/login': 'Login organizer (demo)',
        'GET /auth/profile': 'Get organizer profile (demo)',
        'POST /auth/api-keys': 'Create API key (demo)',
        'GET /auth/api-keys': 'List API keys (demo)',
        'DELETE /auth/api-keys/:keyId': 'Deactivate API key (demo)',
      },
      campaigns: {
        'POST /campaigns': 'Create campaign (demo)',
        'GET /campaigns': 'List campaigns (demo)',
        'GET /campaigns/:id': 'Get campaign (demo)',
        'PUT /campaigns/:id': 'Update campaign (demo)',
        'DELETE /campaigns/:id': 'Delete campaign (demo)',
        'GET /campaigns/:id/analytics': 'Campaign analytics (demo)',
        'GET /campaigns/:id/claims': 'Campaign claims (demo)',
      },
      poap: {
        'POST /poap/claim': 'Claim POAP (working with real NFT minting)',
        'GET /campaigns/:id/public': 'Public campaign info (demo)',
        'GET /poap/user/:userPublicKey': 'User POAPs (demo)',
      },
      system: {
        'GET /health': 'Health check',
        'GET /relayer/stats': 'Relayer statistics',
      },
    },
    examples: {
      claimPOAP: {
        url: 'POST /api/poap/claim',
        body: {
          userPublicKey: 'user_solana_public_key',
          campaignId: 'demo_campaign',
          secretCode: 'optional_secret_code',
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
      'GET /health',
      'GET /api/docs',
      'POST /api/nft/claim-magical (working)',
      'POST /api/poap/claim (working)',
      'GET /api/relayer/stats (working)',
    ],
  });
});

// ===== START SERVER =====

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log('🚀 MULTI-TENANT POAP INFRASTRUCTURE STARTED (DEMO MODE)');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('🎯 WORKING ENDPOINTS:');
  console.log(`   🎨 Legacy NFT: POST /api/nft/claim-magical`);
  console.log(`   🏅 POAP Claim: POST /api/poap/claim`);
  console.log(`   💰 Relayer Stats: GET /api/relayer/stats`);
  console.log('');
  console.log('⚠️  DEMO MODE: Database integration needed for full functionality');
  console.log('🌐 Network: Solana Devnet');
  console.log('🎨 Ready for gasless NFT/POAP minting!');
});