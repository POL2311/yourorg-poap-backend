// backend/src/routes/permits.ts
import { Router } from 'express';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import dotenv from 'dotenv';

dotenv.config();
const router = Router();

// === Config relayer & RPC ===
const RPC_URL = process.env.RPC_URL || 'http://localhost:8899';
const RELAYER_SECRET_B58 = process.env.RELAYER_SECRET_B58 || '';

if (!RELAYER_SECRET_B58) {
  throw new Error('Falta RELAYER_SECRET_B58 en .env');
}

const RELAYER_KEYPAIR = Keypair.fromSecretKey(bs58.decode(RELAYER_SECRET_B58));
const connection = new Connection(RPC_URL, 'confirmed');

// ===== helpers (deben matchear EXACTO lo que hace el SDK) =====
function createPermitMessage(payload: any): Uint8Array {
  const humanReadable = [
    'Gasless Permit',
    '--------------------------------',
    JSON.stringify(payload),
  ].join('\n');
  return new TextEncoder().encode(humanReadable);
}

/**
 * POST /api/permits/create
 * Body (desde el SDK):
 * {
 *  userPublicKey: string,
 *  serviceId: string,
 *  instructionData: string (base64, puede ser "" para vacío),
 *  targetProgram: string,
 *  expiry: number,
 *  maxFee: number,
 *  signature: string (bs58)
 * }
 */
router.post('/create', async (req, res) => {
  try {
    const {
      userPublicKey,
      serviceId,
      instructionData,
      targetProgram,
      expiry,
      maxFee,
      signature,
    } = req.body || {};

    console.log('[API] POST /api/permits/create');
    console.log('[API] body:', req.body);
    console.log('[API] relayer pubkey:', RELAYER_KEYPAIR.publicKey.toBase58());
    console.log('[API] RPC_URL:', RPC_URL);

    // ——— Validación básica ———
    if (
      !userPublicKey ||
      !serviceId ||
      typeof instructionData === 'undefined' || // permite "" como válido
      !targetProgram ||
      typeof expiry !== 'number' ||
      typeof maxFee !== 'number' ||
      typeof signature !== 'string' ||
      signature.length === 0
    ) {
      return res.status(400).json({ success: false, error: 'Payload inválido' });
    }

    // (opcional) si viene no vacío, valida que sea base64
    if (instructionData !== '') {
      try {
        Buffer.from(instructionData, 'base64');
      } catch {
        return res.status(400).json({ success: false, error: 'instructionData no es base64' });
      }
    }

    // ——— Expiración ———
    const now = Math.floor(Date.now() / 1000);
    if (now > expiry) {
      return res.status(400).json({ success: false, error: 'Permit expirado' });
    }

    // ——— Reconstruir payload EXACTO del SDK y verificar firma ed25519 ———
    const permitPayload = {
      domain: 'gasless-infra',
      type: 'permit',
      version: 1,
      user: userPublicKey,
      serviceId,
      targetProgram,
      expiry,
      maxFee,
      instructionDataBase64: instructionData, // puede ser ""
      nonce: 0, // documentado en el SDK
    };
    const message = createPermitMessage(permitPayload);

    const signatureOk = nacl.sign.detached.verify(
      message,
      bs58.decode(signature),
      new PublicKey(userPublicKey).toBytes(),
    );
    if (!signatureOk) {
      return res.status(400).json({ success: false, error: 'Firma inválida' });
    }

    // ——— DEMO: transacción mínima pagada por el RELAYER ———
    // Opción A: transfer de 0 lamports (consume fee)
    const demoIx = SystemProgram.transfer({
      fromPubkey: RELAYER_KEYPAIR.publicKey,
      toPubkey: new PublicKey(userPublicKey),
      lamports: 0,
    });

    // (Si prefieres un Memo para “marcar” el permit, descomenta esto y comenta el transfer de arriba)
    // const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    // const demoIx = new TransactionInstruction({
    //   programId: MEMO_PROGRAM_ID,
    //   keys: [],
    //   data: Buffer.from(`permit:${serviceId}:${userPublicKey}`, 'utf8'),
    // });

    const MAX_RETRIES = 5;
    let lastSig: string | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[API] attempt ${attempt}: preparing tx…`);

        // Blockhash FRESCO (processed -> más reciente que finalized)
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');

        const tx = new Transaction({
          feePayer: RELAYER_KEYPAIR.publicKey,
          recentBlockhash: blockhash,
        }).add(demoIx);

        tx.sign(RELAYER_KEYPAIR);

        console.log(`[API] attempt ${attempt}: sending as relayer…`);
        const raw = tx.serialize();
        const sig = await connection.sendRawTransaction(raw, {
          skipPreflight: true,
          maxRetries: 5,
        });
        lastSig = sig;
        console.log(`[API] attempt ${attempt}: signature = ${sig}`);

        // Confirmar con el MISMO par (blockhash, lastValidBlockHeight)
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          'processed',
        );
        console.log('[API] confirmed ✅');

        // Respuesta estilo permit
        return res.json({
          success: true,
          data: {
            permitId: 'demo-' + Math.random().toString(36).slice(2),
            nonce: Math.floor(Math.random() * 1_000_000),
            transactionSignature: sig,
            status: 'pending' as const,
          },
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        console.warn(`[API] attempt ${attempt} failed:`, msg);

        // Reintenta si expiró el blockhash
        if (msg.includes('block height exceeded') || msg.includes('TransactionExpired')) {
          if (attempt < MAX_RETRIES) {
            console.log('[API] blockhash expired, retrying with a fresh one…');
            continue;
          }
        }
        // Otros errores: corta al final del loop
        if (attempt === MAX_RETRIES) {
          return res.status(500).json({
            success: false,
            error: 'Failed to send/confirm after retries',
            details: msg,
            signature: lastSig,
          });
        }
      }
    }

    // Si por algún motivo no retornó antes:
    return res.status(500).json({
      success: false,
      error: 'Unexpected error',
      signature: lastSig,
    });
  } catch (e: any) {
    console.error('create permit error', e);
    return res.status(500).json({ success: false, error: e?.message ?? 'Internal error' });
  }
});

export default router;
