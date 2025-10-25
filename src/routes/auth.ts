// src/routes/auth.ts
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/me', authenticate, AuthController.me);

router.post('/api-keys', authenticate, AuthController.createApiKey);
router.get('/api-keys', authenticate, AuthController.listApiKeys);
router.delete('/api-keys/:keyId', authenticate, AuthController.deactivateApiKey);

export default router;
