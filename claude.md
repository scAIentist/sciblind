# SciBLIND - Claude Context Document

> Last Updated: 2026-02-04

## Project Overview

SciBLIND is a scientifically rigorous platform for conducting blind pairwise comparisons and rankings. Inspired by MKBHD's smartphone camera test, it adds military-grade security to prevent manipulation and bias in voting studies.

**Purpose**: Enable researchers, creators, and organizations to run blind comparison studies (images or text) with proper statistical ranking and fraud prevention.

## Current Status: Early MVP (UI Scaffold)

### What's Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | Complete | 7 models in Prisma, production-ready |
| Supabase Connection | Configured | PostgreSQL hosted on Supabase |
| Landing Page | Complete | Hero section, navigation |
| Admin Dashboard | UI Only | Stats cards, empty state, no data |
| Create Study Form | UI Only | Full form with validation, submit disabled |
| UI Components | Partial | Button component, theme system |
| Prisma Client | Complete | Singleton with hot-reload safety |

### What's NOT Implemented (Placeholder Only)

- **API Routes** - No backend endpoints exist
- **Authentication** - Keycloak configured in .env but not implemented
- **Ranking Algorithms** - No Elo or Bradley-Terry logic
- **Matchmaking** - No pair scheduling
- **Image Processing** - No EXIF stripping or normalization
- **Storage** - No S3/local abstraction
- **Fraud Detection** - No timing analysis or pattern detection
- **Participant Voting UI** - No voting interface
- **CAPTCHA** - Turnstile keys configured but not integrated

### Empty Directories (Planned Features)

```
src/lib/auth/         # Keycloak authentication
src/lib/matchmaking/  # Bias-aware pair scheduler
src/lib/ranking/      # Elo & Bradley-Terry engines
src/lib/security/     # CAPTCHA, rate limiting, fraud detection
src/lib/storage/      # Local/S3 storage abstraction
src/components/admin/      # Admin UI components
src/components/participant/ # Participant voting components
```

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 16.1.4 |
| UI | React | 19.0.0 |
| Language | TypeScript | 5 |
| Styling | Tailwind CSS | 3.4.1 |
| Components | shadcn/ui (Radix) | - |
| Database | PostgreSQL (Supabase) | 16 |
| ORM | Prisma | 6.2.1 |
| Auth | NextAuth v5 + Keycloak | 5.0.0-beta.25 |
| Images | Sharp | 0.33.5 |
| Charts | Recharts | 2.15.0 |
| Forms | React Hook Form + Zod | 7.54.2 / 3.24.1 |

## Database Schema

### Core Models

1. **Study** - Research study container
   - `title`, `description`, `participantPrompt`
   - `inputType`: IMAGE | TEXT
   - `rankingMethod`: ELO | BRADLEY_TERRY
   - Settings: `comparisonsPerParticipant`, `eloKFactor`, `targetTopN`

2. **Item** - Individual items being ranked
   - `imageUrl`/`imageKey` (for images) or `text` (for text)
   - `eloRating`, `btAbility` - Ranking scores
   - Position bias tracking: `leftCount`, `rightCount`

3. **Session** - Participant session
   - `token` (unique, resumable)
   - `ipHash`, `userAgent` - Fingerprinting
   - `captchaVerifiedAt` - Bot prevention
   - Fraud flags: `isFlagged`, `flagReason`

4. **Comparison** - Individual pairwise vote
   - `itemAId`, `itemBId`, `winnerId`
   - `leftItemId`, `rightItemId` - Position tracking
   - `responseTimeMs` - For fraud detection

5. **SurveyResponse** - Optional post-voting survey
6. **UsageMetrics** - Event tracking for analytics

## Environment Configuration

**Database**: Supabase PostgreSQL
```
DATABASE_URL="postgresql://postgres:...@db.rdsozrebfjjoknqonvbk.supabase.co:5432/postgres"
```

**Authentication**: Keycloak (not yet implemented)
- Configured in `.env` with placeholder values
- NextAuth secret generated

**Storage**: Local (dev) or S3-compatible (prod)
- MinIO available via Docker Compose for local S3 testing

**Security**:
- Cloudflare Turnstile test keys configured
- IP salt generated for fingerprinting

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (Turbopack)
npm run dev

# Database operations
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:seed      # Seed demo data

# Start local services (PostgreSQL + MinIO)
docker compose up -d
```

## Key Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Complete database schema |
| `src/lib/db.ts` | Prisma client singleton |
| `src/app/page.tsx` | Landing page |
| `src/app/admin/page.tsx` | Admin dashboard (empty state) |
| `src/app/admin/studies/new/page.tsx` | Create study form |
| `.env` | Environment configuration (gitignored) |
| `docker-compose.yml` | Local PostgreSQL + MinIO |

## Next Steps (Priority Order)

1. **Database Migration** - Run `npm run db:push` to sync schema with Supabase
2. **API Routes** - Implement study CRUD endpoints
3. **Authentication** - Set up Keycloak or switch to Supabase Auth
4. **Participant Voting** - Build the core voting UI
5. **Ranking Algorithms** - Implement Elo and Bradley-Terry
6. **Image Processing** - EXIF stripping, normalization pipeline
7. **Fraud Detection** - Response time analysis, pattern detection

## Architecture Decisions

### Why Supabase?
- Managed PostgreSQL with built-in connection pooling
- Could leverage Supabase Auth (simpler than Keycloak)
- S3-compatible storage available
- Free tier sufficient for development

### Why Dual Ranking (Elo + Bradley-Terry)?
- **Elo**: Fast, real-time updates, good for live monitoring
- **Bradley-Terry**: Statistically rigorous, proper confidence intervals, better for final analysis

### Position Bias Prevention
- Database tracks `leftItemId`/`rightItemId` separately from `itemAId`/`itemBId`
- Allows verification of 50/50 random positioning
- Can detect if certain items are shown more on one side

## Security Model

SciBLIND prevents:
- Metadata leakage (UUIDs, no predictable URLs)
- Direct image URL exposure (proxy serving)
- EXIF metadata attacks (stripping)
- Bot attacks (CAPTCHA + rate limiting)
- Position bias (randomization + tracking)
- Vote spam (multi-layer rate limiting)
- Fast bot voting (<500ms flagged)

SciBLIND mitigates (harder but not impossible):
- Image fingerprinting attacks
- Coordinated human manipulation
- Advanced ML-based bots

## Inspiration

Based on analysis of MKBHD's Blind Smartphone Camera Test methodology by Abrar Ul Haq, identifying security vulnerabilities that SciBLIND addresses. Reference PDF included in project root.
