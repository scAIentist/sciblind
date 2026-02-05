# SciBLIND - Claude Context Document

> Last Updated: 2026-02-05 (v2 Scientific Hardening)

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
| ELO Ranking System | Complete | Artist boost (+200 to +20), tie-breaking, adaptive K-factor |
| Bradley-Terry Model | Complete | MLE estimation via MM algorithm, Fisher information SEs |
| Matchmaking Algorithm | Complete | Two-phase (coverage + depth), full coverage, streak limits, pair exposure |
| Statistical Diagnostics | Complete | Publishable threshold, graph connectivity, circular triads |
| Access Code Auth | Complete | SHA256 hashing, single-use + test mode support |
| Voting API | Complete | Full audit trail, fraud detection, rate limiting |
| Rankings API | Complete | SE, data status, threshold, connectivity, BT, algo version |
| Audit Export API | Complete | Full comparison log with metadata, JSON format |
| Participant UI | Complete | Mobile stacked layout, desktop side-by-side, Slovenian translations |
| Admin Dashboard | Complete | Real-time stats, rankings, session tracking |
| Security | Complete | Rate limiting, input validation, security headers |
| Images | Complete | Compressed WebP format, uploaded to Supabase Storage |
| Vercel Deployment | Complete | Auto-deploy from GitHub |
| Test Mode | Complete | Unlimited test code uses, no ELO impact |
| Automated Tests | Complete | 80 tests: Elo, BT, matchmaking, statistics (Vitest) |
| Algorithm Versioning | Complete | `algoVersion` stored with every comparison |

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
| Testing | Vitest | 4.x |
| Deployment | Vercel | - |

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
| `/api/admin/studies/[studyId]/export` | GET | Full audit export (JSON) with all comparisons |
| `/api/studies/[studyId]` | GET | Get study details |
| `/api/studies/[studyId]/rankings` | GET | Rankings with SE, BT, threshold, connectivity, triads |

## Key Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Complete database schema |
| `prisma/seed.ts` | IzVRS study seeding |
| `src/lib/ranking/elo.ts` | ELO calculation + artist boost + adaptive K |
| `src/lib/ranking/bradley-terry.ts` | Bradley-Terry MLE estimator (MM algorithm) |
| `src/lib/ranking/statistics.ts` | Threshold, connectivity, circular triads, SE |
| `src/lib/matchmaking/index.ts` | Pair selection (coverage + depth + streak limits) |
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
| `scripts/migrate-to-webp.ts` | Migrate DB imageKey references from .png to .webp |
| `src/app/api/admin/studies/[studyId]/export/route.ts` | Audit export endpoint |
| `src/__tests__/*.test.ts` | Automated tests (Elo, BT, matchmaking, statistics) |
| `vitest.config.ts` | Test configuration |
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
- **Format**: WebP (compressed from original PNG, same filenames with .webp extension)
- Database field: `imageKey` (e.g., "izvrs/3-razredi/1.webp")
- Public URL format: `https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images/{category}/{id}.webp`
- The voting page builds URLs from `imageKey` automatically
- Migration script: `npx tsx scripts/migrate-to-webp.ts` (updates DB records from .png to .webp)

## Development Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run test             # Run all tests (vitest)
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage
npm run db:push          # Push schema to database (use port 5432 for migrations)
npm run db:seed          # Seed IzVRS study
npx tsx scripts/cleanup-test-data.ts  # Reset study to fresh state
npx tsx scripts/fix-test-code.ts      # Fix test code configuration
npx tsx scripts/migrate-to-webp.ts    # Migrate DB imageKeys from .png to .webp
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

### Full Coverage Guarantee Fix (2026-02-05)
**BUG**: Not all images were being shown in comparisons. The old algorithm optimized
for ELO precision but had NO guarantee that every item would appear at least once.
With the old max of 50 comparisons per category and 49-50 items, some items were
systematically skipped.

**FIX** — Three-level coverage guarantee:
1. **Algorithm rewrite**: Two-phase matchmaking (coverage-first, then depth)
2. **Target increase**: Minimum comparisons = itemCount (not capped at 50)
3. **API enforcement**: Category cannot complete until `hasFullCoverage()` returns true

### WebP Image Migration (2026-02-05)
Migrated all images from PNG to compressed WebP format for faster loading:
- Same folder structure and filenames, only extension changed (.png → .webp)
- Database `imageKey` fields updated (e.g., "izvrs/3-razredi/1.webp")
- Seed script updated for new studies
- Migration script: `npx tsx scripts/migrate-to-webp.ts`

## Scientific Hardening (sciblind-v2, 2026-02-05)

The platform has been comprehensively hardened for scientific defensibility. All algorithms are versioned (`sciblind-v2`) and every comparison record stores its algorithm version.

### ELO Rating System ✅
- Standard formula: `E = 1 / (1 + 10^((R_opponent - R_self) / 400))`
- Zero-sum updates (winner's gain ≈ loser's loss)
- K-factor 32 (configurable per study)
- **Adaptive K-factor** (optional): K decreases as items accumulate games for stable late-stage ratings
  - Formula: `effectiveK = baseK × max(1, 32 / min(gamesA, gamesB))`
  - Enable via `Study.adaptiveKFactor = true`
- Artist boost correctly applied as initial rating adjustment
- **Standard error**: SE ≈ 400 / (√n × ln(10)), returned per item in rankings API

### Bradley-Terry Model ✅ (New)
- MLE estimation via MM (Minorization-Maximization) algorithm
- Converges to true maximum likelihood abilities
- **Standard errors** from Fisher information matrix
- Abilities on log-scale (normalized: geometric mean = 1)
- Conversion to Elo scale: `EloScale = 1500 + ability × (400 / ln(10))`
- Activate via `?bt=true` query param on rankings API, or set `Study.rankingMethod = BRADLEY_TERRY`
- File: `src/lib/ranking/bradley-terry.ts`

