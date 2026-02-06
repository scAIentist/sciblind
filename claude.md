# SciBLIND - Claude Context Document

> Last Updated: 2026-02-06 (v5.5 — Matchmaking Duplicate Quads Fix + Performance Optimizations)

## Project Overview

SciBLIND is a scientifically rigorous platform for conducting blind pairwise comparisons and rankings. Inspired by MKBHD's smartphone camera test, it adds military-grade security to prevent manipulation and bias in voting studies.

**Purpose**: Enable researchers, creators, and organizations to run blind comparison studies (images or text) with proper statistical ranking and fraud prevention.

## Current Status: Production Live

**Live URL**: https://blind.scaientist.eu
**Admin Dashboard**: https://blind.scaientist.eu/admin
**Admin Login**: https://blind.scaientist.eu/admin/login

### What's Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | Complete | Category, AccessCode, ELO tracking, audit trail, test mode, activity log, comparison mode |
| Supabase Connection | Complete | PostgreSQL via Transaction Pooler |
| ELO Ranking System | Complete | Artist boost (+200 to +20), tie-breaking, adaptive K-factor |
| Bradley-Terry Model | Complete | MLE estimation via MM algorithm, Fisher information SEs |
| Matchmaking Algorithm | Complete | Two-phase (coverage + depth), full coverage, streak limits, pair/quad modes |
| Statistical Diagnostics | Complete | Publishable threshold, graph connectivity, circular triads |
| Access Code Auth | Complete | SHA256 hashing, single-use + test mode support |
| Admin Auth | Complete | ADMIN_SECRET env var, HTTP-only cookie, middleware protection |
| Voting API | Complete | Full audit trail, fraud detection, rate limiting, pair + quad modes |
| Rankings API | Complete | Admin/participant access control, sensitive field stripping |
| Audit Export API | Complete | Full comparison log with metadata, JSON format |
| Activity Logging | Complete | Immutable append-only log for all portal activity |
| Participant UI | Complete | MKBHD-inspired design, fire-and-forget voting, checkpoint interstitials |
| Admin Dashboard | Complete | Real-time stats, rankings, session tracking, study settings, activity log |
| Admin Login Page | Complete | Password auth at /admin/login, rate-limited |
| Security | Complete | Rate limiting, input validation, security headers, admin middleware |
| Images | Complete | Compressed WebP format, uploaded to Supabase Storage |
| Vercel Deployment | Complete | Auto-deploy from GitHub |
| Test Mode | Complete | Unlimited test code uses, no ELO impact |
| Automated Tests | Complete | 86 tests: Elo, BT, matchmaking (incl. tournament), statistics (Vitest) |
| Algorithm Versioning | Complete | `algoVersion` stored with every comparison |
| UI Customization | Complete | Per-study theme, logo, progress, animation, category style |
| Performance | Complete | Fire-and-forget voting, parallel fetch, skeleton UI, image preloading |

### Pending

