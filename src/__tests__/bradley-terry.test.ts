/**
 * Tests for Bradley-Terry Model
 *
 * Validates:
 * - MLE convergence for simple cases
 * - Standard error computation
 * - Win probability function
 * - Ability-to-Elo conversion
 * - Edge cases (no comparisons, single item)
 */

import { describe, it, expect } from 'vitest';
import {
  estimateBradleyTerry,
  btWinProbability,
  btAbilityToEloScale,
} from '@/lib/ranking/bradley-terry';

describe('estimateBradleyTerry', () => {
  it('should converge for simple two-item case', () => {
    // A beats B 7 times, B beats A 3 times
    const comparisons = [
      ...Array(7).fill(null).map(() => ({ winnerId: 'A', loserId: 'B' })),
      ...Array(3).fill(null).map(() => ({ winnerId: 'B', loserId: 'A' })),
    ];

    const result = estimateBradleyTerry(comparisons);

    expect(result.converged).toBe(true);
    expect(result.abilities.get('A')).toBeGreaterThan(result.abilities.get('B')!);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('should produce abilities that sum to ~0 (normalized)', () => {
    const comparisons = [
      { winnerId: 'A', loserId: 'B' },
      { winnerId: 'B', loserId: 'C' },
      { winnerId: 'A', loserId: 'C' },
    ];

    const result = estimateBradleyTerry(comparisons);

    const sum = Array.from(result.abilities.values()).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(0, 1);
  });

  it('should produce finite standard errors', () => {
    const comparisons = [
      ...Array(5).fill(null).map(() => ({ winnerId: 'A', loserId: 'B' })),
      ...Array(5).fill(null).map(() => ({ winnerId: 'B', loserId: 'C' })),
      ...Array(3).fill(null).map(() => ({ winnerId: 'A', loserId: 'C' })),
      ...Array(2).fill(null).map(() => ({ winnerId: 'C', loserId: 'A' })),
    ];

    const result = estimateBradleyTerry(comparisons);

    for (const [, se] of result.standardErrors) {
      expect(isFinite(se)).toBe(true);
      expect(se).toBeGreaterThan(0);
    }
  });

  it('should handle single item gracefully', () => {
    const result = estimateBradleyTerry([]);
    expect(result.converged).toBe(true);
    expect(result.abilities.size).toBe(0);
  });

  it('should produce negative log-likelihood', () => {
    const comparisons = [
      { winnerId: 'A', loserId: 'B' },
      { winnerId: 'B', loserId: 'C' },
    ];

    const result = estimateBradleyTerry(comparisons);
    expect(result.logLikelihood).toBeLessThanOrEqual(0);
  });

  it('should rank items correctly for clear dominance', () => {
    // A > B > C (unambiguous)
    const comparisons = [
      ...Array(10).fill(null).map(() => ({ winnerId: 'A', loserId: 'B' })),
      ...Array(10).fill(null).map(() => ({ winnerId: 'B', loserId: 'C' })),
      ...Array(10).fill(null).map(() => ({ winnerId: 'A', loserId: 'C' })),
    ];

    const result = estimateBradleyTerry(comparisons);

    const abilityA = result.abilities.get('A')!;
    const abilityB = result.abilities.get('B')!;
    const abilityC = result.abilities.get('C')!;

    expect(abilityA).toBeGreaterThan(abilityB);
    expect(abilityB).toBeGreaterThan(abilityC);
  });

  it('should handle equal win rates correctly', () => {
    const comparisons = [
      ...Array(5).fill(null).map(() => ({ winnerId: 'A', loserId: 'B' })),
      ...Array(5).fill(null).map(() => ({ winnerId: 'B', loserId: 'A' })),
    ];

    const result = estimateBradleyTerry(comparisons);

    const abilityA = result.abilities.get('A')!;
    const abilityB = result.abilities.get('B')!;

    expect(Math.abs(abilityA - abilityB)).toBeLessThan(0.1);
  });
});

describe('btWinProbability', () => {
  it('should return 0.5 for equal abilities', () => {
    expect(btWinProbability(0, 0)).toBeCloseTo(0.5, 5);
  });

  it('should return > 0.5 for higher ability', () => {
    expect(btWinProbability(1, 0)).toBeGreaterThan(0.5);
  });

  it('should return < 0.5 for lower ability', () => {
    expect(btWinProbability(0, 1)).toBeLessThan(0.5);
  });

  it('should be symmetric (p_AB + p_BA = 1)', () => {
    const p1 = btWinProbability(1.5, 0.3);
    const p2 = btWinProbability(0.3, 1.5);
    expect(p1 + p2).toBeCloseTo(1.0, 10);
  });
});

describe('btAbilityToEloScale', () => {
  it('should map ability 0 to rating 1500', () => {
    expect(btAbilityToEloScale(0)).toBeCloseTo(1500, 1);
  });

  it('should increase with ability', () => {
    expect(btAbilityToEloScale(1)).toBeGreaterThan(btAbilityToEloScale(0));
  });

  it('should map consistently with Elo scale', () => {
    // A 400-point Elo difference corresponds to ln(10) ability difference
    const diff = btAbilityToEloScale(Math.LN10) - btAbilityToEloScale(0);
    expect(diff).toBeCloseTo(400, 0);
  });
});