### Matchmaking Algorithm ✅ (Rewritten + Enhanced)

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
- **Full O(n²) search** for sets ≤100 items
- **Fallback**: Relaxes streak limit if no valid pairs found

#### Coverage Enforcement (API level)
- `hasFullCoverage()` check in next-pair API
- Category completion requires BOTH: target comparisons reached AND full coverage
- If target reached but coverage missing, session continues with extended progress bar
- Progress bar never shows >99% until both conditions met

### No duplicate pairs
- Set-based tracking with sorted keys

### Position bias correction
- Active balancing of left/right placement per item

### Statistical Power
- **Coverage minimum**: N comparisons per reviewer per category (each item appears ~2x)
- **Statistical target**: `(itemCount × 5) / reviewerCount` comparisons
- **Effective target**: `max(coverageMinimum, statisticalTarget)`
- **Upper bound**: max(75, itemCount) to prevent fatigue while guaranteeing coverage
- **IzVRS targets**: 3. razredi = 49, 4. razredi = 29, 5. razredi = 50 comparisons/reviewer

### Publishable Threshold System ✅ (New)

Three conditions must ALL be met for results to be considered publishable:

1. **Min exposures per item** (default 10): Every item must have at least M valid comparisons
2. **Min total comparisons** (default 10 × itemCount): Sufficient data volume
3. **Graph connectivity**: All items reachable from any other in the comparison graph (BFS check)

**Data status levels**:
- `insufficient` — threshold not met, results unreliable
- `publishable` — threshold just met, results defensible
- `confirmation` — >1.5× threshold, high confidence

**Configurable per study**: `Study.minExposuresPerItem`, `Study.minTotalComparisons`

### Graph Connectivity Analysis ✅ (New)
- BFS on comparison graph (items = nodes, comparisons = edges)
- Reports: `connected`, `componentCount`, `componentSizes`, `isolatedItems`
- Disconnected graph → rankings not comparable across components

### Non-Transitivity Detection ✅ (New)
- Circular triad detection: A>B>C>A cycles
- `transitivityIndex`: 1 - (cycles / total triads), higher = more transitive
- Computed for ≤100 items (O(n³)), returns -1 for larger sets
- Low transitivity may indicate unclear preference ordering

### Rankings API (Enhanced)
Returns per item: `ratingStdError`, BT abilities (optional), confidence level
Returns per study: `dataStatus`, `isPublishable`, `publishableThreshold` details,
  `graphConnected`, `componentCount`, `circularTriadCount`, `transitivityIndex`, `algoVersion`

### Audit Export API ✅ (New)
- Endpoint: `GET /api/admin/studies/[studyId]/export`
- Returns: study config, all items, all comparisons, session metadata
- Filterable by category, includes/excludes test data
- Algorithm version stored per comparison for reproducibility

### Threshold-Aware UI ✅ (New)
- When category completes: shows threshold status message
- If threshold NOT met: "Your comparisons are valuable for reliability" + continue option
- If threshold met: "Results are sufficiently reliable" + proceed to next category
- Bilingual (sl/en) translations

### Automated Tests ✅ (New)
- **80 tests** across 4 test suites (Vitest)
- `elo.test.ts` — 29 tests: formula correctness, zero-sum, adaptive K, artist boost
- `bradley-terry.test.ts` — 14 tests: convergence, SE, probabilities, Elo scale mapping
- `statistics.test.ts` — 21 tests: threshold, connectivity, circular triads, SE
- `matchmaking.test.ts` — 16 tests: coverage guarantee, no duplicates, position bias, progress

## Next Steps

1. ✅ Upload images to Supabase Storage
2. ✅ Deploy to Vercel
3. ✅ Mobile optimization
4. ✅ Security hardening (rate limiting, validation)
5. ✅ Admin dashboard with real data
6. ✅ Test mode for unlimited testing without ELO impact
7. ✅ Fix image display in voting page (vertical layout for landscape)
8. ✅ Algorithm verification (ELO + matchmaking)
9. ✅ Full coverage guarantee (all items shown to every reviewer)
10. ✅ WebP image migration (compressed for faster loading)
11. ✅ Scientific hardening v2 (BT, thresholds, connectivity, triads, adaptive K)
12. ✅ Automated test suite (80 tests)
13. ✅ Audit export API endpoint
14. ✅ Algorithm versioning
15. ✅ Threshold-aware UI messaging
16. 🔄 Keycloak integration for admin auth
17. 🔄 Traefik reverse proxy setup
18. ⏳ PDF export with methodology
19. ⏳ Push schema changes to production database

### Scientific Hardening v2 (2026-02-05)
Comprehensive scientific upgrade adding:
- Bradley-Terry MLE estimator with Fisher information standard errors
- Publishable threshold system (min exposures, total comparisons, graph connectivity)
- Circular triad (non-transitivity) detection
- Adaptive K-factor for stable late-stage ratings
- Hard streak limit in matchmaking (no item 3+ times in a row)
- Pair exposure awareness (prefer under-exposed pairs)
- Algorithm version tagging (`algoVersion: "sciblind-v2"` on every comparison)
- Enhanced rankings API with `dataQuality` block
- Full audit export endpoint (`/api/admin/studies/[studyId]/export`)
- Threshold-aware category completion UI with bilingual messaging
- 80 automated tests (Elo, BT, statistics, matchmaking)
- **Schema changes**: Run `npx prisma db push` after deployment to add new Study/Comparison fields

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