| Component | Status | Notes |
|-----------|--------|-------|
| PDF Export | Planned | Methodology report generation |
| Keycloak Auth | Planned | SSO for admin panel (replaces ADMIN_SECRET) |
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
| Auth (Participants) | Custom Access Codes | SHA256 |
| Auth (Admin) | ADMIN_SECRET | HTTP-only cookie |
| Testing | Vitest | 4.x |
| Deployment | Vercel | Auto-deploy from GitHub |
| Build Tool | Turbopack | Built into Next.js 16 |

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Vercel (Edge)                     │
│  ┌─────────────┐  ┌────────────────────────────────┐│
│  │  Middleware  │  │        Next.js App Router      ││
│  │ • Sec headers│  │  ┌──────────┐  ┌────────────┐ ││
│  │ • Admin auth │  │  │  Pages   │  │    APIs     │ ││
│  │ • Route gate │  │  │ /study/* │  │ /api/part/* │ ││
│  └──────┬──────┘  │  │ /admin/* │  │ /api/admin/*│ ││
│         │         │  └──────────┘  └──────┬─────┘ ││
│         │         │                       │        ││
│         │         │  ┌────────────────────┘        ││
│         │         │  │  Core Libraries             ││
│         │         │  │  • ranking/ (elo, BT, stats)││
│         │         │  │  • matchmaking/             ││
│         │         │  │  • security/ (rate, valid)  ││
│         │         │  │  • logging.ts               ││
│         │         │  └──────────┬─────────────────┘││
│         │         └─────────────┼──────────────────┘│
└─────────┼───────────────────────┼───────────────────┘
          │                       │
          │              ┌────────┘
          │              │
    ┌─────▼──────┐ ┌─────▼──────────┐
    │  Supabase  │ │   Supabase     │
    │  Storage   │ │   PostgreSQL   │
    │ (images)   │ │  (via Prisma)  │
    └────────────┘ └────────────────┘
```

### Request Flow (Voting)

1. **Participant enters access code** → POST `/api/participate/[studyId]/auth` → validates code, creates session, returns token
2. **Category selection** → Study page shows categories with thumbnail grids (skeleton → fade-in)
3. **Pair loading** → GET `/api/participate/[studyId]/next-pair` → matchmaking selects optimal pair → images preloaded before display
4. **Vote cast** → POST `/api/participate/[studyId]/vote` (fire-and-forget, no await) + GET next-pair (parallel with 400ms animation)
5. **Transition** → fade-out → swap images → preload → fade-in (opacity-based, no flash)
6. **Category complete** → threshold check → next category or study complete

### Performance Architecture

The voting page is optimized for perceived instant response:

**Frontend Optimizations**:
- **Fire-and-forget vote**: `fetch(...).catch(() => {})` — vote POST is never awaited
- **Parallel pipeline**: animation (400ms) + next-quad fetch + vote POST all run simultaneously
- **Image preloading**: all 4 quad images preloaded via `new Image()` before display
- **Opacity transitions**: `imagesReady` state controls CSS `transition-opacity` — no flash of empty content
- **Skeleton UI**: category thumbnails show shimmer placeholders until ALL images loaded, then fade in together

**Backend Optimizations (v5.3)**:
- **vote-quad API**: Single `findMany` query for all 4 items instead of 4 separate `findUnique` queries
- **next-quad API**: Parallel `Promise.all()` for items + comparisons fetch in category selection
- **Selective queries**: Only needed fields selected from DB (no full-row fetches)
- **Tournament phase**: Simplified win-count sorting instead of complex scoring (O(n log n) vs O(n²))

**Database Query Optimization**:
```typescript
// BEFORE (slow): 5 sequential queries
const [session, ...items] = await Promise.all([
  prisma.session.findUnique(...),
  ...itemIds.map(id => prisma.item.findUnique({ where: { id } }))
]);

// AFTER (fast): 2 parallel queries
const [session, items] = await Promise.all([
  prisma.session.findUnique(...),
  prisma.item.findMany({ where: { id: { in: itemIds } } })
]);
```

## Database Schema

### Core Models

1. **Study** - Research study container
   - Category support with `hasCategorySeparation`
   - Access codes with `requireAccessCode`
   - Localization with `language` field
   - Branding with `logoUrls` array
   - Scientific thresholds: `minExposuresPerItem`, `minTotalComparisons`
   - `adaptiveKFactor` for automatic K-factor adjustment
   - `allowContinuedVoting` for post-threshold voting
   - UI customization: `uiThemeColor`, `uiLogoPosition`, `uiProgressStyle`, `uiShowCounts`, `uiVoteAnimation`, `uiCategoryStyle`
   - Visibility: `showRankingsToParticipants` controls whether non-admin users can see rankings

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
   - `algoVersion` - algorithm version tag (default: "sciblind-v2")

7. **ActivityLog** - Immutable append-only audit log
   - `action` enum: SESSION_CREATED, VOTE_CAST, AUTH_SUCCESS, etc.
   - `detail`, `metadata` (JSON), `ipHash`, `userAgent`
   - Non-blocking fire-and-forget writes via `logActivity()`
   - Sync writes via `logActivitySync()` for audit-critical events

8. **SurveyResponse** - Post-study demographics (optional)

9. **UsageMetrics** - Platform usage tracking (future billing)

## IzVRS Study Details

**Study ID**: `cml808mzc0000m104un333c69`

**Title**: IzVRS Likovni natečaj 2025

**Key Settings**: `comparisonMode=quad`, `allowContinuedVoting=false` (stops at threshold), `uiShowCounts=false`

**Description**: Slepo primerjanje likovnih del učencev za izbor najboljših 12, ki bodo natisnjeni na sledilnikih. Pomagajte nam pri izboru!

**Participant URL**: https://blind.scaientist.eu/study/cml808mzc0000m104un333c69

**Study Links File**: `IzVRS-Study-Links.txt` (in project root, gitignored)

**Categories**:
| Category | Items | Artist Ranked |
|----------|-------|---------------|
| 3. razredi | 49 | 20 (IDs: 1-49) |
| 4. razredi | 29 | 20 (IDs: 50-78) |
| 5. razredi | 50 | 19 (IDs: 79-128) |

**Reviewer Access Codes** (single-use, all available):
1. IzVRS-ocenjevalec90074 → Label: "Ocenjevalec 90074"
2. IzVRS-ocenjevalec25793 → Label: "Ocenjevalec 25793"
3. IzVRS-ocenjevalec85642 → Label: "Ocenjevalec 85642"
4. IzVRS-ocenjevalec95696 → Label: "Ocenjevalec 95696"
5. IzVRS-ocenjevalec86339 → Label: "Ocenjevalec 86339"
6. IzVRS-ocenjevalec36430 → Label: "Ocenjevalec 36430"
7. IzVRS-ocenjevalec98370 → Label: "Ocenjevalec 98370"
8. IzVRS-ocenjevalec14944 → Label: "Ocenjevalec 14944"
9. IzVRS-ocenjevalec29621 → Label: "Ocenjevalec 29621"

**Note**: Code labels now match the code numbers for traceability (fixed 2026-02-06).

**Test Code**: `IzVRS-TEST-MODE`
- Unlimited uses (no single-use restriction)
- Does NOT affect ELO ratings or item statistics
- Sessions marked as `isTestSession: true`
- Comparisons flagged as `test_session`
- UI flow works normally for testing

**Artist ELO Boost** (Updated 2026-02-06):
- Rank 1 (highest score): +200 ELO → starts at 1700
- Rank N (lowest score): 0 ELO boost → starts at 1500
- Formula: `boost = 200 * (1 - (rank - 1) / (totalInSubcategory - 1))`
- **Important**: Rankings are per SUBCATEGORY (3a, 3b, 4a, 4b, 5a, 5b), not merged categories
- Script: `npx tsx scripts/update-artist-rankings-izvrs.ts --yes`
- Source: `Seznam_slik_ocene_slikarka_ALL.xlsx` (Excel format: Razred, Št točk, Slika ID)

**Subcategory Handling**:
The artist ranked each category as two separate subcategories (e.g., 3a and 3b).
The ELO boost is calculated within each subcategory independently:
- 3a: 24 items ranked separately → boost calculated based on position within 3a
- 3b: 25 items ranked separately → boost calculated based on position within 3b
- (Same pattern for 4a/4b and 5a/5b)

**Tie-Breaking**: Artist rank wins if ELO is equal

## API Routes

### Participant APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/participate/[studyId]/auth` | POST | Validate access code, create session |
| `/api/participate/[studyId]/next-pair` | GET | Get next comparison pair (optimized: single findMany, selective fields) |
| `/api/participate/[studyId]/next-quad` | GET | Get next 4 items for quadruplet comparison |
| `/api/participate/[studyId]/vote` | POST | Submit pairwise vote, update ELO (skipped for test sessions). Parallelized DB fetches. |
| `/api/participate/[studyId]/vote-quad` | POST | Submit quadruplet vote, creates 3 comparison records (winner vs each loser) |
| `/api/participate/[studyId]/category-thumbnails` | GET | Get category thumbnail images. Rate-limited (100 req/min/IP). |

### Admin APIs (all require ADMIN_SECRET auth except `/api/admin/auth`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/auth` | POST | Login with ADMIN_SECRET, sets HTTP-only cookie. Rate-limited (5/min/IP). |
| `/api/admin/auth` | DELETE | Logout — clears admin cookie |
| `/api/admin/dashboard` | GET | Global stats, all studies overview |
| `/api/admin/studies/[studyId]` | GET | Detailed study info, rankings, sessions |
| `/api/admin/studies/[studyId]/export` | GET | Full audit export (JSON) with all comparisons |
| `/api/admin/studies/[studyId]/ui-config` | PATCH | Update UI customization + behavioral settings (incl. `allowContinuedVoting`) |
| `/api/admin/activity-log` | GET | Activity log with filtering (studyId, sessionId, action, limit, offset) |

### Public APIs (with access control)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/studies/[studyId]` | GET | Study details. Cached (s-maxage=300, stale-while-revalidate=600). |
| `/api/studies/[studyId]/rankings` | GET | Rankings. Admin: full data. Non-admin: gated by `showRankingsToParticipants`, sensitive fields stripped. |

## Admin Authentication

### Current: ADMIN_SECRET (interim)

The admin panel is protected by a shared secret (`ADMIN_SECRET` env var) until Keycloak SSO is integrated.

**How it works**:
1. User visits `/admin` → middleware redirects to `/admin/login` if not authenticated
2. User enters secret → POST to `/api/admin/auth` → validates, sets HTTP-only cookie `sciblind-admin-token`
3. Subsequent requests checked in middleware: `Authorization: Bearer <secret>` header OR `sciblind-admin-token` cookie
4. All `/api/admin/*` routes (except `/api/admin/auth`) return 401 if not authenticated
5. Cookie: HTTP-only, secure (prod), SameSite=strict, 7-day expiry
6. Login endpoint rate-limited: 5 attempts/min/IP

**Files**:
- `src/middleware.ts` — route-level protection (redirect pages, 401 APIs)
- `src/lib/security/admin-auth.ts` — `requireAdminAuth()`, `validateAdminLogin()` helpers
- `src/app/api/admin/auth/route.ts` — login/logout endpoint
- `src/app/admin/login/page.tsx` — login UI

### Rankings Access Control

The `/api/studies/[studyId]/rankings` endpoint has layered access:
- **Admin requests** (valid ADMIN_SECRET): full data including all fields
- **Non-admin requests**: blocked with 403 if `showRankingsToParticipants` is false
- **Non-admin response**: strips sensitive fields — `externalId`, `label`, `artistRank`, `artistEloBoost`, position bias stats, standard error, BT results, detailed data quality info

## Key Files

### Application Pages

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Landing page |
| `src/app/study/[studyId]/page.tsx` | Study entry page (access code input, category selection) |
| `src/app/study/[studyId]/vote/page.tsx` | **Core voting interface** — MKBHD-inspired, fire-and-forget, skeleton UI |
| `src/app/admin/page.tsx` | Admin dashboard |
| `src/app/admin/login/page.tsx` | Admin login page |
| `src/app/admin/studies/[studyId]/page.tsx` | Study detail view with rankings |
| `src/app/admin/studies/new/page.tsx` | Create new study |

### Core Libraries

| File | Purpose |
|------|---------|
| `src/lib/db.ts` | Prisma client singleton (dev logging, global instance) |
| `src/lib/ranking/elo.ts` | ELO calculation + artist boost + adaptive K |
| `src/lib/ranking/bradley-terry.ts` | Bradley-Terry MLE estimator (MM algorithm) |
| `src/lib/ranking/statistics.ts` | Threshold, connectivity, circular triads, SE |
| `src/lib/matchmaking/index.ts` | Pair/quad selection (coverage + depth + streak limits) |
| `src/lib/auth/hash.ts` | Access code SHA256 hashing |
| `src/lib/logging.ts` | Activity logging (fire-and-forget + sync variants) |

### Security

| File | Purpose |
|------|---------|
| `src/middleware.ts` | Security headers + admin route protection |
| `src/lib/security/admin-auth.ts` | Admin auth helpers (requireAdminAuth, validateAdminLogin) |
| `src/lib/security/rate-limit.ts` | In-memory rate limiting with sliding window + auto-cleanup |
| `src/lib/security/validation.ts` | Input validation (CUID, session token, access code, vote body) |
| `src/lib/security/index.ts` | Security barrel export |

### API Routes

| File | Purpose |
|------|---------|
| `src/app/api/participate/[studyId]/auth/route.ts` | Access code auth, session creation |
| `src/app/api/participate/[studyId]/next-pair/route.ts` | Next pair with optimized queries |
| `src/app/api/participate/[studyId]/next-quad/route.ts` | Next 4 items for quadruplet mode |
| `src/app/api/participate/[studyId]/vote/route.ts` | Pairwise vote submission with parallel DB fetches |
| `src/app/api/participate/[studyId]/vote-quad/route.ts` | Quadruplet vote submission (creates 3 comparisons) |
| `src/app/api/participate/[studyId]/category-thumbnails/route.ts` | Category thumbnails with rate limiting |
| `src/app/api/admin/auth/route.ts` | Admin login/logout with rate limiting |
| `src/app/api/admin/dashboard/route.ts` | Global admin dashboard data |
| `src/app/api/admin/studies/[studyId]/route.ts` | Study detail data |
| `src/app/api/admin/studies/[studyId]/export/route.ts` | Audit export endpoint |
| `src/app/api/admin/studies/[studyId]/ui-config/route.ts` | UI customization endpoint |
| `src/app/api/admin/activity-log/route.ts` | Activity log viewer with pagination |
| `src/app/api/studies/[studyId]/route.ts` | Public study info (cached) |
| `src/app/api/studies/[studyId]/rankings/route.ts` | Rankings with admin/participant access control |

### Scripts

| File | Purpose |
|------|---------|
| `prisma/seed.ts` | IzVRS study seeding |
| `scripts/upload-to-supabase.ts` | Image upload script |
| `scripts/cleanup-test-data.ts` | Wipe all sessions/comparisons, reset study |
| `scripts/fix-test-code.ts` | Mark test code and clean up test data |
| `scripts/migrate-to-webp.ts` | Migrate DB imageKey references from .png to .webp |
| `scripts/reset-elo-ratings.ts` | Reset all ELO ratings to baseline |
| `scripts/check-test-impact.ts` | Check if test sessions affected real ELO |
| `scripts/analyze-elo-damage.ts` | Analyze ELO damage from test sessions |
| `scripts/check-study-config.ts` | Verify study configuration |
| `scripts/simulate-next-pair.ts` | Simulate matchmaking for debugging |
| `scripts/add-test-code.ts` | Add test access code |
| `scripts/update-study-text.ts` | Update study text/description |
| `scripts/update-izvrs-settings.ts` | Update IzVRS study: allowContinuedVoting=false, uiShowCounts=true |
| `scripts/add-comparison-mode-column.ts` | Add comparisonMode column to Study table |
| `scripts/verify-data.ts` | Verify study data integrity (items, comparisons, sessions) |
| `scripts/update-artist-rankings.ts` | Update artist rankings and ELO boosts from Excel file |
| `scripts/cleanup-ocenjevalec1.ts` | Cleanup corrupted session, reset code for re-use |
| `scripts/fix-code-labels.ts` | Fix access code labels to match code numbers |
| `scripts/update-artist-rankings-izvrs.ts` | IzVRS-specific: Update ELO boosts from artist Excel (subcategory-aware) |

### Tests

| File | Tests | Purpose |
|------|-------|---------|
| `src/__tests__/elo.test.ts` | 29 | Formula correctness, zero-sum, adaptive K, artist boost |
| `src/__tests__/bradley-terry.test.ts` | 14 | Convergence, SE, probabilities, Elo scale mapping |
| `src/__tests__/statistics.test.ts` | 21 | Threshold, connectivity, circular triads, SE |
| `src/__tests__/matchmaking.test.ts` | 22 | Coverage guarantee, no duplicates, position bias, progress, tournament phase |

### Configuration

| File | Purpose |
|------|---------|
| `next.config.ts` | Image remote patterns (Supabase), server actions body limit |
| `vitest.config.ts` | Test config: node environment, `@` alias, v8 coverage |
| `prisma/schema.prisma` | Database schema |
| `.gitignore` | Ignores .env, sensitive txt files, node_modules, .next |

## Security Features

### Admin Route Protection (Middleware)

The middleware (`src/middleware.ts`) enforces admin authentication:
- **API routes** (`/api/admin/*` except `/api/admin/auth`): returns 401 JSON response
- **Page routes** (`/admin/*` except `/admin/login`): redirects to `/admin/login`
- Checks `Authorization: Bearer <ADMIN_SECRET>` header OR `sciblind-admin-token` cookie

### Rate Limiting

In-memory sliding window with auto-cleanup (every 5 min):

| Endpoint | Limit | Window | Identifier |
|----------|-------|--------|------------|
| Auth (login) | 5 attempts | 1 min | IP address |
| Voting | 60 votes | 1 min | Session token |
| Next pair | 120 requests | 1 min | Session token |
| General (thumbnails) | 100 requests | 1 min | IP address |

### Input Validation

- CUID format validation for all IDs (`/^c[a-z0-9]{24}$/`)
- Session token format validation (64 hex chars)
- Access code format validation (alphanumeric + hyphens, max 50)
- Response time bounds checking (0-600000ms)
- Vote body structural validation (winner must be one of compared items, etc.)

### Security Headers (middleware)

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (production only)
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (API routes)
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`

### Fraud Detection

- Response time < 500ms flagged as "too_fast"
- Response time > 5min flagged as "too_slow"
- Test sessions flagged as "test_session"
- Session-level flagging with reasons
- Full audit trail for all comparisons
- Activity log tracks all auth attempts, votes, and admin actions

## Deployment

### Vercel Environment Variables

```
DATABASE_URL=postgresql://postgres.rdsozrebfjjoknqonvbk:Sc%2EAI%2Eentist%2198@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
NEXTAUTH_SECRET=e5c5tUa1IQFMMbDor8QibeJuX4ufd9wABrUtjaPYzm8
NEXTAUTH_URL=https://blind.scaientist.eu
NEXT_PUBLIC_APP_URL=https://blind.scaientist.eu
IP_SALT=d34945fe5fe5387f8f5e074597037676dbd2df398d5507021ee52331c41c4d17
ADMIN_SECRET=<configured in Vercel — different from local .env for security>
```

**Note**: The production `ADMIN_SECRET` is set directly in Vercel environment variables and differs from the local `.env` file. Use the admin dashboard UI at `/admin` to manage study settings on production.

### Domain Setup

Domain: `blind.scaientist.eu`
DNS: CNAME -> cname.vercel-dns.com

### Image Storage

Images stored in Supabase Storage bucket `izvrs-images`.
- **Format**: WebP (compressed from original PNG, same filenames with .webp extension)
- Database field: `imageKey` (e.g., "izvrs/3-razredi/1.webp")
- Public URL format: `https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images/{category}/{id}.webp`
- The voting page builds URLs from `imageKey` automatically
- Migration script: `npx tsx scripts/migrate-to-webp.ts` (updates DB records from .png to .webp)

### Database Connection

- **Port 6543** (transaction pooler via PgBouncer): for all app queries (used in DATABASE_URL)
- **Port 5432** (session pooler): for schema changes / migrations only
- **Password**: `Sc.AI.entist!98` (URL-encoded: `Sc%2EAI%2Eentist%2198`)
- **Host**: `aws-1-eu-west-1.pooler.supabase.com`
- **Project ref**: `rdsozrebfjjoknqonvbk`

## Development Commands

```bash
npm run dev              # Start dev server (Turbopack)
npm run build            # Production build
npm run test             # Run all tests (vitest)
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage (v8)
npm run db:push          # Push schema to database (use port 5432 for migrations)
npm run db:seed          # Seed IzVRS study
npm run db:generate      # Generate Prisma client
npx tsx scripts/cleanup-test-data.ts  # Reset study to fresh state
npx tsx scripts/fix-test-code.ts      # Fix test code configuration
npx tsx scripts/migrate-to-webp.ts    # Migrate DB imageKeys from .png to .webp
npx tsx scripts/reset-elo-ratings.ts  # Reset ELO ratings to baseline + artist boost
npx tsx scripts/check-study-config.ts # Verify study configuration
npx tsx scripts/simulate-next-pair.ts # Debug matchmaking
```

### Database Migration Note
For schema changes, use port 5432 (session pooler) instead of 6543 (transaction pooler):
```bash
DATABASE_URL="postgresql://postgres.rdsozrebfjjoknqonvbk:Sc.AI.entist!98@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" npx prisma db push
```

### Build Verification Checklist

Before pushing changes:
1. `npx tsc --noEmit` (or let `npm run build` catch TypeScript errors)
2. `npm test` — all 80 tests must pass
3. `npm run build` — production build must succeed
4. `git push` — Vercel auto-deploys from main branch

## UI/UX Design

### MKBHD-Inspired Voting Interface

The voting page (`src/app/study/[studyId]/vote/page.tsx`) uses a design inspired by MKBHD's blind camera test:

- **Dark theme**: slate-900 background with white/slate-300 text
- **Side-by-side images** (desktop): two columns with gap
- **Stacked images** (mobile): single column, tap to select
- **Vote animation**: thumbs-up icon with scale-up effect (400ms)
- **Progress bar**: milestone bar with dots at 25/50/75/100% + always-visible `X / Y` counter
- **Image transitions**: opacity-based fade (no flash of empty content)
- **Category selection**: thumbnail grid with skeleton shimmer while loading
- **Checkpoint interstitials**: full-screen pause at 25/50/75/100% with circular SVG progress ring, explanation of why the checkpoint exists, and Continue button. Images preloaded during checkpoint via `pendingPairData` state.

### Checkpoint Interstitials (v4)

At 25%, 50%, 75%, and 100% of target comparisons per category, voting pauses with a full-screen checkpoint screen:

- **Circular SVG progress ring** showing percentage completed
- **Title + body text** explaining why the checkpoint exists (scientific threshold explanation)
- **Completed / target counter** (e.g., "12 / 49")
- **Continue button** to resume voting
- **Bilingual** (Slovenian + English) checkpoint messages
- Next pair is **preloaded in background** during checkpoint display (`pendingPairData` state)
- When Continue is clicked, the preloaded pair displays **instantly** (no loading delay)
- View state machine: `loading → categories → voting ↔ checkpoint → categoryDone → complete`

### Study Settings (per study, admin panel)

Configurable via admin dashboard "Study Settings" panel or API (`PATCH /api/admin/studies/[studyId]/ui-config`):

| Field | Options | Default | Category |
|-------|---------|---------|----------|
| `uiThemeColor` | Any hex color (#RRGGBB) | - | UI |
| `uiLogoPosition` | `top-center`, `top-left`, `hidden` | `top-center` | UI |
| `uiProgressStyle` | `dots`, `bar`, `hidden` | `dots` | UI |
| `uiShowCounts` | `true`/`false` | `false` | UI |
| `uiVoteAnimation` | `thumbs-up`, `checkmark`, `border-only`, `none` | `thumbs-up` | UI |
| `uiCategoryStyle` | `gallery`, `list`, `cards` | `gallery` | UI |
| `allowContinuedVoting` | `true`/`false` | `true` | Behavior |

**Note**: When `allowContinuedVoting` is `false`, voting stops once the scientific threshold is met per category. The IzVRS study has this set to `false`.

### Category Thumbnails (Gallery Style)

- Fetched during page init in parallel with study data
- Shows 6 thumbnail images per category in a 3x2 grid
- Skeleton shimmer (pulsing slate-700 squares) displayed until ALL images loaded
- Fade-in transition (`transition-opacity duration-300`) once all thumbnails ready
- Tracks `loadedCount` state in `ThumbnailGrid` component

## Scientific Hardening (sciblind-v2, 2026-02-05)

The platform has been comprehensively hardened for scientific defensibility. All algorithms are versioned (`sciblind-v2`) and every comparison record stores its algorithm version.

### ELO Rating System
- Standard formula: `E = 1 / (1 + 10^((R_opponent - R_self) / 400))`
- Zero-sum updates (winner's gain = loser's loss)
- **K-factor**: 32 (configurable per study)
- **Adaptive K-factor** (optional): K decreases as items accumulate games for stable late-stage ratings
  - Formula: `effectiveK = baseK * max(1, 32 / min(gamesA, gamesB))`
  - Enable via `Study.adaptiveKFactor = true`
- Artist boost correctly applied as initial rating adjustment
- **Standard error**: SE ~ 400 / (sqrt(n) * ln(10)), returned per item in rankings API

#### K-Factor Explained (K=32)
The K-factor (32 by default) determines the **maximum points that can be transferred** in a single comparison:

- **Unexpected upset** (low-rated beats high-rated): ~28 points transferred
- **Slight upset**: ~20 points transferred
- **Expected outcome** (higher-rated wins): ~4-8 points transferred
- **Near-equal ratings**: ~16 points transferred

**Example scenarios with K=32**:
| Scenario | Winner ELO | Loser ELO | Points Transferred |
|----------|------------|-----------|-------------------|
| Huge upset | 1400 | 1800 | ~28 |
| Small upset | 1450 | 1550 | ~22 |
| Expected | 1600 | 1500 | ~14 |
| Very expected | 1700 | 1400 | ~4 |

**Why K=32?**
- Standard in competitive ranking systems (chess, FIFA)
- Balances responsiveness (reacts to new data) vs stability (doesn't overreact)
- Higher K = more volatile ratings (faster adaptation, less stable)
- Lower K = more stable ratings (slower to reflect skill changes)

#### Artist ELO Boost (Independent of Voting)
The artist boost is a **pre-voting initial adjustment**, completely independent of:
- Number of reviewers
- Number of comparisons
- K-factor
- Any voting activity

**Formula**: `initialELO = 1500 + boost`
- Where boost = `200 * (1 - (rank - 1) / (totalInSubcategory - 1))`
- Rank 1 (best in subcategory): +200 → starts at 1700
- Rank N (worst in subcategory): 0 → starts at 1500

The boost gives artist-preferred items a "head start" but voting can override it.
After many votes, the ELO will converge toward the true ranking regardless of initial boost.

### Bradley-Terry Model (New in v2)
- MLE estimation via MM (Minorization-Maximization) algorithm
- Converges to true maximum likelihood abilities
- **Standard errors** from Fisher information matrix
- Abilities on log-scale (normalized: geometric mean = 1)
- Conversion to Elo scale: `EloScale = 1500 + ability * (400 / ln(10))`
- Activate via `?bt=true` query param on rankings API, or set `Study.rankingMethod = BRADLEY_TERRY`
- File: `src/lib/ranking/bradley-terry.ts`

### Matchmaking Algorithm (Rewritten + Enhanced)

**Two-Phase Algorithm with Coverage Guarantee + Streak Limits:**

#### Phase 1 — COVERAGE (unseen items exist)
- **Priority**: Items with 0 session appearances are paired FIRST
- **Strategy**: Pair two unseen items together (covers 2 items per comparison)
- **Fallback**: Pair unseen item with low-count seen item
- **Guarantee**: Session CANNOT end until every item has been shown at least once
- Among valid pairs, prefers lower global comparisonCount and similar ELO
- **Streak limit**: Items appearing 2+ times consecutively are excluded (unseen items exempt)

#### Phase 2 — DEPTH (all items seen at least once)
- **Priority**: Under-compared items with similar ELO for ranking precision
- **Variety penalty**: Recently shown items penalized (50/recency, window of 3)
- **Session fairness**: Items shown less in THIS session preferred (weight 5)
- **Pair exposure**: Pairs compared more times get penalized (weight 20)
- **Hard streak limit**: Items in last 2 consecutive comparisons excluded
- **Full O(n^2) search** for sets <=100 items
- **Fallback**: Relaxes streak limit if no valid pairs found

#### Coverage Enforcement (API level)
- `hasFullCoverage()` check in next-pair API
- Category completion requires BOTH: target comparisons reached AND full coverage
- If target reached but coverage missing, session continues with extended progress bar
- Progress bar never shows >99% until both conditions met

### Quadruplet Mode (New in v5)

**Purpose**: Reduce voting time while maintaining statistical power. User sees 4 items, picks 1 best.

**How it works**:
- 4 items displayed in 2×2 grid
- User selects the single best item
- Generates 3 pairwise wins: winner beats each of the 3 losers
- ELO updated for each pairing individually (winner vs loser1, winner vs loser2, winner vs loser3)
- No transitivity assumption between losers (they don't play each other)

**Study configuration**:
- `Study.comparisonMode`: `"pair"` (default) or `"quad"`
- Per-study setting, stored in database

**API endpoints**:
- `GET /api/participate/[studyId]/next-quad` — returns 4 items to compare
- `POST /api/participate/[studyId]/vote-quad` — records selection, creates 3 comparison records

**Target calculation**:
```typescript
function calculateRecommendedQuadComparisons(itemCount, reviewerCount = 5) {
  const coverageMinimum = Math.ceil(itemCount / 4);  // See every item once
  const pairwiseTarget = Math.ceil((itemCount * 10) / reviewerCount);
  const statisticalTarget = Math.ceil(pairwiseTarget / 2.5);  // Each quad ≈ 2.5 pairwise votes
  return Math.min(Math.max(coverageMinimum, statisticalTarget), Math.ceil(itemCount / 2));
}
```

**Time savings**: ~4× faster voting (25 quads vs 70 pairs for 49 items)

**Algorithm version**: `sciblind-v2-quad` stored in comparison records

### Tournament Phase (Two-Phase Voting - New in v5.2)

**Purpose**: Seamlessly extend voting to produce a clear personal top 4 per category, without visible phase transitions to the reviewer.

**How it works**:
1. **Phase 1 (Coverage)**: Normal quad voting until target is reached and all items seen
2. **Phase 2 (Tournament)**: 3-5 additional quads using ONLY items that have won at least once
3. **Transition is invisible**: Progress bar continues smoothly, no "phase complete" message

**Implementation**:
```typescript
// Calculate extra tournament quads needed
function calculateTournamentQuads(winnerCount: number): number {
  if (winnerCount <= 4) return 0;  // Not enough winners for tournament
  const estimated = Math.ceil((winnerCount - 4) / 2);
  return Math.min(5, Math.max(3, estimated));  // 3-5 extra quads
}

// Select quad from winners only
function selectNextQuadWinnersOnly(items: Item[], sessionComparisons: Comparison[]): MatchQuad | null {
  const winnerIds = getSessionWinnerIds(sessionComparisons);
  const winnerItems = items.filter(item => winnerIds.has(item.id));
  if (winnerItems.length < 4) return null;
  return selectNextQuad(winnerItems, sessionComparisons);
}
```

**Extended target calculation**:
```typescript
const tournamentQuads = calculateTournamentQuads(winnerIds.size);
const extendedTarget = targetQuads + tournamentQuads;
// Category complete when: completedQuads >= extendedTarget AND hasFullCoverage()
```

**Time impact**: ~3-5 extra quads per category × ~5-10 seconds = 15-50 seconds extra per category (negligible)

**Legacy pairwise handling**: If a session has existing pairwise comparisons before switching to quad mode, they count toward category completion. The quad count is calculated as `floor(comparisons/3)`.

**Coverage enforcement** (CRITICAL): Category completion ALWAYS requires full coverage, regardless of comparison count. This was a bug fix in v5.1 — previously, categories could complete without showing all items if raw comparison count met the target.

### No duplicate pairs
- Set-based tracking with sorted keys

### Position bias correction
- Active balancing of left/right placement per item

### Statistical Power
- **Coverage minimum**: N comparisons per reviewer per category (each item appears ~2x)
- **Statistical target**: `(itemCount * 5) / reviewerCount` comparisons
- **Effective target**: `max(coverageMinimum, statisticalTarget)`
- **Upper bound**: max(75, itemCount) to prevent fatigue while guaranteeing coverage
- **IzVRS targets**: 3. razredi = 49, 4. razredi = 29, 5. razredi = 50 comparisons/reviewer

### Publishable Threshold System (New in v2)

Three conditions must ALL be met for results to be considered publishable:

1. **Min exposures per item** (default 10): Every item must have at least M valid comparisons
2. **Min total comparisons** (default 10 x itemCount): Sufficient data volume
3. **Graph connectivity**: All items reachable from any other in the comparison graph (BFS check)

**Data status levels**:
- `insufficient` — threshold not met, results unreliable
- `publishable` — threshold just met, results defensible
- `confirmation` — >1.5x threshold, high confidence

**Configurable per study**: `Study.minExposuresPerItem`, `Study.minTotalComparisons`

### Graph Connectivity Analysis (New in v2)
- BFS on comparison graph (items = nodes, comparisons = edges)
- Reports: `connected`, `componentCount`, `componentSizes`, `isolatedItems`
- Disconnected graph -> rankings not comparable across components

### Non-Transitivity Detection (New in v2)
- Circular triad detection: A>B>C>A cycles
- `transitivityIndex`: 1 - (cycles / total triads), higher = more transitive
- Computed for <=100 items (O(n^3)), returns -1 for larger sets
- Low transitivity may indicate unclear preference ordering

### Rankings API (Enhanced)
Returns per item: `ratingStdError`, BT abilities (optional), confidence level
Returns per study: `dataStatus`, `isPublishable`, `publishableThreshold` details,
  `graphConnected`, `componentCount`, `circularTriadCount`, `transitivityIndex`, `algoVersion`

### Audit Export API
- Endpoint: `GET /api/admin/studies/[studyId]/export`
- Returns: study config, all items, all comparisons, session metadata
- Filterable by category, includes/excludes test data
- Algorithm version stored per comparison for reproducibility

### Threshold-Aware UI
- **Checkpoint interstitials** at 25/50/75/100% of target with full-screen pause, progress ring, and explanation
- When category completes: shows threshold status message
- If `allowContinuedVoting=true` and threshold NOT met: "Your comparisons are valuable for reliability" + continue option
- If `allowContinuedVoting=false` (IzVRS): voting stops at threshold, no continue option
- If threshold met: "Results are sufficiently reliable" + proceed to next category
- Bilingual (sl/en) translations for all checkpoint and completion messages

### Side-by-Side Rankings Display (New in v5.2)

**Purpose**: Show reviewers both their personal top 4 AND the overall study top 4 per category, side by side.

**When displayed**:
1. **After category completion**: Automatically shown in the "category done" screen
2. **Via ZAKLJUČENO button**: Click on completed category to view rankings modal

**Component**: `RankingsComparison`
```typescript
function RankingsComparison({
  categoryName,
  personalItems,  // Based on this reviewer's votes (top 10)
  globalItems,    // Based on overall study ELO rankings (top 10)
  themeColor,
  t,              // Translations
}) {
  const [expanded, setExpanded] = useState(false);
  const displayCount = expanded ? 10 : 4;
  // Displays:
  // - Left column: "Vaši izbori" (Your picks) - top 4/10 from personal votes
  // - Right column: "Skupni" (Overall) - top 4/10 from global ELO
  // - Rank badges: Gold (1st), Silver (2nd), Bronze (3rd), Theme color (4th+)
  // - "Show more" / "Show less" toggle button
}
```

**Simplified Display** (v5.5):
- Always shows top 4 per column (no expansion)
- Labels updated: "Vaši izbori" (Your picks), "Skupni rezultati" (Overall results)
- ZAKLJUČENO button fixed: No longer shows duplicate text when checkmark already visible
- Safe area padding added for notched devices (iOS/Android)

**Data sources**:
- **Personal rankings**: Derived from session comparisons (items that won the most in this session)
- **Global rankings**: Fetched from `/api/studies/[studyId]/rankings` (ELO-based study-wide rankings)

**API enhancement**: Rankings API now includes `imageKey` for thumbnail display

### Automated Tests
- **86 tests** across 4 test suites (Vitest)
- `elo.test.ts` — 29 tests: formula correctness, zero-sum, adaptive K, artist boost
- `bradley-terry.test.ts` — 14 tests: convergence, SE, probabilities, Elo scale mapping
- `statistics.test.ts` — 21 tests: threshold, connectivity, circular triads, SE
- `matchmaking.test.ts` — 22 tests: coverage guarantee, no duplicates, position bias, progress, tournament phase

### Scientific Reliability Audit (v5.3)

**Randomization Quality**:
- Fisher-Yates shuffle with `Math.random()` for position randomization
- **Scientific acceptability**: `Math.random()` provides sufficient entropy for presentation order randomization (not cryptographically sensitive)
- Position bias correction: Active balancing of left/right placement per item
- Streak limits: Items cannot appear more than 2 consecutive times (prevents fatigue bias)

**ELO System Integrity**:
- Standard ELO formula with zero-sum property (winner's gain = loser's loss)
- K-factor of 32 (configurable) balances responsiveness vs stability
- Adaptive K-factor option for faster early convergence
- Artist boost applied as initial rating adjustment, not affecting voting dynamics

**Coverage Guarantee (CRITICAL)**:
- Two-phase algorithm ensures 100% item coverage before category completion
- `hasFullCoverage()` check at API level prevents completion without full coverage
- Minimum target = itemCount (each item appears ~2x on average)
- Progress bar never shows >99% until coverage + target both achieved

**Position Bias Mitigation**:
```typescript
// Bias correction in pair selection
const aLeftBias = itemA.leftCount - itemA.rightCount;
const bLeftBias = itemB.leftCount - itemB.rightCount;
// Place the item with fewer left appearances on left
if (aLeftBias < bLeftBias) { leftItem = itemA; rightItem = itemB; }
else if (bLeftBias < aLeftBias) { leftItem = itemB; rightItem = itemA; }
else { /* Random 50/50 */ }
```

**Quad Mode Scientific Validity**:
- Winner vs each loser = 3 independent pairwise comparisons
- No transitivity assumed between losers (conservative approach)
- ELO updated for each pairing individually
- `sciblind-v2-quad` algorithm version stored for reproducibility

**Fraud Detection**:
- Response time < 500ms flagged as "too_fast" (potential bot)
- Response time > 300s flagged as "too_slow" (session abandonment)
- Test sessions excluded from ELO calculations
- Full audit trail with algorithm version per comparison

## Activity Logging

All portal activity is logged to the `ActivityLog` table (immutable, append-only):

**Actions tracked**:
- Session lifecycle: `SESSION_CREATED`, `SESSION_COMPLETED`, `SESSION_RESUMED`
- Voting: `VOTE_CAST`, `VOTE_FLAGGED`
- Categories: `CATEGORY_SELECTED`, `CATEGORY_COMPLETED`
- Auth: `AUTH_SUCCESS`, `AUTH_FAILURE`, `AUTH_RATE_LIMITED`
- Admin: `STUDY_CREATED`, `STUDY_UPDATED`, `ITEMS_UPLOADED`, `RANKINGS_VIEWED`, `EXPORT_DOWNLOADED`
- System: `ELO_RESET`, `SCHEMA_MIGRATED`

**Usage**:
```typescript
// Fire-and-forget (default — never blocks request)
logActivity('VOTE_CAST', { studyId, sessionId, metadata: { ... } });

