/**
 * Statistical Utilities for SciBLIND
 *
 * Provides functions for:
 * - Data sufficiency threshold checking
 * - Graph connectivity analysis
 * - Circular triad (non-transitivity) detection
 * - Elo standard error estimation
 * - Data status classification
 */

export interface ThresholdResult {
  /** Whether the data meets publishable threshold */
  isPublishable: boolean;
  /** Overall data status */
  dataStatus: 'insufficient' | 'publishable' | 'confirmation';
  /** Per-condition details */
  conditions: {
    minExposures: {
      met: boolean;
      required: number;
      minObserved: number;
      itemsBelowThreshold: number;
    };
    totalComparisons: {
      met: boolean;
      required: number;
      observed: number;
    };
    graphConnectivity: {
      met: boolean;
      connected: boolean;
      componentCount: number;
    };
  };
}

export interface ConnectivityResult {
  /** Whether the comparison graph is fully connected */
  connected: boolean;
  /** Number of connected components */
  componentCount: number;
  /** Sizes of each component */
  componentSizes: number[];
  /** Item IDs in the largest component */
  largestComponent: string[];
  /** Item IDs with zero comparisons */
  isolatedItems: string[];
}

export interface TransitivityResult {
  /** Number of circular triads (A>B>C>A) detected */
  circularTriadCount: number;
  /** Transitivity index: 1 - (observed cycles / max possible cycles) */
  transitivityIndex: number;
  /** Total number of triads checked */
  totalTriads: number;
}

interface ItemForStats {
  id: string;
  comparisonCount: number;
}

interface ComparisonForStats {
  winnerId: string;
  itemAId: string;
  itemBId: string;
  isFlagged?: boolean;
  flagReason?: string | null;
}

interface StudyThresholds {
  minExposuresPerItem: number;
  minTotalComparisons: number | null;
}

/**
 * Calculate the standard error of an Elo rating.
 *
 * Approximation based on the standard Elo model:
 *   SE ≈ 400 / (√n × ln(10))
 *
 * where n is the number of games played by the item.
 * This assumes games are against opponents with similar ratings.
 *
 * For items with 0 games, returns Infinity.
 *
 * @param comparisonCount - Number of comparisons the item has participated in
 * @returns Approximate standard error of the Elo rating
 */
export function calculateEloStdError(comparisonCount: number): number {
  if (comparisonCount <= 0) return Infinity;
  return 400 / (Math.sqrt(comparisonCount) * Math.LN10);
}

/**
 * Check whether study data meets the publishable threshold.
 *
 * Three conditions must ALL be met:
 * 1. Every item has at least M comparisons (minExposuresPerItem)
 * 2. Total valid comparisons ≥ K (minTotalComparisons, default 10 × itemCount)
 * 3. Comparison graph is connected (all items reachable from any other)
 *
 * @param items - All items in the category/study
 * @param comparisons - All valid (non-test) comparisons
 * @param studyThresholds - Study-level threshold configuration
 * @returns ThresholdResult with detailed pass/fail info
 */
