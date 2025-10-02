// src/index.ts - BACKEND ACTUALIZADO CON MINTEO REAL
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { NFTClaimController } from './controllers/nft-claim.controller';

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

// Inicializar controller
let nftClaimController: NFTClaimController;

try {
  nftClaimController = new NFTClaimController();
  console.log('✅ NFT Claim Controller initialized');
} catch (error) {
  console.error('❌ Error initializing NFT Claim Controller:', error);
  process.exit(1);
}

// ===== RUTAS PRINCIPALES =====

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    service: 'Gasless Infrastructure Backend',
    timestamp: new Date().toISOString(),
    relayerConfigured: !!process.env.RELAYER_PRIVATE_KEY,
    rpcUrl: process.env.SOLANA_RPC_URL
  });
});

// ===== RUTAS DE NFT CLAIM =====

// 🎯 ENDPOINT MÁGICO: Claim NFT sin firmas (experiencia mágica)
app.post('/api/nft/claim-magical', nftClaimController.claimNFTMagical);

// 🔐 ENDPOINT CON FIRMA: Claim NFT con validación de firma off-chain
app.post('/api/nft/claim-with-signature', nftClaimController.claimNFTWithSignature);

// 📊 Obtener NFTs del usuario
app.get('/api/nft/user/:userPublicKey', nftClaimController.getUserNFTs);

// 💰 Estadísticas del relayer
app.get('/api/relayer/stats', nftClaimController.getRelayerStats);

// ===== RUTAS DE COMPATIBILIDAD (para el SDK existente) =====

// Ruta de permits básica para compatibilidad
app.get('/api/permits', (req, res) => {
  res.json({
    ok: true,
    message: 'Gasless Infrastructure Permits API',
    endpoints: [
      'POST /api/nft/claim-magical - Magical NFT claim (no signatures)',
      'POST /api/nft/claim-with-signature - NFT claim with signature validation',
      'GET /api/nft/user/:userPublicKey - Get user NFTs',
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
  console.log('🚀 GASLESS INFRASTRUCTURE BACKEND STARTED');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🎯 Magical endpoint: POST /api/nft/claim-magical`);
  console.log(`🔐 Signature endpoint: POST /api/nft/claim-with-signature`);
  console.log(`📊 Health check: GET /health`);
  console.log(`💰 Relayer stats: GET /api/relayer/stats`);
  console.log('🎨 Ready to mint real NFTs gaslessly!');
});