// Synchronous (for audit-critical events)
await logActivitySync('AUTH_FAILURE', { studyId, ipHash, detail: 'Invalid code' });
```

**Admin viewer**: `GET /api/admin/activity-log?studyId=...&action=...&limit=100&offset=0`

## Git History (chronological)

| Commit | Description |
|--------|-------------|
| `64dfcdf` | Initial commit: SciBLIND MVP scaffold |
| `407dc3d` | Implement IzVRS study with full voting system |
| `01d41c4` | Scientific hardening v2 — Bradley-Terry, thresholds, diagnostics, tests |
| `ff6d92c` | Activity logging, image preloading, ELO reset & admin log viewer |
| `bb095e3` | MKBHD-inspired UI/UX overhaul for voting experience |
| `1cf69ce` | Admin auth, rankings access control, and rate limiting |
| `4ecea9a` | Pipeline vote->prefetch->preload for near-instant pair transitions |
| `1ddfffc` | Fire-and-forget voting, skeleton thumbnails, smooth transitions |
| `566854e` | Comprehensive CLAUDE.md update (v3) |
| `8a725c9` | Full-screen checkpoint interstitials, progress bar with counter |
| `64a8ecc` | Add allowContinuedVoting to study config API |
| `2fc1e44` | Add allowContinuedVoting toggle to admin Study Settings panel |
| `8b359c9` | Quadruplet voting mode — 4 items, pick best 1, generates 3 pairwise wins |
| `4d83c60` | Fix coverage enforcement — categories require full coverage before completion |
| `3be0a48` | Fix TypeScript error in update-artist-rankings script |
| `96714aa` | Tournament phase + artist ELO boosts + side-by-side rankings (v5.2) |
| `0da329f` | Performance optimizations + scientific reliability audit (v5.3) |
| `3c8cb34` | Fix allowContinuedVoting enforcement + align pair/quad APIs (v5.4) |
| `pending` | Fix matchmaking duplicate quads + performance optimizations + UI fixes (v5.5) |

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

### Full Coverage Guarantee Fix (2026-02-05)
**BUG**: Not all images were being shown in comparisons. The old algorithm optimized
for ELO precision but had NO guarantee that every item would appear at least once.

**FIX** — Three-level coverage guarantee:
1. **Algorithm rewrite**: Two-phase matchmaking (coverage-first, then depth)
2. **Target increase**: Minimum comparisons = itemCount (not capped at 50)
3. **API enforcement**: Category cannot complete until `hasFullCoverage()` returns true

### WebP Image Migration (2026-02-05)
Migrated all images from PNG to compressed WebP format for faster loading:
- Same folder structure and filenames, only extension changed (.png -> .webp)
- Database `imageKey` fields updated (e.g., "izvrs/3-razredi/1.webp")
- Seed script updated for new studies
- Migration script: `npx tsx scripts/migrate-to-webp.ts`

### Quad Mode Coverage Bug Fix (2026-02-06)
**BUG**: In quad mode, categories could complete without showing all items. The code had a fallback condition `|| rawComparisons >= targetQuads` that bypassed the coverage check when raw pairwise comparison count met the target.

**FIX** (commit `4d83c60`):
- Removed the fallback condition that bypassed coverage check
- Category completion now ALWAYS requires `hasFullCoverage()` to return true
- Applied to all three places in `next-quad/route.ts`: category selection, voting completion, and "all categories complete" check

**Session cleanup**: The corrupted session from Ocenjevalec 90074 was cleaned up:
- Deleted 83 comparisons with incorrect coverage
- Reset ELO ratings to base values (1500 + artistEloBoost)
- Reset the access code so it can be used again
- Script: `scripts/cleanup-ocenjevalec1.ts`

**Code labels fix**: Access code labels were incorrectly set as "Ocenjevalec 1", "Ocenjevalec 2", etc. instead of matching the actual code numbers. Fixed to "Ocenjevalec 90074", "Ocenjevalec 25793", etc. for proper traceability.
- Script: `scripts/fix-code-labels.ts`

### Tournament Phase & Artist ELO Boosts (2026-02-06)

**Features added**:
1. **Tournament phase**: Seamless two-phase voting to produce clear top 4 per category
   - Phase 1: Normal coverage phase
   - Phase 2: 3-5 extra quads with winners only
   - Progress bar continues smoothly (no visible phase transition)

2. **Artist ELO boosts**: Applied from artist's Excel rankings
   - Source: `Seznam_slik_ocene_slikarka_ALL.xlsx`
   - Formula: `boost = 200 * (1 - (rank - 1) / (totalInSubcategory - 1))`
   - Rank 1 (best) = +200 boost → ELO 1700
   - Rank N (worst) = 0 boost → ELO 1500
   - Important: Subcategories (3a, 3b, 4a, 4b, 5a, 5b) ranked separately

3. **Side-by-side rankings**: Personal vs global top 4 displayed together
   - Shown after category completion
   - Accessible via ZAKLJUČENO button on category selection

**Files modified**:
- `src/lib/matchmaking/index.ts` - Added tournament functions
- `src/app/api/participate/[studyId]/next-quad/route.ts` - Tournament phase logic
- `src/app/api/studies/[studyId]/rankings/route.ts` - Added imageKey to response
- `src/app/study/[studyId]/vote/page.tsx` - RankingsComparison component, global rankings fetch, rankings modal
- `src/__tests__/matchmaking.test.ts` - Tournament phase unit tests (86 total tests)
- `scripts/update-artist-rankings-izvrs.ts` - IzVRS-specific artist boost script

### Checkpoint Interstitials & Progress Bar Overhaul (2026-02-05)
**Problem**: Motivational checkpoint toasts were tiny and barely visible. Progress bar didn't show counts. `allowContinuedVoting` couldn't be changed without direct DB access.

**Fix** (commits `8a725c9`, `64a8ecc`, `2fc1e44`):
- Replaced `CheckpointToast` with full-screen `CheckpointScreen` component
- Added `pendingPairData` state for preloading next pair during checkpoint display
- Replaced `ProgressDots` with `ProgressBar` that always shows `X / Y` counter + milestone dots
- Added `allowContinuedVoting` toggle to admin "Study Settings" panel
- Added `allowContinuedVoting` to PATCH `/api/admin/studies/[studyId]/ui-config` API
- IzVRS study configured with `allowContinuedVoting=false` (stops at scientific threshold)

### Performance Optimizations (2026-02-05)
**Problem**: 3-second load times, 1s lag after vote, thumbnail flash on category page.

**Round 1** (commit `4ecea9a`):
- Parallelized DB queries in vote API (`Promise.all`)
- Selective field queries in next-pair API
- Single `findMany` instead of N per-category queries
- Reduced animation from 700ms -> 500ms
- Vote + next-pair fetch overlapped during animation

**Round 2** (commit `1ddfffc`):
- **Fire-and-forget vote**: `fetch().catch(() => {})` — zero wait for vote confirmation
- Animation + next-pair fetch run truly in parallel (both fire on click)
- Animation reduced to 400ms
- Image transitions via `imagesReady` state + CSS opacity (no empty flash)
- Category thumbnails fetched during init (parallel with study data)
- `ThumbnailGrid` shows skeleton shimmer until ALL images loaded, then fades in
- Removed unused state/refs, moved image helpers outside React component
- Net reduction: -117 lines (304 removed, 187 added)

### allowContinuedVoting Enforcement Fix (2026-02-06)
**BUG**: The `allowContinuedVoting=false` setting was NOT enforced in next-quad API. Voting could continue indefinitely even when the study was configured to stop at the target.

**Root cause**: The next-quad API only checked coverage + target for completion, completely ignoring the `allowContinuedVoting` study setting.

**FIX** (commit `3c8cb34`):
1. **Category selection view**: `isComplete` now respects `allowContinuedVoting`
2. **Category done check**: `categoryDone` condition updated
3. **All categories complete check**: Per-category completion logic fixed

**Code change**:
```typescript
// BEFORE (bug): Always required coverage
const categoryDone = completedQuads >= fullTarget && coverageAchieved;

