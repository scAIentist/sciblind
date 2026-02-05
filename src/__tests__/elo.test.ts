/**
 * Tests for Elo Rating System
 *
 * Validates:
 * - Standard Elo formula correctness
 * - Zero-sum property (winner gain ≈ loser loss)
 * - Expected score function
 * - Artist boost calculation
 * - Adaptive K-factor
 * - Confidence level bucketing
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEloChange,
  calculateArtistBoost,
  pointsToRank,
  expectedScore,
  getConfidenceLevel,
  calculateAdaptiveK,
  compareItemsForRanking,
} from '@/lib/ranking/elo';

describe('calculateEloChange', () => {
  it('should return correct results for equal ratings', () => {
    const result = calculateEloChange(1500, 1500, 32);
    expect(result.winnerDelta).toBeCloseTo(16, 1);
    expect(result.loserDelta).toBeCloseTo(-16, 1);
    expect(result.winnerNewRating).toBeCloseTo(1516, 1);
    expect(result.loserNewRating).toBeCloseTo(1484, 1);
  });

  it('should maintain zero-sum property', () => {
    const result = calculateEloChange(1600, 1400, 32);
    expect(result.winnerDelta + result.loserDelta).toBeCloseTo(0, 5);
  });

  it('should give smaller delta when favorite wins', () => {
    const favoriteWins = calculateEloChange(1700, 1300, 32);
    const underdogWins = calculateEloChange(1300, 1700, 32);
    expect(favoriteWins.winnerDelta).toBeLessThan(underdogWins.winnerDelta);
  });

  it('should give larger delta when underdog wins', () => {
    const result = calculateEloChange(1300, 1700, 32);
    expect(result.winnerDelta).toBeGreaterThan(16);
  });

  it('should respect K-factor', () => {
    const k16 = calculateEloChange(1500, 1500, 16);
    const k32 = calculateEloChange(1500, 1500, 32);
    expect(k32.winnerDelta).toBeCloseTo(k16.winnerDelta * 2, 5);
  });

  it('should use default K=32 when not specified', () => {
    const result = calculateEloChange(1500, 1500);
    expect(result.winnerDelta).toBeCloseTo(16, 1);
  });
});

describe('expectedScore', () => {
  it('should return 0.5 for equal ratings', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
  });

  it('should return > 0.5 for higher-rated item', () => {
    expect(expectedScore(1600, 1400)).toBeGreaterThan(0.5);
  });

  it('should return < 0.5 for lower-rated item', () => {
    expect(expectedScore(1400, 1600)).toBeLessThan(0.5);
  });

  it('should be symmetric (p_AB + p_BA = 1)', () => {
    const pAB = expectedScore(1600, 1400);
    const pBA = expectedScore(1400, 1600);
    expect(pAB + pBA).toBeCloseTo(1.0, 10);
  });

  it('should return ~0.76 for 200-point advantage', () => {
    // Standard Elo: 200 points ≈ 76% win probability
    const p = expectedScore(1700, 1500);
    expect(p).toBeCloseTo(0.76, 1);
  });
});

describe('calculateArtistBoost', () => {
  it('should return +200 for rank 1', () => {
    expect(calculateArtistBoost(1)).toBe(200);
  });

  it('should return +20 for rank 10', () => {
    expect(calculateArtistBoost(10)).toBe(20);
  });

  it('should return 0 for invalid ranks', () => {
    expect(calculateArtistBoost(0)).toBe(0);
    expect(calculateArtistBoost(11)).toBe(0);
    expect(calculateArtistBoost(-1)).toBe(0);
  });

  it('should decrease linearly with rank', () => {
    for (let rank = 1; rank <= 10; rank++) {
      expect(calculateArtistBoost(rank)).toBe((11 - rank) * 20);
    }
  });
});

describe('pointsToRank', () => {
  it('should convert 10 points to rank 1', () => {
    expect(pointsToRank(10)).toBe(1);
  });

  it('should convert 1 point to rank 10', () => {
    expect(pointsToRank(1)).toBe(10);
  });

  it('should return 0 for invalid points', () => {
    expect(pointsToRank(0)).toBe(0);
    expect(pointsToRank(11)).toBe(0);
  });
});

describe('getConfidenceLevel', () => {
  it('should return low for < 5 comparisons', () => {
    expect(getConfidenceLevel(0)).toBe('low');
    expect(getConfidenceLevel(4)).toBe('low');
  });

  it('should return medium for 5-14 comparisons', () => {
    expect(getConfidenceLevel(5)).toBe('medium');
    expect(getConfidenceLevel(14)).toBe('medium');
  });

  it('should return high for >= 15 comparisons', () => {
    expect(getConfidenceLevel(15)).toBe('high');
    expect(getConfidenceLevel(100)).toBe('high');
  });
});

describe('calculateAdaptiveK', () => {
  it('should return high K for new items (1 game)', () => {
    const k = calculateAdaptiveK(32, 1, 1);
    expect(k).toBe(32 * 32); // 1024
  });

  it('should return base K when both items have 32+ games', () => {
    const k = calculateAdaptiveK(32, 32, 32);
    expect(k).toBe(32);
  });

  it('should use the item with fewer games', () => {
    const k = calculateAdaptiveK(32, 100, 5);
    // min(100, 5) = 5, multiplier = 32/5 = 6.4
    expect(k).toBeCloseTo(32 * 6.4, 1);
  });

  it('should never return less than base K', () => {
    const k = calculateAdaptiveK(32, 1000, 1000);
    expect(k).toBeGreaterThanOrEqual(32);
  });

  it('should handle zero games by treating as 1', () => {
    const k = calculateAdaptiveK(32, 0, 0);
    expect(k).toBe(32 * 32);
  });
});

describe('compareItemsForRanking', () => {
  it('should sort by Elo rating (higher first)', () => {
    const a = { id: 'a', eloRating: 1600, artistRank: null, comparisonCount: 10, winCount: 6, lossCount: 4 };
    const b = { id: 'b', eloRating: 1500, artistRank: null, comparisonCount: 10, winCount: 5, lossCount: 5 };
    expect(compareItemsForRanking(a, b)).toBeLessThan(0);
  });

  it('should use artist rank as tiebreaker', () => {
    const a = { id: 'a', eloRating: 1500, artistRank: 1, comparisonCount: 10, winCount: 5, lossCount: 5 };
    const b = { id: 'b', eloRating: 1500, artistRank: 5, comparisonCount: 10, winCount: 5, lossCount: 5 };
    expect(compareItemsForRanking(a, b)).toBeLessThan(0);
  });

  it('should prioritize items with artist rank over those without', () => {
    const a = { id: 'a', eloRating: 1500, artistRank: 5, comparisonCount: 10, winCount: 5, lossCount: 5 };
    const b = { id: 'b', eloRating: 1500, artistRank: null, comparisonCount: 10, winCount: 5, lossCount: 5 };
    expect(compareItemsForRanking(a, b)).toBeLessThan(0);
  });
});
