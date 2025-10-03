// backend/src/index-simple.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { NFTClaimSimpleController } from './controllers/nft-claim-simple.controller';

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

// Inicializar controller
let nftClaimController: NFTClaimSimpleController;

try {
  nftClaimController = new NFTClaimSimpleController();
  console.log('✅ Simple NFT Claim Controller initialized');
} catch (error) {
  console.error('❌ Error initializing Simple NFT Claim Controller:', error);
  process.exit(1);
}

// ===== RUTAS PRINCIPALES =====

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    service: 'Gasless Infrastructure Backend (Simple)',
    timestamp: new Date().toISOString(),
    relayerConfigured: !!process.env.RELAYER_PRIVATE_KEY,
    rpcUrl: process.env.SOLANA_RPC_URL
  });
});

// ===== RUTAS DE NFT CLAIM =====

// 🎯 ENDPOINT MÁGICO: Claim NFT simple sin firmas
app.post('/api/nft/claim-magical', nftClaimController.claimNFTMagical);

// 💰 Estadísticas del relayer
app.get('/api/relayer/stats', nftClaimController.getRelayerStats);

// ===== RUTAS DE COMPATIBILIDAD =====

// Ruta de permits básica para compatibilidad
app.get('/api/permits', (req, res) => {
  res.json({
    ok: true,
    message: 'Gasless Infrastructure Permits API (Simple)',
    endpoints: [
      'POST /api/nft/claim-magical - Magical simple NFT claim',
      'GET /api/relayer/stats - Relayer statistics'
    ]
  });
});

// Endpoint mágico con ruta de compatibilidad
app.post('/api/permits/claim-nft-simple', nftClaimController.claimNFTMagical);

// ===== MANEJO DE ERRORES =====

app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// ===== INICIAR SERVIDOR =====

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log('🚀 GASLESS INFRASTRUCTURE BACKEND STARTED (SIMPLE)');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🎯 Magical endpoint: POST /api/nft/claim-magical`);
  console.log(`📊 Health check: GET /health`);
  console.log(`💰 Relayer stats: GET /api/relayer/stats`);
  console.log('🎨 Ready to mint simple NFTs gaslessly!');
});