// AFTER (fixed): Respects allowContinuedVoting setting
const categoryDone = study.allowContinuedVoting
  ? (completedQuads >= fullTarget && coverageAchieved)  // Need both
  : (completedQuads >= fullTarget);  // Just target is enough
```

**API alignment** (next-quad now matches next-pair):
- Added `isPublishableThreshold` check for category completion
- Returns `thresholdMet`, `dataStatus`, `allowContinuedVoting` in response
- Added activity logging for `SESSION_COMPLETED` and `CATEGORY_COMPLETED`
- Session query now selects `minExposuresPerItem`, `minTotalComparisons`

### Matchmaking Duplicate Quads Fix (2026-02-06)
**BUG**: The first and second quads would show the same 4 images in different positions. This was a critical bug that made early voting essentially worthless.

**Root cause**: Architectural mismatch between pairwise and quad voting. The original `selectNextQuad()` only tracked individual item appearances, NOT which combinations of 4 had been shown together. When `sessionComparisons` was empty, all items had identical scores, causing deterministic selection of the same 4 items every time.

**FIX**:
1. **Quad combination tracking**: New `getQuadItemIds()` function reconstructs which quad combinations were shown by grouping comparisons in threes
2. **Duplicate detection**: New `isQuadAlreadyShown()` checks if candidate quad matches any previously shown combination
3. **Random tiebreaker**: Added `Math.random() * 0.001` to break ties when items have equal scores
4. **Retry logic**: If selected quad was already shown, shuffle and retry (up to 10 attempts)

**Code added** to `src/lib/matchmaking/index.ts`:
```typescript
// Reconstruct shown quad combinations from comparison records
function getQuadItemIds(sessionComparisons: Comparison[]): Set<string>[] {
  const quads: Set<string>[] = [];
  for (let i = 0; i < sessionComparisons.length; i += 3) {
    const quadItems = new Set<string>();
    for (let j = 0; j < 3 && i + j < sessionComparisons.length; j++) {
      const comp = sessionComparisons[i + j];
      quadItems.add(comp.itemAId);
      quadItems.add(comp.itemBId);
    }
    if (quadItems.size === 4) quads.push(quadItems);
  }
  return quads;
}

