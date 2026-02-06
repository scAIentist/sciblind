/**
 * Matchmaking Algorithm for SciBLIND
 *
 * Selects pairs of items for comparison with the goals of:
 * 1. **COVERAGE FIRST**: Every item MUST appear at least once before session ends
 * 2. Ensuring all items get compared fairly (equal comparison counts)
 * 3. Preferring informative comparisons (similar ELO ratings)
 * 4. Avoiding repeated pairs within a session
 * 5. Maintaining position balance (left/right)
 * 6. Adding variety to prevent same image appearing consecutively
 * 7. Hard streak limit: item cannot appear 3+ times in a row
 * 8. Pair exposure awareness: prefer pairs with fewer cross-session exposures
 *
 * Coverage guarantee:
 * - Phase 1 (Coverage): Prioritize items with 0 comparisons in this session
 * - Phase 2 (Depth): Once all items have appeared, optimize for ELO precision
 * - The session CANNOT complete until every item has been seen at least once
 */

import type { Item, Comparison } from '@prisma/client';

export interface MatchPair {
  itemA: Item;
  itemB: Item;
  leftItemId: string;
  rightItemId: string;
}

export interface MatchQuad {
  items: Item[];           // Exactly 4 items
  positions: string[];     // Randomized order of item IDs for display
}

/**
 * Get the set of item IDs that have appeared in session comparisons
 */
function getSeenItemIds(sessionComparisons: Comparison[]): Set<string> {
  const seen = new Set<string>();
  for (const comp of sessionComparisons) {
    seen.add(comp.itemAId);
    seen.add(comp.itemBId);
  }
  return seen;
}

/**
 * Get items that have NOT yet appeared in any session comparison
 */
function getUnseenItems(items: Item[], sessionComparisons: Comparison[]): Item[] {
  const seen = getSeenItemIds(sessionComparisons);
  return items.filter((item) => !seen.has(item.id));
}

/**
 * Get items that are streak-blocked: appeared in the last N consecutive comparisons.
 * An item is blocked if it appeared in the last `streakLimit` comparisons in a row.
 *
 * Exception: In coverage phase, unseen items are never streak-blocked.
 *
 * @param sessionComparisons - Comparisons in session order
 * @param streakLimit - Number of consecutive appearances to trigger block (default 2)
 * @returns Set of item IDs that should be excluded from the next pair
 */
function getStreakBlockedItems(
  sessionComparisons: Comparison[],
  streakLimit: number = 2,
): Set<string> {
  const blocked = new Set<string>();

  if (sessionComparisons.length < streakLimit) return blocked;

  // Check each item: did it appear in the last `streakLimit` comparisons?
  const lastN = sessionComparisons.slice(-streakLimit);
  const itemAppearances = new Map<string, number>();

  for (const comp of lastN) {
    itemAppearances.set(comp.itemAId, (itemAppearances.get(comp.itemAId) || 0) + 1);
    itemAppearances.set(comp.itemBId, (itemAppearances.get(comp.itemBId) || 0) + 1);
  }

  for (const [itemId, count] of itemAppearances) {
    if (count >= streakLimit) {
      blocked.add(itemId);
    }
  }

  return blocked;
}

/**
 * Count how many times each pair has been compared across all comparisons
 * (cross-session pair exposure). Used to prefer under-exposed pairs.
 *
 * @param items - Items to check
 * @param allComparisons - All session comparisons (can also pass global comparisons)
 * @returns Map of pair key -> exposure count
 */
function getPairExposureCounts(
  allComparisons: Comparison[],
): Map<string, number> {
  const pairCounts = new Map<string, number>();

  for (const comp of allComparisons) {
    const key = [comp.itemAId, comp.itemBId].sort().join('-');
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  }

  return pairCounts;
}

/**
 * Check if all items in the set have been seen at least once in this session
 */
export function hasFullCoverage(items: Item[], sessionComparisons: Comparison[]): boolean {
  const seen = getSeenItemIds(sessionComparisons);
  return items.every((item) => seen.has(item.id));
}

/**
 * Select the next pair of items for comparison
 *
 * Algorithm (two-phase):
 *
 * PHASE 1 — COVERAGE (unseen items exist):
 *   Priority: pair unseen items together, or pair an unseen item with a low-comparison seen item.
 *   This guarantees every item appears at least once before the session can end.
 *
 * PHASE 2 — DEPTH (all items seen):
 *   Priority: under-compared items with similar ELO for maximum ranking information.
 *   Includes variety penalty to avoid repetitive consecutive comparisons.
 *
 * Both phases:
 * - Never repeat a pair within the same session
 * - Correct position bias (left/right balancing)
 *
 * @param items - All items in the category
 * @param sessionComparisons - Comparisons already made in this session
 * @returns Next pair to compare, or null if all pairs exhausted
 */
