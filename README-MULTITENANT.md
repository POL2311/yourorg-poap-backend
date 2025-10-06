# 🏅 Multi-Tenant POAP Infrastructure - SaaS Backend

Transform your single POAP demo into a scalable **Software-as-a-Service platform** where multiple event organizers can create and manage their own gasless POAP campaigns on Solana.

## 🎯 What's New in v2.0

### ✅ Multi-Tenant Architecture
- **Organizer Accounts**: Event organizers can register and manage their own campaigns
- **API Key Authentication**: Secure access for POAP claiming operations
- **Campaign Management**: Full CRUD operations for POAP campaigns
- **Usage Analytics**: Track claims, gas costs, and performance metrics

### ✅ SaaS Features
- **Tier-based Limits**: Free, Pro, and Enterprise tiers with different limits
- **Rate Limiting**: Protect against abuse and ensure fair usage
- **Database Persistence**: PostgreSQL with Prisma ORM for scalability
- **RESTful API**: Clean, documented API for all operations

### ✅ Backward Compatibility
- **Legacy Support**: Existing demo endpoints still work
- **Gradual Migration**: Upgrade at your own pace
- **Same NFT Minting**: Uses the same proven gasless minting system

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Organizers    │    │   Campaigns     │    │     Claims      │
│                 │    │                 │    │                 │
│ • Registration  │───▶│ • POAP Events   │───▶│ • User Claims   │
│ • Authentication│    │ • Secret Codes  │    │ • NFT Minting   │
│ • API Keys      │    │ • Limits        │    │ • Analytics     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Solana NFTs   │
                    │                 │
                    │ • Gasless Mint  │
                    │ • POAP Metadata │
                    │ • Devnet Ready  │
                    └─────────────────┘
```

## 🚀 Quick Start

### 1. Setup Database and Dependencies

```bash
cd backend
chmod +x setup-multitenant.sh
./setup-multitenant.sh
```

### 2. Configure Environment

Edit `.env` file with your settings:

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/poap_infrastructure"

# Solana
SOLANA_RPC_URL="https://api.devnet.solana.com"
RELAYER_PRIVATE_KEY="[your_relayer_private_key_array]"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
```

### 3. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000/api/docs` for full API documentation.

## 📚 API Usage Examples

### 1. Register as Organizer

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "organizer@example.com",
    "name": "Event Organizer",
    "company": "My Company",
    "password": "securepassword"
  }'
```

### 2. Create POAP Campaign

```bash
curl -X POST http://localhost:3000/api/campaigns \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Web3 Conference 2024",
    "description": "Annual blockchain conference",
    "eventDate": "2024-12-31T23:59:59Z",
    "location": "San Francisco",
    "secretCode": "WEB3CONF2024",
    "maxClaims": 500
  }'
```

### 3. Generate API Key

```bash
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key"
  }'
```

### 4. Claim POAP (End User)

```bash
curl -X POST http://localhost:3000/api/poap/claim \
  -H "Authorization: ApiKey YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userPublicKey": "USER_SOLANA_PUBLIC_KEY",
    "campaignId": "CAMPAIGN_ID",
    "secretCode": "WEB3CONF2024"
  }'
```

## 🎛️ Tier Limits

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Campaigns | 3 | 50 | 500 |
| Monthly Claims | 100 | 5,000 | 50,000 |
| API Keys | 2 | 10 | 50 |
| Analytics | Basic | Advanced | Full |

## 🔐 Authentication

### JWT Tokens (Organizer Dashboard)
- **Purpose**: Organizer account management, campaign CRUD
- **Header**: `Authorization: Bearer <token>`
- **Endpoints**: `/auth/*`, `/campaigns/*`

### API Keys (POAP Claiming)
- **Purpose**: Public POAP claiming operations
- **Header**: `Authorization: ApiKey <key>`
- **Endpoints**: `/poap/claim`

## 📊 Database Schema

### Core Tables
- **organizers**: Event organizer accounts
- **api_keys**: Authentication keys for claiming
- **campaigns**: POAP event configurations
- **claims**: Individual POAP claims with NFT data
- **usage**: Daily usage statistics per organizer

### Key Relationships
```sql
organizers (1) ──── (many) campaigns
campaigns (1) ──── (many) claims
organizers (1) ──── (many) api_keys
organizers (1) ──── (many) usage
```

## 🛠️ Development Commands

```bash
# Database
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema changes
npm run db:migrate     # Create migration
npm run db:studio      # Open Prisma Studio
npm run db:seed        # Seed with demo data

# Development
npm run dev           # Start dev server
npm run build         # Build for production
npm run start         # Start production server
```

## 🔄 Migration from v1.0

Your existing demo will continue to work! The legacy endpoints are still supported:

- `POST /api/nft/claim-magical` ✅ Still works
- `POST /api/permits/create` ✅ Redirects to demo
- `GET /api/nft/user/:userPublicKey` ✅ Still works

### Gradual Migration Path
1. **Keep existing demo running** for current users
2. **Add new organizer features** for SaaS customers
3. **Migrate demo users** to proper campaigns when ready
4. **Sunset legacy endpoints** in future versions

## 🎯 Business Model Ready

### Revenue Streams
- **Freemium Model**: Free tier with paid upgrades
- **Usage-based Pricing**: Charge per POAP claimed
- **Enterprise Features**: White-label, custom domains
- **API Access**: Premium API features and higher limits

### Customer Acquisition
- **Self-service Onboarding**: Organizers can register instantly
- **API Documentation**: Clear docs for easy integration
- **Demo Campaign**: Show value immediately
- **Analytics Dashboard**: Prove ROI to customers

## 🚀 Next Steps (Module 3)

After completing this multi-tenant backend, the next module will be:

**MODULE 3: ORGANIZER DASHBOARD**
- React dashboard for campaign management
- Real-time analytics and charts
- Campaign creation wizard
- API key management interface
- Usage monitoring and billing

## 🤝 Support

- **API Documentation**: `GET /api/docs`
- **Health Check**: `GET /health`
- **Demo Credentials**: `demo@poap-infra.com` / `demo123`

---

**🎉 Congratulations!** You now have a production-ready, multi-tenant POAP SaaS platform that can support unlimited organizers and scale to millions of POAPs!