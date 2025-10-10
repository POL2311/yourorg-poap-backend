import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

// Rate limiting
export const createRateLimit = (windowMs: number, max: number) => 
  rateLimit({
    windowMs,
    max,
    message: { success: false, error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
  });

// NFT minting rate limit: 1 per minute per IP
export const nftMintRateLimit = createRateLimit(60 * 1000, 1);

// API rate limit: 100 requests per 15 minutes
export const apiRateLimit = createRateLimit(15 * 60 * 1000, 100);

// Input validation
export const validatePublicKey = (req: Request, res: Response, next: NextFunction) => {
  const { userPublicKey } = req.body;
  
  if (!userPublicKey) {
    return res.status(400).json({ success: false, error: 'userPublicKey is required' });
  }
  
  try {
    new PublicKey(userPublicKey);
    next();
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid userPublicKey format' });
  }
};

// Signature verification
export const verifySignature = (req: Request, res: Response, next: NextFunction) => {
  const { userPublicKey, signature, message } = req.body;
  
  if (!signature || !message) {
    return res.status(400).json({ 
      success: false, 
      error: 'signature and message are required' 
    });
  }
  
  try {
    const publicKey = new PublicKey(userPublicKey);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
    
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }
    
    next();
  } catch (error) {
    return res.status(400).json({ success: false, error: 'Signature verification failed' });
  }
};

// Duplicate prevention
const recentMints = new Map<string, number>();

export const preventDuplicateMints = (req: Request, res: Response, next: NextFunction) => {
  const { userPublicKey } = req.body;
  const now = Date.now();
  const cooldownPeriod = 60 * 1000; // 1 minute
  
  const lastMint = recentMints.get(userPublicKey);
  if (lastMint && (now - lastMint) < cooldownPeriod) {
    return res.status(429).json({
      success: false,
      error: 'Please wait before minting another NFT',
      retryAfter: Math.ceil((cooldownPeriod - (now - lastMint)) / 1000)
    });
  }
  
  recentMints.set(userPublicKey, now);
  
  // Cleanup old entries
  for (const [key, timestamp] of recentMints.entries()) {
    if (now - timestamp > cooldownPeriod) {
      recentMints.delete(key);
    }
  }
  
  next();
};