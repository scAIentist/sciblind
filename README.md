# SciBLIND - Scientifically Rigorous Blind Comparison Platform

A production-ready platform for conducting blind pairwise comparisons and rankings, inspired by MKBHD's smartphone camera test but built with military-grade security to prevent manipulation and bias.

## 🎯 Key Features

### Core Functionality
- **Blind Pairwise Comparisons**: Image or text comparisons with true blindness
- **Dual Ranking Methods**: Elo rating and Bradley-Terry (full MLE) algorithms
- **Bias-Aware Pair Scheduling**: Smart matchmaking that eliminates position bias
- **Real-time Rankings**: Live admin dashboard with confidence intervals
- **Comprehensive Exports**: CSV/JSON with full audit trails

### Security & Scientific Integrity 🔒
- **Metadata Leakage Prevention**: UUIDs, EXIF stripping, no predictable patterns
- **Image Fingerprinting Mitigation**: Aggressive normalization with random noise
- **Bot Prevention**: Cloudflare Turnstile CAPTCHA + rate limiting
- **Fraud Detection**: Response time analysis, pattern detection, duplicate prevention
- **Position Bias Elimination**: True randomization with 50/50 tracking
- **Zero Information Leakage**: No leaderboards shown to participants during voting

## 🏗️ Architecture

**Tech Stack:**
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL 16
- **Storage**: Local (dev) / S3-compatible (prod)
- **Auth**: Keycloak (OAuth2/OIDC) for admin
- **Security**: Cloudflare Turnstile, Sharp (image processing)

## 🚀 Quick Start

### Prerequisites

- **Node.js** 22+ and npm
- **Docker & Docker Compose** (for PostgreSQL)
- **Keycloak** realm configured (or mock for development)
- **Cloudflare Turnstile** account (free tier available)

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# The file already has development defaults configured
```

**Important Environment Variables:**

- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
- `IP_SALT`: Generate with `openssl rand -hex 32`
- `KEYCLOAK_*`: Your Keycloak realm configuration
- `TURNSTILE_*`: Cloudflare Turnstile keys ([get free keys](https://dash.cloudflare.com/))

### 3. Start Database

```bash
# Start PostgreSQL (and optionally MinIO for S3 testing)
docker compose up -d postgres

