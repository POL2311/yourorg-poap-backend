// src/index.ts - CLEAN BACKEND FOR DIRECT NFT MINTING
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { NFTClaimController } from './controllers/nft-claim.controller';
import { AnalyticsController } from './controllers/analytics.controller';
import { AuthController } from './controllers/auth.controller';
import { authenticate, AuthenticatedRequest } from './middleware/auth.middleware';

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

// Initialize controllers
let nftClaimController: NFTClaimController;
let analyticsController: AnalyticsController;

try {
  nftClaimController = new NFTClaimController();
  analyticsController = new AnalyticsController();
  console.log('✅ Controllers initialized');
} catch (error) {
  console.error('❌ Error initializing controllers:', error);
  process.exit(1);
}

// ===== MAIN ROUTES =====

// ===== AUTH ROUTES =====

// 🔐 Register new organizer
app.post('/api/auth/register', AuthController.register);

// 🔑 Login organizer
app.post('/api/auth/login', AuthController.login);

// 👤 Get organizer profile
app.get('/api/auth/profile', authenticate, AuthController.getProfile);

// 🔑 API Key management
app.post('/api/auth/api-keys', authenticate, AuthController.createApiKey);
app.get('/api/auth/api-keys', authenticate, AuthController.listApiKeys);
app.delete('/api/auth/api-keys/:keyId', authenticate, AuthController.deactivateApiKey);

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    service: 'Gasless Infrastructure Backend - Devnet',
    timestamp: new Date().toISOString(),
    relayerConfigured: !!process.env.RELAYER_PRIVATE_KEY,
    rpcUrl: process.env.SOLANA_RPC_URL,
    network: 'devnet'
  });
});

// ===== NFT ROUTES (DIRECT MINTING) =====

// 🎯 MAIN ENDPOINT: Direct NFT minting (no permits, immediate execution)
app.post('/api/nft/claim-magical', (req, res) => {
  console.log('🎯 DIRECT NFT MINTING ENDPOINT HIT');
  console.log('📦 Request body:', req.body);
  console.log('🔗 Request URL:', req.url);
  nftClaimController.claimNFTMagical(req, res);
});

// 🔐 NFT with signature validation
app.post('/api/nft/claim-with-signature', nftClaimController.claimNFTWithSignature);

// 📊 Get user NFTs
app.get('/api/nft/user/:userPublicKey', nftClaimController.getUserNFTs);

// 💰 Relayer statistics
app.get('/api/relayer/stats', nftClaimController.getRelayerStats);

// ===== ANALYTICS ROUTES =====

// 📊 Dashboard analytics overview
app.get('/api/analytics/dashboard', authenticate, (req: AuthenticatedRequest, res) =>
  analyticsController.getDashboardStats(req, res)
);

// 📈 Daily claims data for charts
app.get('/api/analytics/claims/daily', authenticate, (req: AuthenticatedRequest, res) =>
  analyticsController.getDailyClaims(req, res)
);

// 📊 Monthly campaigns and claims trend
app.get('/api/analytics/trend/monthly', authenticate, (req: AuthenticatedRequest, res) =>
  analyticsController.getMonthlyTrend(req, res)
);

// 🔄 Recent activity for dashboard
app.get('/api/analytics/recent-activity', authenticate, (req: AuthenticatedRequest, res) =>
  analyticsController.getRecentActivity(req, res)
);

// 🔧 Test analytics endpoint (for debugging)
app.get('/api/analytics/test', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    message: 'Analytics authentication working!',
    user: req.user,
    organizer: req.organizer,
    timestamp: new Date().toISOString()
  });
});

// ===== COMPATIBILITY ROUTES =====

// Basic permits info (for compatibility)
app.get('/api/permits', (req, res) => {
  res.json({
    ok: true,
    message: 'Gasless Infrastructure API - Direct NFT Minting',
    network: 'devnet',
    endpoints: [
      'POST /api/nft/claim-magical - Direct NFT minting (recommended)',
      'POST /api/nft/claim-with-signature - NFT with signature validation',
      'GET /api/nft/user/:userPublicKey - Get user NFTs',
      'GET /api/relayer/stats - Relayer statistics',
      'GET /api/analytics/dashboard - Dashboard analytics overview',
      'GET /api/analytics/claims/daily - Daily claims data for charts',
      'GET /api/analytics/trend/monthly - Monthly campaigns and claims trend'
    ]
  });
});

// Legacy permit endpoint (redirects to direct minting)
app.post('/api/permits/create', (req, res) => {
  console.log('🔄 Legacy permit endpoint hit, redirecting to direct NFT minting...');
  console.log('📦 Request body:', req.body);
  
  const { userPublicKey } = req.body;
  
  if (!userPublicKey) {
    return res.status(400).json({
      success: false,
      error: 'userPublicKey is required'
    });
  }
  
  // Redirect to direct NFT minting
  req.body = { userPublicKey, serviceId: 'devnet-demo-service' };
  nftClaimController.claimNFTMagical(req, res);
});

// ===== ERROR HANDLING =====

app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// ===== START SERVER =====

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log('🚀 GASLESS INFRASTRUCTURE BACKEND STARTED - DEVNET');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🎯 Direct NFT endpoint: POST /api/nft/claim-magical`);
  console.log(`📊 Analytics endpoints: GET /api/analytics/*`);
  console.log(`🌐 Network: Solana Devnet`);
  console.log(`📊 Health check: GET /health`);
  console.log(`💰 Relayer stats: GET /api/relayer/stats`);
  console.log('🎨 Ready to mint real NFTs on Devnet instantly!');
});