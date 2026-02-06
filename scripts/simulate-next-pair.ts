/**
 * Simulate what the next-pair API returns for the IzVRS study
 * to verify voting targets are correct.
 */
import { calculateRecommendedComparisons } from '../src/lib/matchmaking';

console.log('=== VOTING TARGETS PER CATEGORY ===');
console.log(`3. razredi (49 items): ${calculateRecommendedComparisons(49, 5)} comparisons`);
console.log(`4. razredi (29 items): ${calculateRecommendedComparisons(29, 5)} comparisons`);
console.log(`5. razredi (50 items): ${calculateRecommendedComparisons(50, 5)} comparisons`);
console.log(`\nTotal per reviewer: ${calculateRecommendedComparisons(49, 5) + calculateRecommendedComparisons(29, 5) + calculateRecommendedComparisons(50, 5)}`);