# Check database is healthy
docker compose ps
```

### 4. Initialize Database

```bash
# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# (Optional) Seed demo data
npm run db:seed
```

### 5. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) 🎉

## 📁 Project Structure

```
sciblind/
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── migrations/            # Database migrations
│   └── seed.ts                # Demo data seeder
├── src/
│   ├── app/                   # Next.js 16 App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Landing page
│   │   ├── admin/             # Admin dashboard (protected)
│   │   ├── s/[token]/         # Participant voting UI
│   │   └── api/               # API routes
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   ├── admin/             # Admin-specific components
│   │   └── participant/       # Participant UI components
│   └── lib/
│       ├── auth/              # Keycloak authentication
│       ├── security/          # CAPTCHA, rate limiting, fraud detection
│       ├── ranking/           # Elo & Bradley-Terry engines
│       ├── matchmaking/       # Bias-aware pair scheduler
│       ├── storage/           # Local/S3 storage abstraction
│       ├── db.ts              # Prisma client
│       └── utils.ts           # Utility functions
├── docker-compose.yml         # PostgreSQL + MinIO
├── .env.example               # Environment variables template
└── README.md
```

## 🔐 Security Features

### What SciBLIND Prevents ✅

1. **Metadata Leakage**: UUIDs for items, no predictable naming
2. **Direct URL Exposure**: Images served through rate-limited proxy
3. **EXIF Metadata Attacks**: All metadata stripped
4. **Simple Bot Attacks**: CAPTCHA + rate limiting
5. **Position Bias**: True randomization with tracking
6. **Vote Spam**: Multi-layer rate limiting
7. **Fast Bot Voting**: <500ms votes flagged

### What SciBLIND Mitigates ⚠️

- **SSIM-Based Image Fingerprinting**: Aggressive normalization makes it harder
- **Coordinated Human Attacks**: IP fingerprinting + pattern detection
- **Advanced Bots**: CAPTCHA + timing analysis (arms race)

See [plan documentation](C:\Users\Luka\.claude\plans\mutable-swimming-toast.md) for full security analysis.

## 📊 Usage

### As Admin

1. **Login** via Keycloak at `/admin`
2. **Create Study**:
   - Set title, description, participant prompt
   - Choose input type (IMAGE or TEXT)
   - Select ranking method (ELO or BRADLEY_TERRY)
   - Configure settings (comparisons per participant, K-factor, etc.)
3. **Upload Items**:
   - Bulk image upload (automatic EXIF stripping, normalization)
   - CSV text import
   - Add optional labels/tags (hidden from participants)
4. **Publish Study** → Get shareable link
5. **Monitor**:
   - Live rankings with confidence intervals
   - Position bias stats (should be ~50/50)
   - Fraud detection dashboard
6. **Export**:
   - CSV: items with rankings, stats
   - JSON: full audit log with all comparisons
   - Fraud report: flagged sessions/votes

### As Participant

1. Visit shareable link (`/s/[studyToken]`)
2. Complete CAPTCHA (Turnstile)
3. Vote on pairs by clicking left/right or using arrow keys
4. Track progress (e.g., "12/25 complete")
5. Complete optional post-voting survey
6. See completion message (**no live results shown**)

## 🧪 Testing

### Security Verification

**Metadata Leakage Prevention:**
```bash
# Check that images have no EXIF metadata
exiftool public/uploads/*.webp
# Should show: "Warning: [minor] Trailer data after PNG IEND chunk"

# Verify images are served through proxy (not direct S3 URLs)
curl http://localhost:3000/api/images/[itemId]
```

**Position Bias:**
```sql
-- Check Comparison table for random left/right distribution
SELECT
  COUNT(CASE WHEN leftItemId = itemAId THEN 1 END) as itemA_on_left,
  COUNT(CASE WHEN leftItemId = itemBId THEN 1 END) as itemB_on_left
FROM "Comparison";
-- Should be approximately 50/50
```

**Fraud Detection:**
```bash
# Simulate fast voting (should flag)
curl -X POST http://localhost:3000/api/sessions/[token]/vote \
  -H "Content-Type: application/json" \
  -d '{"winnerId": "...", "responseTimeMs": 300}'
# Check admin dashboard for flagged comparison
```

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect to Vercel
3. Add environment variables from `.env.example`
4. Connect external PostgreSQL (Neon, Supabase, AWS RDS)
5. Connect S3 storage (AWS S3, Cloudflare R2)
6. Deploy!

```bash
# Run migrations on production database
npx prisma migrate deploy
```

### Docker (Alternative)

```bash
# Build production image
docker build -t sciblind .

# Run with docker-compose (includes PostgreSQL)
docker compose up -d
```

## 📚 API Documentation

### Key Endpoints

**Study Management (Admin)**
- `POST /api/studies` - Create study
- `GET /api/studies` - List studies
- `GET /api/studies/[id]` - Get study details
- `POST /api/studies/[id]/items` - Upload items

**Participant Voting**
- `POST /api/sessions/init` - Initialize session (CAPTCHA verification)
- `GET /api/sessions/[token]/next` - Get next pair
- `POST /api/sessions/[token]/vote` - Record comparison

**Admin Analytics**
- `GET /api/studies/[id]/rankings` - Get rankings with confidence intervals
- `GET /api/studies/[id]/fraud` - Get fraud analysis
- `GET /api/studies/[id]/export` - Export CSV/JSON/fraud report

**Image Proxy**
- `GET /api/images/[itemId]` - Serve processed image (rate limited)

## 🛠️ Development

### Database Commands

```bash
# Generate Prisma client
npm run db:generate

# Create migration
npm run db:migrate

# Push schema without migration (dev only)
npm run db:push

# Seed demo data
npm run db:seed
```

### Code Quality

```bash
# Lint
npm run lint

# Type check
npx tsc --noEmit

# Format
npx prettier --write .
```

## 🤝 Contributing

This is a production-ready MVP. Future enhancements:

- [ ] Invite-only mode (email-based participant lists)
- [ ] Multi-tenancy (organization model)
- [ ] Advanced analytics (significance tests, bootstrap confidence intervals)
- [ ] Study templates
- [ ] Real-time collaboration (multi-admin)
- [ ] White-label deployment

## 📄 License

MIT

## 🙏 Acknowledgments

Inspired by MKBHD's Blind Smartphone Camera Test, with significant security enhancements based on scientific analysis by [Abrar Ul Haq](https://medium.com/@abrarulhaq.personal/from-blind-to-clear-unmasking-mkbhds-blind-smartphone-camera-test-scientific-edition-92cd8965654d).

Built with military-grade security for scientific integrity.

---

**SciBLIND** - Where Science Meets Blind Comparison 🔬🔒
