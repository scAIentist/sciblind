/**
 * Bradley-Terry Model for SciBLIND
 *
 * Implements the Bradley-Terry model for pairwise comparison ranking.
 * Uses the Minorization-Maximization (MM) algorithm for MLE estimation.
 *
 * The BT model estimates ability parameters π_i such that:
 *   P(i beats j) = π_i / (π_i + π_j)
 *
 * Advantages over Elo:
 * - Provides true MLE estimates (not path-dependent like Elo)
 * - Fisher information gives principled standard errors
 * - Natural probability interpretation
 *
 * Reference: Hunter (2004) "MM algorithms for generalized Bradley-Terry models"
 */

export interface BTResult {
  /** Ability parameters (log-scale, higher = better) */
  abilities: Map<string, number>;
  /** Standard errors for each ability */
  standardErrors: Map<string, number>;
  /** Number of iterations to converge */
  iterations: number;
  /** Whether the algorithm converged */
  converged: boolean;
  /** Final log-likelihood */
  logLikelihood: number;
}

export interface ComparisonRecord {
  winnerId: string;
  loserId: string;
}

/**
 * Estimate Bradley-Terry abilities from pairwise comparisons
 * using the MM (Minorization-Maximization) algorithm.
 *
 * The MM update for player i is:
 *   π_i^(new) = W_i / Σ_{j≠i} (n_ij / (π_i^(old) + π_j^(old)))
 *
 * where W_i = total wins of item i, n_ij = total games between i and j.
 *
 * @param comparisons - Array of comparison results (winnerId, loserId)
 * @param maxIterations - Maximum number of MM iterations
 * @param tolerance - Convergence tolerance (max param change)
 * @returns BTResult with abilities, standard errors, and convergence info
 */
export function estimateBradleyTerry(
  comparisons: ComparisonRecord[],
  maxIterations: number = 1000,
  tolerance: number = 1e-8,
): BTResult {
  // Collect all unique item IDs
  const itemIds = new Set<string>();
  for (const comp of comparisons) {
    itemIds.add(comp.winnerId);
    itemIds.add(comp.loserId);
  }

  const items = Array.from(itemIds);
  const n = items.length;

  if (n < 2) {
    return {
      abilities: new Map(items.map((id) => [id, 0])),
      standardErrors: new Map(items.map((id) => [id, Infinity])),
      iterations: 0,
      converged: true,
      logLikelihood: 0,
    };
  }

  // Build win counts and pairwise game counts
  const wins = new Map<string, number>(); // total wins per item
  const pairGames = new Map<string, number>(); // n_ij for each pair

  for (const id of items) {
    wins.set(id, 0);
  }

  for (const comp of comparisons) {
    wins.set(comp.winnerId, (wins.get(comp.winnerId) || 0) + 1);

    const pairKey = [comp.winnerId, comp.loserId].sort().join('|');
    pairGames.set(pairKey, (pairGames.get(pairKey) || 0) + 1);
  }

  // Initialize abilities uniformly
  const pi = new Map<string, number>();
  for (const id of items) {
    pi.set(id, 1.0);
  }

  // Build adjacency list for efficiency
  const neighbors = new Map<string, Set<string>>();
  for (const id of items) {
    neighbors.set(id, new Set());
  }
  for (const comp of comparisons) {
    neighbors.get(comp.winnerId)!.add(comp.loserId);
    neighbors.get(comp.loserId)!.add(comp.winnerId);
  }

  let iterations = 0;
  let converged = false;

  // MM iterations
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let maxChange = 0;

    const newPi = new Map<string, number>();

    for (const i of items) {
      const wi = wins.get(i) || 0;

      if (wi === 0) {
        // Item has no wins — set to small value
        newPi.set(i, 1e-10);
        continue;
      }

      let denomSum = 0;
      for (const j of neighbors.get(i)!) {
        const pairKey = [i, j].sort().join('|');
        const nij = pairGames.get(pairKey) || 0;
        if (nij > 0) {
          denomSum += nij / (pi.get(i)! + pi.get(j)!);
        }
      }

      if (denomSum === 0) {
        newPi.set(i, pi.get(i)!);
        continue;
      }

      const newVal = wi / denomSum;
      newPi.set(i, newVal);

      const change = Math.abs(newVal - pi.get(i)!);
      if (change > maxChange) maxChange = change;
    }

    // Normalize so that geometric mean = 1
    // (log abilities sum to 0)
    let logSum = 0;
    for (const val of newPi.values()) {
      logSum += Math.log(Math.max(val, 1e-20));
    }
    const logMean = logSum / n;
    const normFactor = Math.exp(logMean);

    for (const [id, val] of newPi) {
      pi.set(id, val / normFactor);
    }

    // Check convergence on normalized values
    if (maxChange / normFactor < tolerance) {
      converged = true;
      break;
    }
  }

  // Convert to log-scale abilities (more interpretable)
  const abilities = new Map<string, number>();
  for (const [id, val] of pi) {
    abilities.set(id, Math.log(Math.max(val, 1e-20)));
  }

  // Calculate standard errors from Fisher information
  const standardErrors = calculateFisherSE(pi, pairGames, items);

  // Calculate log-likelihood
  const logLikelihood = calculateLogLikelihood(pi, comparisons);

  return {
    abilities,
    standardErrors,
    iterations,
    converged,
    logLikelihood,
  };
}