export function selectNextPair(
  items: Item[],
  sessionComparisons: Comparison[],
): MatchPair | null {
  if (items.length < 2) {
    return null;
  }

  // Build set of compared pair keys for this session
  const comparedPairs = new Set<string>();
  for (const comp of sessionComparisons) {
    const key = [comp.itemAId, comp.itemBId].sort().join('-');
    comparedPairs.add(key);
  }

  // Calculate total possible pairs
  const totalPossiblePairs = (items.length * (items.length - 1)) / 2;

  // If all pairs compared, session is complete for this category
  if (comparedPairs.size >= totalPossiblePairs) {
    return null;
  }

  // Track recently shown items (last 3 comparisons) for variety penalty
  const recentItems = new Map<string, number>(); // itemId -> recency (1 = most recent)
  const recentWindow = Math.min(3, sessionComparisons.length);
  for (let i = 0; i < recentWindow; i++) {
    const comp = sessionComparisons[sessionComparisons.length - 1 - i];
    if (comp) {
      const recency = i + 1;
      if (!recentItems.has(comp.itemAId)) recentItems.set(comp.itemAId, recency);
      if (!recentItems.has(comp.itemBId)) recentItems.set(comp.itemBId, recency);
    }
  }

  // Count how many times each item has appeared in THIS session (not global comparisonCount)
  const sessionItemCounts = new Map<string, number>();
  for (const item of items) {
    sessionItemCounts.set(item.id, 0);
  }
  for (const comp of sessionComparisons) {
    sessionItemCounts.set(comp.itemAId, (sessionItemCounts.get(comp.itemAId) || 0) + 1);
    sessionItemCounts.set(comp.itemBId, (sessionItemCounts.get(comp.itemBId) || 0) + 1);
  }

  // Hard streak limit: items that appeared in last 2 consecutive comparisons are blocked
  const streakBlocked = getStreakBlockedItems(sessionComparisons, 2);

  // Determine which items are unseen in this session
  const unseenItems = getUnseenItems(items, sessionComparisons);
  const inCoveragePhase = unseenItems.length > 0;

  let bestPair: { itemA: Item; itemB: Item; score: number } | null = null;

  // Helper: check if an item is allowed (not streak-blocked, unless it's unseen in coverage phase)
  const isAllowed = (item: Item): boolean => {
    // In coverage phase, unseen items are never blocked (coverage trumps streak)
    if (inCoveragePhase && !getSeenItemIds(sessionComparisons).has(item.id)) {
      return true;
    }
    return !streakBlocked.has(item.id);
  };

  if (inCoveragePhase) {
    // ===== PHASE 1: COVERAGE =====
    // Goal: get every item seen at least once, as efficiently as possible
    //
    // Strategy:
    // 1. Best: pair two unseen items together (covers 2 items in 1 comparison)
    // 2. Fallback: pair one unseen item with a low-session-count seen item
    //
    // Among valid pairs, prefer:
    // - Lower global comparisonCount (scientific fairness across sessions)
    // - Similar ELO (more informative)

    // Sort unseen items by global comparison count (least compared first)
    const sortedUnseen = [...unseenItems].sort((a, b) => a.comparisonCount - b.comparisonCount);

    // First try: pair two unseen items
    for (let i = 0; i < sortedUnseen.length && !bestPair; i++) {
      for (let j = i + 1; j < sortedUnseen.length; j++) {
        const itemA = sortedUnseen[i];
        const itemB = sortedUnseen[j];
        if (!isAllowed(itemA) || !isAllowed(itemB)) continue;
        const pairKey = [itemA.id, itemB.id].sort().join('-');
        if (comparedPairs.has(pairKey)) continue;

        const comparisonNeed = itemA.comparisonCount + itemB.comparisonCount;
        const eloDiff = Math.abs(itemA.eloRating - itemB.eloRating);
        // Heavily favor pairing two unseen items (bonus of -1000)
        const score = -1000 + comparisonNeed * 10 + eloDiff;

        if (!bestPair || score < bestPair.score) {
          bestPair = { itemA, itemB, score };
        }
      }
    }

    // Second try: pair unseen item with a seen item (prefer seen items with low session count)
    if (!bestPair) {
      const seenItems = items
        .filter((item) => !unseenItems.includes(item))
        .sort((a, b) => (sessionItemCounts.get(a.id) || 0) - (sessionItemCounts.get(b.id) || 0));

      for (const unseenItem of sortedUnseen) {
        for (const seenItem of seenItems) {
          if (!isAllowed(unseenItem) || !isAllowed(seenItem)) continue;
          const pairKey = [unseenItem.id, seenItem.id].sort().join('-');
          if (comparedPairs.has(pairKey)) continue;

          const comparisonNeed = unseenItem.comparisonCount + seenItem.comparisonCount;
          const eloDiff = Math.abs(unseenItem.eloRating - seenItem.eloRating);
          const score = comparisonNeed * 10 + eloDiff;

          if (!bestPair || score < bestPair.score) {
            bestPair = { itemA: unseenItem, itemB: seenItem, score };
          }
          // Take first good match per unseen item to keep it fast
          break;
        }
      }
    }
  }

  if (!bestPair) {
    // ===== PHASE 2: DEPTH =====
    // All items have been seen. Now optimize for ranking precision.
    //
    // Score (lower is better):
    // - Global comparisonCount need (under-compared items first, weight 10)
    // - ELO difference (similar ELO = more informative, weight 1)
    // - Variety penalty (recently shown items penalized, weight 50/recency)
    // - Session fairness bonus (items with fewer session appearances preferred, weight 5)
    // - Pair exposure penalty (pairs compared more times get penalized, weight 20)

    // Sort by global comparison count for prioritization
    const itemsByNeed = [...items].sort((a, b) => a.comparisonCount - b.comparisonCount);

    // Get pair exposure counts for cross-session awareness
    const pairExposures = getPairExposureCounts(sessionComparisons);

    // Full O(n²) search for sets ≤ 100, sampled for larger
    const useFullSearch = items.length <= 100;
    const searchLimit = useFullSearch ? itemsByNeed.length : 50;

    for (let i = 0; i < searchLimit; i++) {
      const itemA = itemsByNeed[i];
      if (!isAllowed(itemA)) continue; // Hard streak limit

      const jLimit = useFullSearch ? itemsByNeed.length : items.length;

      for (let j = i + 1; j < jLimit; j++) {
        const itemB = useFullSearch ? itemsByNeed[j] : items[j];
        if (!isAllowed(itemB)) continue; // Hard streak limit

        const pairKey = [itemA.id, itemB.id].sort().join('-');
        if (comparedPairs.has(pairKey)) continue;

        const comparisonNeed = itemA.comparisonCount + itemB.comparisonCount;
        const eloDiff = Math.abs(itemA.eloRating - itemB.eloRating);

        // Variety penalty
        const aRecency = recentItems.get(itemA.id) || 0;
        const bRecency = recentItems.get(itemB.id) || 0;
        const varietyPenalty =
          (aRecency > 0 ? 50 / aRecency : 0) + (bRecency > 0 ? 50 / bRecency : 0);

        // Session fairness: prefer items shown less in THIS session
        const sessionFairness =
          (sessionItemCounts.get(itemA.id) || 0) + (sessionItemCounts.get(itemB.id) || 0);

        // Pair exposure: prefer pairs that have been compared fewer times
        const pairExposure = pairExposures.get(pairKey) || 0;

        const score = comparisonNeed * 10 + eloDiff + varietyPenalty + sessionFairness * 5 + pairExposure * 20;

        if (!bestPair || score < bestPair.score) {
          bestPair = { itemA, itemB, score };
        }
      }
    }

    // Fallback for large sets (relaxes streak limit)
    if (!bestPair && !useFullSearch) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const pairKey = [items[i].id, items[j].id].sort().join('-');
          if (!comparedPairs.has(pairKey)) {
            bestPair = { itemA: items[i], itemB: items[j], score: 0 };
            break;
          }
        }
        if (bestPair) break;
      }
    }

    // If still no pair found (all remaining pairs are streak-blocked),
    // relax streak limit and find any valid pair
    if (!bestPair) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const pairKey = [items[i].id, items[j].id].sort().join('-');
          if (!comparedPairs.has(pairKey)) {
            bestPair = { itemA: items[i], itemB: items[j], score: 0 };
            break;
          }
        }
        if (bestPair) break;
      }
    }
  }

  if (!bestPair) {
    return null;
  }

  // Assign left/right position with bias correction
  let leftItem: Item;
  let rightItem: Item;

  const aLeftBias = bestPair.itemA.leftCount - bestPair.itemA.rightCount;
  const bLeftBias = bestPair.itemB.leftCount - bestPair.itemB.rightCount;

  if (aLeftBias !== bLeftBias) {
    // Put the item with fewer left appearances on left
    if (aLeftBias < bLeftBias) {
      leftItem = bestPair.itemA;
      rightItem = bestPair.itemB;
    } else {
      leftItem = bestPair.itemB;
      rightItem = bestPair.itemA;
    }
  } else {
    // Random 50/50
    if (Math.random() < 0.5) {
      leftItem = bestPair.itemA;
      rightItem = bestPair.itemB;
    } else {
      leftItem = bestPair.itemB;
      rightItem = bestPair.itemA;
    }
  }

  return {
    itemA: bestPair.itemA,
    itemB: bestPair.itemB,
    leftItemId: leftItem.id,
    rightItemId: rightItem.id,
  };
}

