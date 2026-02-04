/**
 * Matchmaking Algorithm for SciBLIND
 *
 * Selects pairs of items for comparison with the goals of:
 * 1. Ensuring all items get compared fairly
 * 2. Preferring informative comparisons (similar ELO ratings)
 * 3. Avoiding repeated pairs within a session
 * 4. Maintaining position balance (left/right)
 */

import type { Item, Comparison } from '@prisma/client';

export interface MatchPair {
  itemA: Item;
  itemB: Item;
  leftItemId: string;
  rightItemId: string;
}

/**
 * Select the next pair of items for comparison
 *
 * Algorithm:
 * 1. Filter out pairs already compared in this session
 * 2. Prioritize items with fewer total comparisons
 * 3. Among those, prefer items with similar ELO (more informative)
 * 4. Randomly assign left/right position
 *
 * @param items - All items in the category
 * @param sessionComparisons - Comparisons already made in this session
 * @param maxPairs - Maximum unique pairs allowed (for large sets, limit search)
 * @returns Next pair to compare, or null if all pairs exhausted
 */
export function selectNextPair(
  items: Item[],
  sessionComparisons: Comparison[],
  maxPairs: number = 1000
): MatchPair | null {
  if (items.length < 2) {
    return null;
  }

  // Build set of compared pair keys for this session
  const comparedPairs = new Set<string>();
  for (const comp of sessionComparisons) {
    // Store both orderings to catch duplicates
    const key1 = [comp.itemAId, comp.itemBId].sort().join('-');
    comparedPairs.add(key1);
  }

  // Calculate total possible pairs
  const totalPossiblePairs = (items.length * (items.length - 1)) / 2;

  // If all pairs compared, session is complete for this category
  if (comparedPairs.size >= totalPossiblePairs) {
    return null;
  }

  // Score items by "need for comparison" (fewer comparisons = higher priority)
  const itemsByNeed = [...items].sort((a, b) => a.comparisonCount - b.comparisonCount);

  // Find best pair: prioritize under-compared items, then similar ELO
  let bestPair: { itemA: Item; itemB: Item; score: number } | null = null;

  // For small-medium sets (≤100 items), do full O(n²) search for optimal pairing
  // For larger sets, use sampling to avoid performance issues
  const useFullSearch = items.length <= 100;

  if (useFullSearch) {
    // Full search: check all pairs for optimal selection
    for (let i = 0; i < itemsByNeed.length; i++) {
      const itemA = itemsByNeed[i];

      for (let j = i + 1; j < itemsByNeed.length; j++) {
        const itemB = itemsByNeed[j];

        // Check if already compared
        const pairKey = [itemA.id, itemB.id].sort().join('-');
        if (comparedPairs.has(pairKey)) {
          continue;
        }

        // Score this pair (lower is better)
        // - Prioritize under-compared items
        // - Prefer similar ELO ratings (more informative comparison)
        const comparisonNeed = itemA.comparisonCount + itemB.comparisonCount;
        const eloDiff = Math.abs(itemA.eloRating - itemB.eloRating);
        const score = comparisonNeed * 10 + eloDiff;

        if (!bestPair || score < bestPair.score) {
          bestPair = { itemA, itemB, score };
        }
      }
    }
  } else {
    // Sampled search for large sets: check top 50 under-compared items
    const searchLimit = 50;

    for (let i = 0; i < searchLimit; i++) {
      const itemA = itemsByNeed[i];

      for (let j = i + 1; j < items.length; j++) {
        const itemB = itemsByNeed[j];

        // Check if already compared
        const pairKey = [itemA.id, itemB.id].sort().join('-');
        if (comparedPairs.has(pairKey)) {
          continue;
        }

        // Score this pair (lower is better)
        const comparisonNeed = itemA.comparisonCount + itemB.comparisonCount;
        const eloDiff = Math.abs(itemA.eloRating - itemB.eloRating);
        const score = comparisonNeed * 10 + eloDiff;

        if (!bestPair || score < bestPair.score) {
          bestPair = { itemA, itemB, score };
        }
      }
    }

    // Fallback for large sets: if no pair found in sampled search, do full search
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

  // Randomly assign left/right position (50/50)
  // Slight bias correction: prefer putting the item with fewer leftCount on left
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
 * Based on item count and target reliability:
 * - Small sets (< 20): All pairs or near-complete
 * - Medium sets (20-50): ~30-40 comparisons
 * - Large sets (> 50): ~40-50 comparisons
 *
 * Goal: Each item appears in ~10 comparisons for statistical reliability
 *
 * @param itemCount - Number of items in the category
 * @param reviewerCount - Expected number of reviewers
 * @returns Recommended comparisons per reviewer for this category
 */
export function calculateRecommendedComparisons(
  itemCount: number,
  reviewerCount: number = 5
): number {
  // Each item should be in ~10 comparisons total
  // Each comparison involves 2 items
  // Total comparisons needed = (itemCount * 10) / 2 = itemCount * 5
  // Per reviewer = (itemCount * 5) / reviewerCount

  const totalNeeded = itemCount * 5;
  const perReviewer = Math.ceil(totalNeeded / reviewerCount);

  // Apply bounds
  const minComparisons = 15;
  const maxComparisons = 50;

  return Math.max(minComparisons, Math.min(maxComparisons, perReviewer));
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
  targetComparisons: number
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