export function isPublishableThreshold(
  items: ItemForStats[],
  comparisons: ComparisonForStats[],
  studyThresholds: StudyThresholds,
): ThresholdResult {
  const { minExposuresPerItem } = studyThresholds;
  const minTotalComparisons =
    studyThresholds.minTotalComparisons ?? items.length * 10;

  // Filter out test comparisons
  const validComparisons = comparisons.filter(
    (c) => !c.isFlagged || c.flagReason !== 'test_session',
  );

  // Condition 1: Min exposures per item
  const itemExposures = new Map<string, number>();
  for (const item of items) {
    itemExposures.set(item.id, 0);
  }
  for (const comp of validComparisons) {
    itemExposures.set(
      comp.itemAId,
      (itemExposures.get(comp.itemAId) || 0) + 1,
    );
    itemExposures.set(
      comp.itemBId,
      (itemExposures.get(comp.itemBId) || 0) + 1,
    );
  }

  let minObserved = Infinity;
  let itemsBelowThreshold = 0;
  for (const [, count] of itemExposures) {
    if (count < minObserved) minObserved = count;
    if (count < minExposuresPerItem) itemsBelowThreshold++;
  }
  if (minObserved === Infinity) minObserved = 0;

  const minExposuresMet = itemsBelowThreshold === 0;

  // Condition 2: Total comparisons
  const totalComparisonsMet = validComparisons.length >= minTotalComparisons;

  // Condition 3: Graph connectivity
  const connectivity = checkGraphConnectivity(
    items.map((i) => i.id),
    validComparisons,
  );
  const connectivityMet = connectivity.connected;

  // Determine overall status
  const isPublishable =
    minExposuresMet && totalComparisonsMet && connectivityMet;

  // "confirmation" means threshold just met — more data improves precision
  // but results are already publishable
  let dataStatus: 'insufficient' | 'publishable' | 'confirmation';
  if (!isPublishable) {
    dataStatus = 'insufficient';
  } else {
    // If we have >1.5x the minimum, we're in confirmation territory
    const exposureRatio =
      minObserved > 0 ? minObserved / minExposuresPerItem : 0;
    const totalRatio =
      minTotalComparisons > 0
        ? validComparisons.length / minTotalComparisons
        : 0;
    dataStatus =
      exposureRatio >= 1.5 && totalRatio >= 1.5
        ? 'confirmation'
        : 'publishable';
  }

  return {
    isPublishable,
    dataStatus,
    conditions: {
      minExposures: {
        met: minExposuresMet,
        required: minExposuresPerItem,
        minObserved,
        itemsBelowThreshold,
      },
      totalComparisons: {
        met: totalComparisonsMet,
        required: minTotalComparisons,
        observed: validComparisons.length,
      },
      graphConnectivity: {
        met: connectivityMet,
        connected: connectivity.connected,
        componentCount: connectivity.componentCount,
      },
    },
  };
}

/**
 * Check graph connectivity of the comparison graph using BFS.
 *
 * Each item is a node. An edge exists between two items if they've
 * been compared at least once. The graph should be connected for
 * meaningful ranking (every item comparable to every other).
 *
 * @param itemIds - All item IDs
 * @param comparisons - All comparisons
 * @returns ConnectivityResult with component analysis
 */