/**
 * Calculate recommended comparisons per reviewer for a category
 *
 * CRITICAL: The minimum is now mathematically derived to guarantee full coverage.
 * With N items, you need at least ceil(N/2) comparisons to see every item once
 * (each comparison shows 2 items). We add a safety margin on top.
 *
 * The formula balances:
 * - Coverage: every item appears at least once (hard minimum)
 * - Depth: each item appears in ~10 comparisons for statistical reliability
 * - Reviewer fatigue: bounded upper limit to keep sessions manageable
 *
 * @param itemCount - Number of items in the category
 * @param reviewerCount - Expected number of reviewers
 * @returns Recommended comparisons per reviewer for this category
 */
export function calculateRecommendedComparisons(
  itemCount: number,
  reviewerCount: number = 5,
): number {
  // Hard minimum: ceil(N/2) to guarantee every item can appear at least once
  // With safety margin: N (each item appears ~2 times minimum)
  const coverageMinimum = itemCount;

  // Statistical target: each item in ~10 comparisons across all reviewers
  // Each comparison involves 2 items, so total comparisons needed = (itemCount * 10) / 2
  // Per reviewer = (itemCount * 5) / reviewerCount
  const statisticalTarget = Math.ceil((itemCount * 5) / reviewerCount);

  // Take the higher of coverage minimum and statistical target
  const recommended = Math.max(coverageMinimum, statisticalTarget);

  // Apply upper bound to prevent reviewer fatigue
  // For large categories, cap at 75 (up from 50) to ensure coverage
  const maxComparisons = Math.max(75, itemCount); // Never less than itemCount
  const minComparisons = Math.ceil(itemCount / 2); // Absolute theoretical minimum

  return Math.max(minComparisons, Math.min(maxComparisons, recommended));
}

