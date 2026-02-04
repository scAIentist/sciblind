# SciBLIND - Claude Context Document

> Last Updated: 2026-02-04

## Project Overview

SciBLIND is a scientifically rigorous platform for conducting blind pairwise comparisons and rankings. Inspired by MKBHD's smartphone camera test, it adds military-grade security to prevent manipulation and bias in voting studies.

**Purpose**: Enable researchers, creators, and organizations to run blind comparison studies (images or text) with proper statistical ranking and fraud prevention.

## Current Status: Production Live

**Live URL**: https://blind.scaientist.eu
**Admin Dashboard**: https://blind.scaientist.eu/admin

### What's Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | Complete | Category, AccessCode, ELO tracking, audit trail |
| Supabase Connection | Complete | PostgreSQL via Transaction Pooler |
| ELO Ranking System | Complete | Artist boost (+200 to +20), tie-breaking |
| Matchmaking Algorithm | Complete | Position bias prevention, adaptive pair selection |
| Access Code Auth | Complete | SHA256 hashing, single-use enforcement |
| Voting API | Complete | Full audit trail, fraud detection, rate limiting |
| Rankings API | Complete | Confidence indicators, position bias stats |
| Participant UI | Complete | Mobile optimized, Slovenian translations |
| Admin Dashboard | Complete | Real-time stats, rankings, session tracking |
| Security | Complete | Rate limiting, input validation, security headers |
| Images | Complete | Uploaded to Supabase Storage |
| Vercel Deployment | Complete | Auto-deploy from GitHub |

### Pending

| Component | Status | Notes |
|-----------|--------|-------|
| PDF Export | Planned | Methodology report generation |
| Keycloak Auth | Planned | SSO for admin panel |
| Traefik Integration | Planned | Reverse proxy setup |

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 16.1.4 |
| UI | React | 19.0.0 |
| Language | TypeScript | 5 |
| Styling | Tailwind CSS | 3.4.1 |
| Components | shadcn/ui (Radix) | - |
| Database | PostgreSQL (Supabase) | 16 |
| Storage | Supabase Storage | - |
| ORM | Prisma | 6.2.1 |
| Auth | Custom Access Codes | SHA256 |
| Deployment | Vercel | - |

## Database Schema

### Core Models

1. **Study** - Research study container
   - Category support with `hasCategorySeparation`
   - Access codes with `requireAccessCode`
   - Localization with `language` field
   - Branding with `logoUrls` array

2. **Category** - Groups items (e.g., "3. razredi")
   - `name`, `slug`, `displayOrder`
   - Items filtered by category during voting

3. **AccessCode** - Single-use authentication
   - `code` (plaintext), `codeHash` (SHA256)
   - `usedAt`, `usedBySessionId` for tracking

4. **Item** - Images/text being ranked
   - `artistRank` (1-10), `artistEloBoost` (+200 to +20)
   - `eloRating` with real-time updates
   - Position bias: `leftCount`, `rightCount`

5. **Session** - Participant sessions
   - Linked to AccessCode
   - `categoryProgress` JSON for multi-category tracking

6. **Comparison** - Individual votes (audit trail)
   - Full position tracking (`leftItemId`, `rightItemId`)
   - `responseTimeMs` for fraud detection
   - `isFlagged`, `flagReason`

## IzVRS Study Details

**Study ID**: `cml808mzc0000m104un333c69`

**Participant URL**: https://blind.scaientist.eu/study/cml808mzc0000m104un333c69

**Categories**:
| Category | Items | Artist Ranked |
|----------|-------|---------------|
| 3. razredi | 49 | 20 (IDs: 1-49) |
| 4. razredi | 29 | 20 (IDs: 50-78) |
| 5. razredi | 50 | 19 (IDs: 79-128) |

**Access Codes** (single-use):
1. IzVRS-ocenjevalec90074
2. IzVRS-ocenjevalec25793
3. IzVRS-ocenjevalec85642
4. IzVRS-ocenjevalec95696
5. IzVRS-ocenjevalec86339

**Test Code**: `IzVRS-TEST-MODE`
- Unlimited uses (no single-use restriction)
- Does NOT affect ELO ratings or item statistics
- Sessions marked as `isTestSession: true`
- Comparisons flagged as `test_session`
- UI flow works normally for testing

**Artist ELO Boost**:
- Rank 1 (10 pts): +200 ELO (starting at 1700)
- Rank 2 (9 pts): +180 ELO
- ...
- Rank 10 (1 pt): +20 ELO
- Unranked: Base 1500 ELO

**Tie-Breaking**: Artist rank wins if ELO is equal

## API Routes

### Participant APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/participate/[studyId]/auth` | POST | Validate access code, create session |
| `/api/participate/[studyId]/next-pair` | GET | Get next comparison pair |
| `/api/participate/[studyId]/vote` | POST | Submit vote, update ELO |

