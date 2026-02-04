/**
 * ELO Rating System for SciBLIND
 *
 * Implements standard ELO calculation with artist boost support.
 * Used for pairwise comparison ranking.
 */

export interface EloResult {
  winnerNewRating: number;
  loserNewRating: number;
  winnerDelta: number;
  loserDelta: number;
}

/**
 * Calculate ELO rating changes after a comparison
 *
 * @param winnerRating - Current ELO rating of the winner
 * @param loserRating - Current ELO rating of the loser
 * @param kFactor - K-factor (sensitivity of rating changes, default 32)
 * @returns New ratings and deltas for both items
 */
export function calculateEloChange(
  winnerRating: number,
  loserRating: number,
  kFactor: number = 32
): EloResult {
  // Calculate expected score (probability of winning)
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  // Calculate rating changes
  // Winner: scored 1 (win), expected expectedWinner
  // Loser: scored 0 (loss), expected expectedLoser
  const winnerDelta = kFactor * (1 - expectedWinner);
  const loserDelta = kFactor * (0 - expectedLoser);

  return {
    winnerNewRating: winnerRating + winnerDelta,
    loserNewRating: loserRating + loserDelta,
    winnerDelta,
    loserDelta,
  };
}

/**
 * Calculate artist ELO boost based on artist rank
 *
 * Rank 1 (10 points in Excel) = +200 ELO
 * Rank 2 (9 points) = +180 ELO
 * ...
 * Rank 10 (1 point) = +20 ELO
 *
 * @param artistRank - Artist ranking (1-10, where 1 is best)
 * @returns ELO boost to add to initial rating
 */
export function calculateArtistBoost(artistRank: number): number {
  if (artistRank < 1 || artistRank > 10) return 0;
  return (11 - artistRank) * 20;
}

/**
 * Convert Excel points (10=best, 1=worst) to rank (1=best, 10=worst)
 *
 * @param points - Points from Excel (1-10, where 10 is best)
 * @returns Rank (1-10, where 1 is best)
 */
export function pointsToRank(points: number): number {
  if (points < 1 || points > 10) return 0;
  return 11 - points;
}

/**
 * Item interface for ranking comparison
 */
export interface RankableItem {
  id: string;
  eloRating: number;
  artistRank: number | null;
  comparisonCount: number;
  winCount: number;
  lossCount: number;
}

/**
 * Compare two items for ranking (sorting)
 *
 * Primary: ELO rating (higher is better)
 * Tie-breaker: Artist rank (lower is better, 1 = best)
 *
 * @param a - First item
 * @param b - Second item
 * @returns Negative if a ranks higher, positive if b ranks higher
 */
export function compareItemsForRanking(a: RankableItem, b: RankableItem): number {
  // Primary: ELO rating (higher is better)
  if (a.eloRating !== b.eloRating) {
    return b.eloRating - a.eloRating;
  }

  // Tie-breaker: Artist rank (lower is better, 1 = best)
  if (a.artistRank !== null && b.artistRank !== null) {
    return a.artistRank - b.artistRank;
  }

  // If only one has artist rank, prioritize it
  if (a.artistRank !== null) return -1;
  if (b.artistRank !== null) return 1;

  // Final fallback: more comparisons = more reliable
  if (a.comparisonCount !== b.comparisonCount) {
    return b.comparisonCount - a.comparisonCount;
  }

  // Last resort: win rate
  const aWinRate = a.comparisonCount > 0 ? a.winCount / a.comparisonCount : 0;
  const bWinRate = b.comparisonCount > 0 ? b.winCount / b.comparisonCount : 0;
  return bWinRate - aWinRate;
}

/**
 * Calculate expected win probability between two items
 *
 * @param ratingA - ELO rating of item A
 * @param ratingB - ELO rating of item B
 * @returns Probability that A beats B (0-1)
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Get confidence level based on number of comparisons
 *
 * @param comparisonCount - Number of comparisons the item has been in
 * @returns Confidence level (low, medium, high)
 */
export function getConfidenceLevel(comparisonCount: number): 'low' | 'medium' | 'high' {
  if (comparisonCount < 5) return 'low';
  if (comparisonCount < 15) return 'medium';
  return 'high';
}
