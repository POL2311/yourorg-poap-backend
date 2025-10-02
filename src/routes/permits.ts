// src/routes/permits.ts - RUTAS SIMPLIFICADAS PARA COMPATIBILIDAD
import { Router } from 'express';
const router = Router();

// Ruta básica para compatibilidad
router.get('/', (_req, res) => {
  res.json({ 
    ok: true, 
    permits: [],
    message: 'Gasless Infrastructure Permits API',
    endpoints: [
      'POST /create - Create permit',
      'GET /:permitId/status - Get permit status',
      'POST /claim-nft-simple - Magical NFT claim (no signatures required)'
    ]
  });
});

// Ruta de health check específica
router.get('/health', (req, res) => {
  res.json({ 
    ok: true, 
    service: 'permits',
    timestamp: new Date().toISOString(),
    message: 'Permits service is running'
  });
});

export default router;