### Admin APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/dashboard` | GET | Global stats, all studies overview |
| `/api/admin/studies/[studyId]` | GET | Detailed study info, rankings, sessions |
| `/api/studies/[studyId]` | GET | Get study details |
| `/api/studies/[studyId]/rankings` | GET | Get current rankings (JSON export) |

## Key Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Complete database schema |
| `prisma/seed.ts` | IzVRS study seeding |
| `src/lib/ranking/elo.ts` | ELO calculation + artist boost |
| `src/lib/matchmaking/index.ts` | Pair selection algorithm |
| `src/lib/auth/hash.ts` | Access code hashing |
| `src/lib/security/rate-limit.ts` | Rate limiting utilities |
| `src/lib/security/validation.ts` | Input validation |
| `src/middleware.ts` | Security headers |
| `src/app/study/[studyId]/page.tsx` | Entry page (code input) |
| `src/app/study/[studyId]/vote/page.tsx` | Voting interface (mobile optimized) |
| `src/app/admin/page.tsx` | Admin dashboard |
| `src/app/admin/studies/[studyId]/page.tsx` | Study detail view |
| `scripts/upload-to-supabase.ts` | Image upload script |
| `scripts/add-test-code.ts` | Test access code script |

## Security Features

### Rate Limiting
- Auth endpoint: 5 attempts per minute per IP
- Vote endpoint: 60 votes per minute per session
- Next-pair endpoint: 120 requests per minute per session

### Input Validation
- CUID format validation for all IDs
- Session token format validation (64 hex chars)
- Access code format validation
- Response time bounds checking

### Security Headers (middleware)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (production)
- `Content-Security-Policy` for APIs
- `Permissions-Policy`

### Fraud Detection
- Response time < 500ms flagged as "too_fast"
- Response time > 5min flagged as "too_slow"
- Session-level flagging with reasons
- Full audit trail for all comparisons

## Deployment

### Vercel Environment Variables

```
DATABASE_URL=postgresql://postgres.rdsozrebfjjoknqonvbk:Sc%2EAI%2Eentist%2198@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
NEXTAUTH_SECRET=e5c5tUa1IQFMMbDor8QibeJuX4ufd9wABrUtjaPYzm8
NEXTAUTH_URL=https://blind.scaientist.eu
NEXT_PUBLIC_APP_URL=https://blind.scaientist.eu
IP_SALT=d34945fe5fe5387f8f5e074597037676dbd2df398d5507021ee52331c41c4d17
```

### Domain Setup

Domain: `blind.scaientist.eu`
DNS: CNAME → cname.vercel-dns.com

### Image Storage

Images stored in Supabase Storage bucket `izvrs-images`.
Public URL format: `https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images/{category}/{id}.png`

## Development Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run db:push          # Push schema to database
npm run db:seed          # Seed IzVRS study
npx tsx scripts/add-test-code.ts  # Reset test access code
```

## Admin Dashboard Features

**URL**: https://blind.scaientist.eu/admin

### Dashboard View (`/admin`)
- Global statistics (studies, sessions, comparisons, flagged)
- Per-study overview with expandable details
- Category rankings (top 5 per category)
- Access code usage tracking
- Session statistics
- Quick links to participant view and JSON export

### Study Detail View (`/admin/studies/[studyId]`)
- Full rankings table with ELO, win/loss, position bias
- Image thumbnails for items
- Session list with completion status
- Access code management
- Flagged comparison alerts

## Next Steps

1. ✅ Upload images to Supabase Storage
2. ✅ Deploy to Vercel
3. ✅ Mobile optimization
4. ✅ Security hardening (rate limiting, validation)
5. ✅ Admin dashboard with real data
6. 🔄 Keycloak integration for admin auth
7. 🔄 Traefik reverse proxy setup
8. ⏳ PDF export with methodology
9. ⏳ CSV export for data analysis

## Keycloak Integration (Planned)

To integrate Keycloak for admin authentication:

1. **Required Environment Variables**:
   ```
   KEYCLOAK_ISSUER=https://your-keycloak.example.com/realms/sciblind
   KEYCLOAK_CLIENT_ID=sciblind-app
   KEYCLOAK_CLIENT_SECRET=your-client-secret-here
   ```

2. **Keycloak Realm Configuration**:
   - Create realm: `sciblind`
   - Create client: `sciblind-app` (confidential)
   - Set redirect URIs: `https://blind.scaientist.eu/*`
   - Create role: `admin`
   - Assign users to admin role

3. **Implementation**:
   - Add NextAuth.js with Keycloak provider
   - Protect `/admin/*` routes
   - Add login/logout UI

## Traefik Integration (Planned)

For Traefik reverse proxy:

1. **Labels for Docker**:
   ```yaml
   labels:
     - "traefik.enable=true"
     - "traefik.http.routers.sciblind.rule=Host(`blind.scaientist.eu`)"
     - "traefik.http.routers.sciblind.tls=true"
     - "traefik.http.routers.sciblind.tls.certresolver=letsencrypt"
   ```

2. **Or DNS pointing**:
   - Point `blind.scaientist.eu` to Traefik
   - Traefik routes to Vercel or direct deployment