export function checkGraphConnectivity(
  itemIds: string[],
  comparisons: ComparisonForStats[],
): ConnectivityResult {
  if (itemIds.length === 0) {
    return {
      connected: true,
      componentCount: 0,
      componentSizes: [],
      largestComponent: [],
      isolatedItems: [],
    };
  }

  // Build adjacency list
  const adj = new Map<string, Set<string>>();
  for (const id of itemIds) {
    adj.set(id, new Set());
  }

  for (const comp of comparisons) {
    if (adj.has(comp.itemAId) && adj.has(comp.itemBId)) {
      adj.get(comp.itemAId)!.add(comp.itemBId);
      adj.get(comp.itemBId)!.add(comp.itemAId);
    }
  }

  // BFS to find connected components
  const visited = new Set<string>();
  const components: string[][] = [];
  const isolatedItems: string[] = [];

  for (const id of itemIds) {
    if (visited.has(id)) continue;

    const component: string[] = [];
    const queue: string[] = [id];
    visited.add(id);

    while (queue.length > 0) {
      const node = queue.shift()!;
      component.push(node);

      for (const neighbor of adj.get(node) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    components.push(component);

    // Check if this is an isolated node (no edges)
    if (component.length === 1 && (adj.get(id)?.size || 0) === 0) {
      isolatedItems.push(id);
    }
  }

  // Sort components by size (largest first)
  components.sort((a, b) => b.length - a.length);

  return {
    connected: components.length <= 1,
    componentCount: components.length,
    componentSizes: components.map((c) => c.length),
    largestComponent: components[0] || [],
    isolatedItems,
  };
}

/**
 * Detect circular triads (non-transitivity) in comparison data.
 *
 * A circular triad occurs when A beats B, B beats C, but C beats A.
 * This indicates non-transitive preferences in the data.
 *
 * The transitivity index is: 1 - (observed cycles / max possible cycles)
 * where max possible = C(n, 3) for n items.
 *
 * A high transitivity index (close to 1) means preferences are highly transitive.
 * A low index (close to 0) means many circular preferences exist.
 *
 * For efficiency, this only checks items with ≤ 100 items (O(n³) algorithm).
 *
 * @param comparisons - All valid comparisons
 * @returns TransitivityResult with cycle count and index
 */
export function detectCircularTriads(
  comparisons: ComparisonForStats[],
): TransitivityResult {
  // Build win matrix: wins[A][B] = number of times A beat B
  const wins = new Map<string, Map<string, number>>();
  const itemIds = new Set<string>();

  for (const comp of comparisons) {
    itemIds.add(comp.itemAId);
    itemIds.add(comp.itemBId);

    if (!wins.has(comp.winnerId)) {
      wins.set(comp.winnerId, new Map());
    }

    const loserId =
      comp.winnerId === comp.itemAId ? comp.itemBId : comp.itemAId;
    const winMap = wins.get(comp.winnerId)!;
    winMap.set(loserId, (winMap.get(loserId) || 0) + 1);
  }

  const items = Array.from(itemIds);
  const n = items.length;

  // Skip for large sets (O(n³) is too expensive)
  if (n > 100) {
    return {
      circularTriadCount: -1, // -1 indicates "not computed"
      transitivityIndex: -1,
      totalTriads: -1,
    };
  }

  // Build dominance matrix: doesABeatB[A][B] = true if A beat B more than B beat A
  const doesBeat = (a: string, b: string): boolean => {
    const aWins = wins.get(a)?.get(b) || 0;
    const bWins = wins.get(b)?.get(a) || 0;
    return aWins > bWins;
  };

  let circularCount = 0;
  let totalTriads = 0;

  // Check all triples
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = items[i];
        const b = items[j];
        const c = items[k];

        // Only count if all three pairs have been compared
        const abCompared =
          (wins.get(a)?.get(b) || 0) + (wins.get(b)?.get(a) || 0) > 0;
        const bcCompared =
          (wins.get(b)?.get(c) || 0) + (wins.get(c)?.get(b) || 0) > 0;
        const acCompared =
          (wins.get(a)?.get(c) || 0) + (wins.get(c)?.get(a) || 0) > 0;

        if (!abCompared || !bcCompared || !acCompared) continue;

        totalTriads++;

        // Check for circular triad in either direction:
        // A>B>C>A or A>C>B>A
        const abDir = doesBeat(a, b);
        const bcDir = doesBeat(b, c);
        const caDir = doesBeat(c, a);

        // Circular if all three go the same direction
        // (all clockwise or all counter-clockwise)
        if (abDir === bcDir && bcDir === caDir) {
          circularCount++;
        }
      }
    }
  }

  // Max possible circular triads = C(n,3)
  const maxTriads = totalTriads > 0 ? totalTriads : 1;
  const transitivityIndex = 1 - circularCount / maxTriads;

  return {
    circularTriadCount: circularCount,
    transitivityIndex: Math.max(0, Math.min(1, transitivityIndex)),
    totalTriads,
  };
}

/**
 * Calculate the data status for a set of items and comparisons.
 *
 * Convenience wrapper that combines threshold checking with
 * a simple status string.
 *
 * @param items - All items
 * @param comparisons - All comparisons
 * @param studyThresholds - Study threshold config
 * @returns Data status string
 */
export function calculateDataStatus(
  items: ItemForStats[],
  comparisons: ComparisonForStats[],
  studyThresholds: StudyThresholds,
): 'insufficient' | 'publishable' | 'confirmation' {
  const result = isPublishableThreshold(items, comparisons, studyThresholds);
  return result.dataStatus;
}