/**
 * Calculate standard errors from the Fisher information matrix.
 *
 * For the BT model, the Fisher information for item i is:
 *   I_ii = Σ_{j≠i} n_ij * π_j / (π_i + π_j)^2
 *
 * The SE on the log-scale is:
 *   SE(log π_i) ≈ 1 / sqrt(I_ii * π_i^2)
 *
 * This uses the diagonal of the inverse Fisher information as an approximation.
 */
function calculateFisherSE(
  pi: Map<string, number>,
  pairGames: Map<string, number>,
  items: string[],
): Map<string, number> {
  const se = new Map<string, number>();

  for (const i of items) {
    let fisherInfo = 0;

    for (const j of items) {
      if (i === j) continue;

      const pairKey = [i, j].sort().join('|');
      const nij = pairGames.get(pairKey) || 0;

      if (nij > 0) {
        const piI = pi.get(i) || 1e-10;
        const piJ = pi.get(j) || 1e-10;
        const denom = (piI + piJ) * (piI + piJ);
        fisherInfo += (nij * piJ) / denom;
      }
    }

    if (fisherInfo > 0) {
      const piI = pi.get(i) || 1e-10;
      // SE on log-scale: 1/sqrt(I_ii * pi_i^2)
      se.set(i, 1 / Math.sqrt(fisherInfo * piI * piI));
    } else {
      se.set(i, Infinity);
    }
  }

  return se;
}

/**
 * Calculate the log-likelihood of the BT model given abilities.
 *
 * L = Σ [log(π_winner) - log(π_winner + π_loser)]
 */
function calculateLogLikelihood(
  pi: Map<string, number>,
  comparisons: ComparisonRecord[],
): number {
  let ll = 0;

  for (const comp of comparisons) {
    const piW = pi.get(comp.winnerId) || 1e-10;
    const piL = pi.get(comp.loserId) || 1e-10;
    ll += Math.log(piW) - Math.log(piW + piL);
  }

  return ll;
}

/**
 * Convert BT abilities to win probabilities for a given pair.
 *
 * @param abilityA - Log-ability of item A
 * @param abilityB - Log-ability of item B
 * @returns Probability that A beats B
 */
export function btWinProbability(abilityA: number, abilityB: number): number {
  const diff = abilityA - abilityB;
  // Sigmoid of the difference
  return 1 / (1 + Math.exp(-diff));
}

/**
 * Convert BT abilities to Elo-scale ratings for easier interpretation.
 *
 * Mapping: Elo = 1500 + ability * (400 / ln(10))
 * This ensures that a 400-point Elo difference ≈ 10:1 win ratio,
 * consistent with the standard Elo interpretation.
 *
 * @param ability - BT log-ability parameter
 * @returns Elo-scale rating
 */
export function btAbilityToEloScale(ability: number): number {
  return 1500 + ability * (400 / Math.LN10);
}