// Check if candidate quad matches any shown quad
function isQuadAlreadyShown(candidate: Set<string>, shownQuads: Set<string>[]): boolean {
  return shownQuads.some(shown =>
    shown.size === candidate.size && [...candidate].every(id => shown.has(id))
  );
}
```

**Performance impact**: Negligible. `getQuadItemIds()` is O(n) where n is comparisons count (~30-50 per session). `isQuadAlreadyShown()` is O(k) where k is shown quads (~10-15 per category).

**Session cleanup**: Ocenjevalec 90074's corrupted session (138 comparisons) was deleted and the access code reset for re-use.

## Next Steps

1. ✅ All completed items from v1-v5.2 (see "What's Implemented" table above)
2. ✅ Artist ELO boosts applied from Excel file
   - Script: `npx tsx scripts/update-artist-rankings-izvrs.ts --yes`
   - All 128 items updated with correct boosts (1500-1700 range)
   - Subcategory-aware: 3a, 3b, 4a, 4b, 5a, 5b ranked separately
3. ✅ Tournament phase implemented (seamless two-phase voting)
4. ✅ Side-by-side rankings display (personal vs global top 4)
5. ✅ ZAKLJUČENO button now clickable to show rankings modal
6. 🔄 Keycloak integration for admin auth (replaces ADMIN_SECRET)
7. 🔄 Traefik reverse proxy setup
8. Planned: PDF export with methodology

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
   - Replace `requireAdminAuth()` with JWT validation
   - Replace admin login page with Keycloak redirect
   - Keep function signatures compatible for smooth migration
   - The middleware already has notes for Keycloak transition

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
