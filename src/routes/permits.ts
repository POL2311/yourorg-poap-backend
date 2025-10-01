// program/backend/src/routes/permits.ts
import { Router } from 'express';

const router = Router();

router.post('/create', async (req, res) => {
  try {
    console.log('[permits/create] body:', req.body);

    const {
      userPublicKey,
      serviceId,
      instructionData,
      targetProgram,
      expiry,
      maxFee,
      signature,
    } = req.body || {};

    if (
      !userPublicKey ||
      !serviceId ||
      typeof instructionData === 'undefined' ||
      !targetProgram ||
      typeof expiry !== 'number' ||
      typeof maxFee !== 'number' ||
      typeof signature !== 'string' ||
      signature.length === 0
    ) {
      return res.status(400).json({ success: false, error: 'Payload inválido' });
    }

    if (instructionData !== '') {
      try {
        Buffer.from(instructionData, 'base64');
      } catch {
        return res
          .status(400)
          .json({ success: false, error: 'instructionData no es base64' });
      }
    }

    const mock = {
      permitId: 'demo-' + Math.random().toString(36).slice(2),
      nonce: Math.floor(Math.random() * 1_000_000),
      transactionSignature: '',
      status: 'pending' as const,
    };

    return res.json({ success: true, data: mock });
  } catch (e: any) {
    console.error('create permit error', e);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

export default router;
