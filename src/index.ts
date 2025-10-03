// src/index.ts - BACKEND ACTUALIZADO CON ENDPOINTS DE PERMITS
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

// ===== RUTAS DE PERMITS (para compatibilidad con SDK) =====

// Ruta de permits básica para compatibilidad
app.get('/api/permits', (req, res) => {
  res.json({
    ok: true,
    message: 'Gasless Infrastructure Permits API',
    endpoints: [
      'POST /api/permits/create - Create gasless permit (redirects to NFT claim)',
      'POST /api/nft/claim-magical - Magical NFT claim (no signatures)',
      'POST /api/nft/claim-with-signature - NFT claim with signature validation',
      'GET /api/nft/user/:userPublicKey - Get user NFTs',
      'GET /api/relayer/stats - Relayer statistics'
    ]
  });
});

// 🎯 ENDPOINT DE PERMITS: Crear permit (redirige a NFT mágico)
app.post('/api/permits/create', async (req, res) => {
  try {
    console.log('🎯 PERMIT CREATE REQUEST - Redirecting to magical NFT claim');
    console.log('📦 Request body:', req.body);

    const { userPublicKey, serviceId, instructionData, targetProgram, expiry, maxFee, signature } = req.body;

    if (!userPublicKey) {
      return res.status(400).json({
        success: false,
        error: 'userPublicKey is required'
      });
    }

    // Validar que es una solicitud de NFT
    if (serviceId && serviceId.includes('nft')) {
      console.log('🎨 NFT permit detected, processing as magical NFT claim...');
      
      // Redirigir internamente al endpoint mágico
      req.body = { userPublicKey };
      return nftClaimController.claimNFTMagical(req, res);
    }

    // Para otros tipos de permits, crear un permit básico
    const permitId = `permit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nonce = Math.floor(Math.random() * 1000000);

    console.log(`📝 Creating permit: ${permitId}`);

    // Simular procesamiento del permit
    setTimeout(async () => {
      console.log(`⚡ Processing permit: ${permitId}`);
      // Aquí podrías implementar la lógica real de procesamiento
    }, 1000);

    res.status(201).json({
      success: true,
      data: {
        permitId,
        nonce,
        transactionSignature: '', // Se llenará cuando se procese
        status: 'pending',
        userPublicKey,
        serviceId: serviceId || 'default',
        expiry: expiry || Math.floor(Date.now() / 1000) + 3600,
        maxFee: maxFee || 10_000_000,
        createdAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error creating permit:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// 📊 Obtener estado de permit
app.get('/api/permits/:permitId/status', (req, res) => {
  const { permitId } = req.params;
  
  // Simular estado del permit
  res.json({
    success: true,
    data: {
      permitId,
      status: 'executed', // pending, executed, expired
      userPublicKey: '11111111111111111111111111111111',
      serviceId: 'nft-claim',
      nonce: 123456,
      expiry: Math.floor(Date.now() / 1000) + 3600,
      maxFee: 10_000_000,
      transactionSignature: 'simulated_tx_signature',
      executedAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 60000).toISOString()
    }
  });
});

// 📊 Obtener permits del usuario
app.get('/api/permits/user/:userPublicKey', (req, res) => {
  const { userPublicKey } = req.params;
  const { status, page = 1, limit = 10 } = req.query;

  // Simular lista de permits
  res.json({
    success: true,
    data: [
      {
        permitId: `permit_${Date.now()}`,
        status: status || 'executed',
        userPublicKey,
        serviceId: 'nft-claim',
        nonce: 123456,
        expiry: Math.floor(Date.now() / 1000) + 3600,
        maxFee: 10_000_000,
        transactionSignature: 'simulated_tx_signature',
        executedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 60000).toISOString()
      }
    ],
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: 1
    }
  });
});

// 🔐 Validar firma de permit
app.post('/api/permits/validate-signature', (req, res) => {
  const { userPublicKey, signature, ...permitData } = req.body;

  // Simular validación de firma
  const isValid = signature && signature.length > 50; // Validación básica

  res.json({
    success: true,
    data: {
      isValid,
      userPublicKey,
      timestamp: new Date().toISOString()
    }
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
  console.log(`📝 Permits endpoint: POST /api/permits/create`);
  console.log(`📊 Health check: GET /health`);
  console.log(`💰 Relayer stats: GET /api/relayer/stats`);
  console.log('🎨 Ready to mint real NFTs gaslessly!');
});