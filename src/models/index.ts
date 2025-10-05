// backend/src/models/organizer.model.ts
export interface Organizer {
  id: string;
  email: string;
  name: string;
  company?: string;
  walletAddress: string;
  apiKey: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  subscriptionStatus: 'active' | 'cancelled' | 'past_due';
  monthlyPOAPLimit: number;
  usedPOAPsThisMonth: number;
  customBranding?: {
    logo: string;
    primaryColor: string;
    secondaryColor: string;
    customDomain?: string;
  };
  billingInfo?: {
    stripeCustomerId: string;
    subscriptionId: string;
    nextBillingDate: Date;
  };
  createdAt: Date;
  lastLoginAt: Date;
  isActive: boolean;
}

export interface Campaign {
  id: string;
  organizerId: string;
  name: string;
  description: string;
  eventDate: Date;
  location?: string;
  timezone: string;
  image: string;
  maxSupply?: number;
  claimStartDate: Date;
  claimEndDate: Date;
  claimMethod: 'open' | 'code' | 'whitelist' | 'qr' | 'email';
  secretCode?: string;
  whitelistedWallets?: string[];
  whitelistedEmails?: string[];
  qrCodeData?: string;
  customMetadata?: Record<string, any>;
  totalClaimed: number;
  totalAttempts: number;
  isActive: boolean;
  tags: string[];
  category: 'conference' | 'workshop' | 'meetup' | 'gaming' | 'art' | 'other';
  createdAt: Date;
  updatedAt: Date;
}

export interface POAPClaim {
  id: string;
  campaignId: string;
  userWallet: string;
  userEmail?: string;
  nftMint: string;
  transactionSignature: string;
  claimedAt: Date;
  claimMethod: string;
  ipAddress?: string;
  userAgent?: string;
  location?: {
    country: string;
    city: string;
    coordinates?: [number, number];
  };
  metadata?: Record<string, any>;
}

export interface Subscription {
  id: string;
  organizerId: string;
  tier: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'cancelled' | 'past_due';
  monthlyLimit: number;
  pricePerMonth: number;
  features: string[];
  stripeSubscriptionId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}