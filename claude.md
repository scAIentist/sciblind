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
| Database Schema | Complete | Category, AccessCode, ELO tracking, audit trail, test mode |
| Supabase Connection | Complete | PostgreSQL via Transaction Pooler |
| ELO Ranking System | Complete | Artist boost (+200 to +20), tie-breaking |
| Matchmaking Algorithm | Complete | Position bias prevention, adaptive pair selection, variety penalty |
| Access Code Auth | Complete | SHA256 hashing, single-use + test mode support |
| Voting API | Complete | Full audit trail, fraud detection, rate limiting |
| Rankings API | Complete | Confidence indicators, position bias stats |
| Participant UI | Complete | Mobile stacked layout, desktop side-by-side, Slovenian translations |
| Admin Dashboard | Complete | Real-time stats, rankings, session tracking |
| Security | Complete | Rate limiting, input validation, security headers |
| Images | Complete | Uploaded to Supabase Storage |
| Vercel Deployment | Complete | Auto-deploy from GitHub |
| Test Mode | Complete | Unlimited test code uses, no ELO impact |

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

3. **AccessCode** - Authentication codes
   - `code` (plaintext), `codeHash` (SHA256)
   - `usedAt`, `usedBySessionId` for tracking
   - `isTestCode` - if true, allows unlimited uses with no ELO impact

4. **Item** - Images/text being ranked
   - `artistRank` (1-10), `artistEloBoost` (+200 to +20)
   - `eloRating` with real-time updates
   - `imageKey` for Supabase Storage path
   - Position bias: `leftCount`, `rightCount`

5. **Session** - Participant sessions
   - Linked to AccessCode
   - `isTestSession` - if true, votes don't affect ELO
   - `categoryProgress` JSON for multi-category tracking

6. **Comparison** - Individual votes (audit trail)
   - Full position tracking (`leftItemId`, `rightItemId`)
   - `responseTimeMs` for fraud detection
   - `isFlagged`, `flagReason` (includes 'test_session')

## IzVRS Study Details

**Study ID**: `cml808mzc0000m104un333c69`

**Title**: IzVRS Likovni natečaj 2025

**Description**: Slepo primerjanje likovnih del učencev za izbor najboljših 12, ki bodo natisnjeni na sledilnikih. Pomagajte nam pri izboru!

**Participant URL**: https://blind.scaientist.eu/study/cml808mzc0000m104un333c69

**Study Links File**: `IzVRS-Study-Links.txt` (in project root)

**Categories**:
| Category | Items | Artist Ranked |
|----------|-------|---------------|
| 3. razredi | 49 | 20 (IDs: 1-49) |
| 4. razredi | 29 | 20 (IDs: 50-78) |
| 5. razredi | 50 | 19 (IDs: 79-128) |

**Reviewer Access Codes** (single-use):
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
| `/api/participate/[studyId]/vote` | POST | Submit vote, update ELO (skipped for test sessions) |

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
| `scripts/cleanup-test-data.ts` | Wipe all sessions/comparisons, reset study |
| `scripts/fix-test-code.ts` | Mark test code and clean up test data |
| `IzVRS-Study-Links.txt` | All study links and access codes |

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
- Test sessions flagged as "test_session"
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
- Database field: `imageKey` (e.g., "izvrs/3-razredi/1.png")
- Public URL format: `https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images/{category}/{id}.png`
- The voting page builds URLs from `imageKey` automatically

## Development Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run db:push          # Push schema to database (use port 5432 for migrations)
npm run db:seed          # Seed IzVRS study
npx tsx scripts/cleanup-test-data.ts  # Reset study to fresh state
npx tsx scripts/fix-test-code.ts      # Fix test code configuration
```

### Database Migration Note
For schema changes, use port 5432 (session pooler) instead of 6543 (transaction pooler):
```bash
DATABASE_URL="postgresql://postgres.rdsozrebfjjoknqonvbk:Sc.AI.entist!98@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" npx prisma db push
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

## Known Issues & Fixes

### Responsive Layout Fix (2026-02-04)
IzVRS images are mixed format (landscape and portrait). Using responsive grid layout:
- Mobile: Stacked vertically (1 column) for larger images
- Desktop: Side-by-side (2 columns) for efficient space usage
- Native `<img>` with `object-contain` - works for BOTH landscape AND portrait without cropping
- Direct Supabase storage URLs (render API caused EXIF rotation issues)

### Matchmaking Variety Penalty (2026-02-04)
Added variety penalty to prevent same image appearing consecutively:
- Tracks last 3 comparisons' items
- Recently shown items get score penalty (50/recency)
- Still prioritizes fair coverage (under-compared items first)
- Balances scientific validity with user perception of fairness

## Algorithm Verification (2026-02-04)

The matchmaking and ELO algorithms have been verified as scientifically sound:

### ELO Rating System ✅
- Standard formula: `E = 1 / (1 + 10^((R_opponent - R_self) / 400))`
- Zero-sum updates (winner's gain ≈ loser's loss)
- K-factor 32 provides good sensitivity
- Artist boost correctly applied as initial rating adjustment

### Matchmaking Algorithm ✅
- **No duplicate pairs**: Set-based tracking with sorted keys
- **Fair coverage**: Under-compared items prioritized
- **Informative comparisons**: Similar ELO preferred (Swiss-system inspired)
- **Position bias correction**: Active balancing of left/right placement
- **Variety penalty**: Recently shown items penalized to prevent repetition
- **Full O(n²) search** for sets ≤100 items (covers all IzVRS categories)
- **Fallback guarantee**: Always finds an uncompared pair if one exists

### Statistical Power
- Target: ~10 comparisons per item
- Formula: `(itemCount × 5) / reviewerCount`
- Bounded 15-50 comparisons per reviewer per category

## Next Steps

1. ✅ Upload images to Supabase Storage
2. ✅ Deploy to Vercel
3. ✅ Mobile optimization
4. ✅ Security hardening (rate limiting, validation)
5. ✅ Admin dashboard with real data
6. ✅ Test mode for unlimited testing without ELO impact
7. ✅ Fix image display in voting page (vertical layout for landscape)
8. ✅ Algorithm verification (ELO + matchmaking)
9. 🔄 Keycloak integration for admin auth
10. 🔄 Traefik reverse proxy setup
11. ⏳ PDF export with methodology
12. ⏳ CSV export for data analysis

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