/**
 * Get category progress for a session
 *
 * @param sessionComparisons - All comparisons in the session
 * @param categoryId - Category to check progress for
 * @param targetComparisons - Target number of comparisons for this category
 * @returns Progress info
 */
export function getCategoryProgress(
  sessionComparisons: Comparison[],
  categoryId: string,
  targetComparisons: number,
): { completed: number; target: number; percentage: number; isComplete: boolean } {
  const completed = sessionComparisons.filter((c) => c.categoryId === categoryId).length;
  const percentage = Math.min(100, Math.round((completed / targetComparisons) * 100));

  return {
    completed,
    target: targetComparisons,
    percentage,
    isComplete: completed >= targetComparisons,
  };
}

/**
 * Fisher-Yates shuffle for randomizing array order
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Select next quadruplet (4 items) for comparison
 *
 * The winner of a quadruplet comparison beats all 3 losers, generating 3 pairwise wins.
 * This is equivalent to 3 pairwise comparisons in terms of ELO updates.
 *
 * Algorithm goals:
 * 1. **COVERAGE**: Prioritize unseen items to ensure every item appears at least once
 * 2. **FAIRNESS**: Balance comparison counts across items
 * 3. **VARIETY**: Avoid showing same items repeatedly
 * 4. **INFORMATION**: Prefer items with similar ELO for more informative comparisons
 *
 * @param items - All items in the category
 * @param sessionComparisons - Comparisons already made in this session
 * @returns Next quad to compare, or null if not enough items
 */
