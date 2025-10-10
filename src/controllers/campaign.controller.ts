const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  eventDate: z.string().datetime(),
  location: z.string().max(100).optional(),
  imageUrl: z.string().url().optional(),
  externalUrl: z.string().url().optional(),
  maxClaims: z.number().int().positive().optional(),
  secretCode: z.string().min(4).max(50).optional(),
  metadata: z.object({
    attributes: z.array(z.object({
      trait_type: z.string(),
      value: z.string()
    })).optional()
  }).optional()
});