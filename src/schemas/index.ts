import { z } from 'zod';

// ===== ORGANIZER SCHEMAS =====

export const RegisterOrganizerSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  company: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const LoginOrganizerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// ===== CAMPAIGN SCHEMAS =====

export const CreateCampaignSchema = z.object({
  name: z.string().min(2, 'Campaign name must be at least 2 characters'),
  description: z.string().optional(),
  eventDate: z.string().datetime('Invalid date format'),
  location: z.string().optional(),
  imageUrl: z.string().url('Invalid image URL').optional(),
  externalUrl: z.string().url('Invalid external URL').optional(),
  secretCode: z.string().optional(),
  maxClaims: z.number().int().positive().optional(),
  metadata: z.record(z.any()).optional(),
});

export const UpdateCampaignSchema = CreateCampaignSchema.partial();

// ===== CLAIM SCHEMAS =====

export const ClaimPOAPSchema = z.object({
  userPublicKey: z.string().min(32, 'Invalid Solana public key'),
  campaignId: z.string().min(1, 'Campaign ID is required'),
  secretCode: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// ===== API KEY SCHEMAS =====

export const CreateApiKeySchema = z.object({
  name: z.string().min(2, 'API key name must be at least 2 characters'),
});

// ===== TYPES =====

export type RegisterOrganizerInput = z.infer<typeof RegisterOrganizerSchema>;
export type LoginOrganizerInput = z.infer<typeof LoginOrganizerSchema>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
export type ClaimPOAPInput = z.infer<typeof ClaimPOAPSchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;