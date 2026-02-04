# SciBLIND - Claude Context Document

> Last Updated: 2026-02-04

## Project Overview

SciBLIND is a scientifically rigorous platform for conducting blind pairwise comparisons and rankings. Inspired by MKBHD's smartphone camera test, it adds military-grade security to prevent manipulation and bias in voting studies.

**Purpose**: Enable researchers, creators, and organizations to run blind comparison studies (images or text) with proper statistical ranking and fraud prevention.

## Current Status: MVP Ready for Production

### What's Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | Complete | Category, AccessCode, ELO tracking, audit trail |
| Supabase Connection | Configured | PostgreSQL with schema deployed |
| ELO Ranking System | Complete | Artist boost (+200 to +20), tie-breaking |
| Matchmaking Algorithm | Complete | Position bias prevention, adaptive pair selection |
| Access Code Auth | Complete | SHA256 hashing, single-use enforcement |
| Voting API | Complete | Full audit trail, fraud detection |
| Rankings API | Complete | Confidence indicators, position bias stats |
| Participant UI | Complete | Slovenian translations, keyboard shortcuts |
| Seed Script | Complete | IzVRS study with 128 images |
| Logos | Complete | ScAIentist, IzVRS, Izvrstna logos |

### Pending

| Component | Status | Notes |
|-----------|--------|-------|
| Image Upload to Supabase | Pending | Script ready, needs execution |
| PDF Export | Planned | Methodology report generation |
| Admin Dashboard | Partial | UI exists, needs data integration |
| Vercel Deployment | Pending | Repo connected, needs env vars |

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
| `/api/studies/[studyId]` | GET | Get study details |
| `/api/studies/[studyId]/rankings` | GET | Get current rankings |

## Key Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Complete database schema |
| `prisma/seed.ts` | IzVRS study seeding |
| `src/lib/ranking/elo.ts` | ELO calculation + artist boost |
| `src/lib/matchmaking/index.ts` | Pair selection algorithm |
| `src/lib/auth/hash.ts` | Access code hashing |
| `src/app/study/[studyId]/page.tsx` | Entry page (code input) |
| `src/app/study/[studyId]/vote/page.tsx` | Voting interface |
| `scripts/upload-to-supabase.ts` | Image upload script |

## Deployment

### Vercel Environment Variables

```
DATABASE_URL=postgresql://postgres:Sc%2EAI%2Eentist%2198@db.rdsozrebfjjoknqonvbk.supabase.co:5432/postgres?pgbouncer=true
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
Upload with: `SUPABASE_ANON_KEY=xxx npx tsx scripts/upload-to-supabase.ts`

## Security Features

- Access codes hashed with SHA256
- Single-use enforcement at database level
- IP fingerprinting (salted hash)
- Response time fraud detection (<500ms flagged)
- Position bias tracking (50/50 verification)
- No rankings shown to participants

## Development Commands

```bash
npm run dev              # Start dev server
npm run db:push          # Push schema to database
npm run db:seed          # Seed IzVRS study
npx tsx scripts/upload-to-supabase.ts  # Upload images
```

## Participant URL

`https://blind.scaientist.eu/study/cml808mzc0000m104un333c69`

## Next Steps

1. ✅ Upload images to Supabase Storage
2. ✅ Deploy to Vercel
3. Configure domain DNS
4. Test full voting flow
5. Implement PDF export
6. Add admin dashboard data integration
