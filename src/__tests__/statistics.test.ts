/**
 * Tests for Statistical Utilities
 *
 * Validates:
 * - Elo standard error calculation
 * - Publishable threshold checking
 * - Graph connectivity analysis
 * - Circular triad detection
 * - Data status classification
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEloStdError,
  isPublishableThreshold,
  checkGraphConnectivity,
  detectCircularTriads,
  calculateDataStatus,
} from '@/lib/ranking/statistics';

describe('calculateEloStdError', () => {
  it('should return Infinity for 0 comparisons', () => {
    expect(calculateEloStdError(0)).toBe(Infinity);
  });

  it('should return Infinity for negative comparisons', () => {
    expect(calculateEloStdError(-1)).toBe(Infinity);
  });

  it('should decrease with more comparisons', () => {
    const se5 = calculateEloStdError(5);
    const se10 = calculateEloStdError(10);
    const se50 = calculateEloStdError(50);

    expect(se10).toBeLessThan(se5);
    expect(se50).toBeLessThan(se10);
  });

  it('should follow the formula 400/(sqrt(n)*ln(10))', () => {
    const n = 25;
    const expected = 400 / (Math.sqrt(n) * Math.LN10);
    expect(calculateEloStdError(n)).toBeCloseTo(expected, 5);
  });

  it('should return a reasonable value for typical comparison counts', () => {
    // With 10 comparisons: SE ≈ 55
    const se = calculateEloStdError(10);
    expect(se).toBeGreaterThan(30);
    expect(se).toBeLessThan(100);
  });
});

describe('checkGraphConnectivity', () => {
  it('should return connected for empty graph', () => {
    const result = checkGraphConnectivity([], []);
    expect(result.connected).toBe(true);
    expect(result.componentCount).toBe(0);
  });

  it('should detect single connected component', () => {
    const items = ['A', 'B', 'C'];
    const comparisons = [
      { winnerId: 'A', itemAId: 'A', itemBId: 'B' },
      { winnerId: 'B', itemAId: 'B', itemBId: 'C' },
    ];

    const result = checkGraphConnectivity(items, comparisons);
    expect(result.connected).toBe(true);
    expect(result.componentCount).toBe(1);
  });

  it('should detect disconnected components', () => {
    const items = ['A', 'B', 'C', 'D'];
    const comparisons = [
      { winnerId: 'A', itemAId: 'A', itemBId: 'B' },
      { winnerId: 'C', itemAId: 'C', itemBId: 'D' },
    ];

    const result = checkGraphConnectivity(items, comparisons);
    expect(result.connected).toBe(false);
    expect(result.componentCount).toBe(2);
    expect(result.componentSizes).toContain(2);
  });

  it('should detect isolated items', () => {
    const items = ['A', 'B', 'C'];
    const comparisons = [
      { winnerId: 'A', itemAId: 'A', itemBId: 'B' },
    ];

    const result = checkGraphConnectivity(items, comparisons);
    expect(result.connected).toBe(false);
    expect(result.isolatedItems).toContain('C');
  });

  it('should handle single item', () => {
    const result = checkGraphConnectivity(['A'], []);
    expect(result.connected).toBe(true);
    expect(result.componentCount).toBe(1);
    expect(result.isolatedItems).toContain('A');
  });
});

describe('detectCircularTriads', () => {
  it('should detect no cycles in fully transitive data', () => {
    // A > B > C (no cycles)
    const comparisons = [
      { winnerId: 'A', itemAId: 'A', itemBId: 'B' },
      { winnerId: 'B', itemAId: 'B', itemBId: 'C' },
      { winnerId: 'A', itemAId: 'A', itemBId: 'C' },
    ];

    const result = detectCircularTriads(comparisons);
    expect(result.circularTriadCount).toBe(0);
    expect(result.transitivityIndex).toBe(1);
  });

  it('should detect circular triad A>B>C>A', () => {
    const comparisons = [
      { winnerId: 'A', itemAId: 'A', itemBId: 'B' },
      { winnerId: 'B', itemAId: 'B', itemBId: 'C' },
      { winnerId: 'C', itemAId: 'C', itemBId: 'A' },
    ];

    const result = detectCircularTriads(comparisons);
    expect(result.circularTriadCount).toBe(1);
    expect(result.transitivityIndex).toBe(0);
  });

  it('should handle empty comparisons', () => {
    const result = detectCircularTriads([]);
    expect(result.circularTriadCount).toBe(0);
    expect(result.totalTriads).toBe(0);
  });

  it('should handle incomplete triads (only 2 of 3 pairs compared)', () => {
    const comparisons = [
      { winnerId: 'A', itemAId: 'A', itemBId: 'B' },
      { winnerId: 'B', itemAId: 'B', itemBId: 'C' },
      // A-C never compared
    ];

    const result = detectCircularTriads(comparisons);
    expect(result.totalTriads).toBe(0); // Can't form complete triads
  });

  it('should return -1 for > 100 items (too expensive)', () => {
    const items = Array.from({ length: 101 }, (_, i) => `item${i}`);
    const comparisons = items.slice(0, -1).map((id, i) => ({
      winnerId: id,
      itemAId: id,
      itemBId: items[i + 1],
    }));

    const result = detectCircularTriads(comparisons);
    expect(result.circularTriadCount).toBe(-1);
  });
});

describe('isPublishableThreshold', () => {
  const defaultThresholds = {
    minExposuresPerItem: 10,
    minTotalComparisons: null, // Will default to 10 × itemCount
  };

  it('should return insufficient when no comparisons', () => {
    const items = [
      { id: 'A', comparisonCount: 0 },
      { id: 'B', comparisonCount: 0 },
    ];

    const result = isPublishableThreshold(items, [], defaultThresholds);
    expect(result.isPublishable).toBe(false);
    expect(result.dataStatus).toBe('insufficient');
  });

  it('should return publishable when all conditions met', () => {
    const items = [
      { id: 'A', comparisonCount: 15 },
      { id: 'B', comparisonCount: 12 },
    ];

    // Need 20 total (10 × 2 items)
    const comparisons = Array.from({ length: 25 }, (_, i) => ({
      winnerId: i % 2 === 0 ? 'A' : 'B',
      itemAId: 'A',
      itemBId: 'B',
      isFlagged: false,
      flagReason: null,
    }));

    const result = isPublishableThreshold(items, comparisons, defaultThresholds);
    expect(result.isPublishable).toBe(true);
  });

  it('should exclude test comparisons from threshold check', () => {
    const items = [
      { id: 'A', comparisonCount: 5 },
      { id: 'B', comparisonCount: 5 },
    ];

    const comparisons = Array.from({ length: 25 }, (_, i) => ({
      winnerId: i % 2 === 0 ? 'A' : 'B',
      itemAId: 'A',
      itemBId: 'B',
      isFlagged: true,
      flagReason: 'test_session',
    }));

    const result = isPublishableThreshold(items, comparisons, defaultThresholds);
    expect(result.isPublishable).toBe(false);
    expect(result.conditions.totalComparisons.observed).toBe(0);
  });

  it('should require graph connectivity', () => {
    const items = [
      { id: 'A', comparisonCount: 15 },
      { id: 'B', comparisonCount: 15 },
      { id: 'C', comparisonCount: 0 }, // Isolated!
    ];

    const comparisons = Array.from({ length: 30 }, (_, i) => ({
      winnerId: i % 2 === 0 ? 'A' : 'B',
      itemAId: 'A',
      itemBId: 'B',
      isFlagged: false,
      flagReason: null,
    }));

    const result = isPublishableThreshold(items, comparisons, defaultThresholds);
    expect(result.isPublishable).toBe(false);
    expect(result.conditions.graphConnectivity.met).toBe(false);
  });

  it('should respect custom minTotalComparisons', () => {
    const items = [
      { id: 'A', comparisonCount: 15 },
      { id: 'B', comparisonCount: 15 },
    ];

    const comparisons = Array.from({ length: 25 }, (_, i) => ({
      winnerId: i % 2 === 0 ? 'A' : 'B',
      itemAId: 'A',
      itemBId: 'B',
      isFlagged: false,
      flagReason: null,
    }));

    const result = isPublishableThreshold(items, comparisons, {
      minExposuresPerItem: 10,
      minTotalComparisons: 50, // Custom: need 50
    });

    expect(result.conditions.totalComparisons.met).toBe(false);
    expect(result.conditions.totalComparisons.required).toBe(50);
  });
});

describe('calculateDataStatus', () => {
  it('should return insufficient for empty data', () => {
    const status = calculateDataStatus(
      [{ id: 'A', comparisonCount: 0 }],
      [],
      { minExposuresPerItem: 10, minTotalComparisons: null },
    );
    expect(status).toBe('insufficient');
  });
});