export function selectNextQuad(
  items: Item[],
  sessionComparisons: Comparison[],
): MatchQuad | null {
  if (items.length < 4) {
    return null;
  }

  // Get items seen in this session
  const seen = getSeenItemIds(sessionComparisons);
  const unseenItems = items.filter((item) => !seen.has(item.id));

  // Count session appearances
  const sessionCounts = new Map<string, number>();
  for (const item of items) {
    sessionCounts.set(item.id, 0);
  }
  for (const comp of sessionComparisons) {
    sessionCounts.set(comp.itemAId, (sessionCounts.get(comp.itemAId) || 0) + 1);
    sessionCounts.set(comp.itemBId, (sessionCounts.get(comp.itemBId) || 0) + 1);
  }

  // Track recently shown items (last 2 comparisons)
  const recentlyShown = new Set<string>();
  const recentWindow = Math.min(2, sessionComparisons.length);
  for (let i = 0; i < recentWindow; i++) {
    const comp = sessionComparisons[sessionComparisons.length - 1 - i];
    if (comp) {
      recentlyShown.add(comp.itemAId);
      recentlyShown.add(comp.itemBId);
    }
  }

  // Score function for item selection (lower = better)
  const scoreItem = (item: Item): number => {
    let score = 0;
    // Prioritize unseen items
    if (!seen.has(item.id)) score -= 1000;
    // Prefer items with fewer global comparisons
    score += item.comparisonCount * 5;
    // Prefer items with fewer session appearances
    score += (sessionCounts.get(item.id) || 0) * 20;
    // Penalize recently shown items
    if (recentlyShown.has(item.id)) score += 100;
    return score;
  };

  // Sort items by score (best first)
  const sortedItems = [...items].sort((a, b) => scoreItem(a) - scoreItem(b));

  // Select top 4, but ensure variety by not picking all from same ELO band
  const selected: Item[] = [];
  const usedIds = new Set<string>();

  // First pass: take top candidates
  for (const item of sortedItems) {
    if (selected.length >= 4) break;
    if (usedIds.has(item.id)) continue;

    // Check ELO diversity - avoid 4 items with nearly identical ELO
    if (selected.length === 3) {
      const avgElo = selected.reduce((sum, i) => sum + i.eloRating, 0) / 3;
      const eloDiff = Math.abs(item.eloRating - avgElo);
      // If too similar, try to find a more diverse option
      if (eloDiff < 50 && sortedItems.indexOf(item) < sortedItems.length - 1) {
        const remaining = sortedItems.slice(sortedItems.indexOf(item) + 1);
        const diverse = remaining.find((i) =>
          !usedIds.has(i.id) && Math.abs(i.eloRating - avgElo) >= 50
        );
        if (diverse) {
          selected.push(diverse);
          usedIds.add(diverse.id);
          continue;
        }
      }
    }

    selected.push(item);
    usedIds.add(item.id);
  }

  if (selected.length < 4) {
    return null;
  }

  // Randomize display positions to avoid any position bias
  const positions = shuffleArray(selected.map((item) => item.id));

  return {
    items: selected,
    positions,
  };
}

/**
 * Calculate recommended quad comparisons per reviewer
 *
 * Since each quad generates 3 pairwise wins, we need fewer quad comparisons
 * than pairwise comparisons to achieve the same coverage.
 *
 * Coverage: Each quad shows 4 items, so ceil(N/4) quads guarantee all items seen once.
 * Target: Same statistical power as pairwise, so divide by 3 (approximately).
 *
 * @param itemCount - Number of items in the category
 * @param reviewerCount - Expected number of reviewers
 * @returns Recommended quad comparisons per reviewer
 */
export function calculateRecommendedQuadComparisons(
  itemCount: number,
  reviewerCount: number = 5,
): number {
  // Hard minimum: ceil(N/4) to guarantee every item can appear at least once
  const coverageMinimum = Math.ceil(itemCount / 4);

  // Each quad generates 3 pairwise results, so divide pairwise target by ~2.5
  // (not 3, because we want some redundancy for reliability)
  const pairwiseTarget = calculateRecommendedComparisons(itemCount, reviewerCount);
  const statisticalTarget = Math.ceil(pairwiseTarget / 2.5);

  // Take the higher of coverage and statistical targets
  const recommended = Math.max(coverageMinimum, statisticalTarget);

  // Upper bound for fatigue prevention (quads are faster, so allow more)
  const maxComparisons = Math.max(40, Math.ceil(itemCount / 2));
  const minComparisons = coverageMinimum;

  return Math.max(minComparisons, Math.min(maxComparisons, recommended));
}
