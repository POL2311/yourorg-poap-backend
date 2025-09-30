// src/routes/permits.ts
import { Router } from 'express';
const router = Router();

router.get('/', (_req, res) => {
  res.json({ ok: true, permits: [] });
});

export default router;
