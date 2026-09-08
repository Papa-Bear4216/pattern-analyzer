import { CONSTANTS } from './types';

/**
 * Calculates exponential decay on a score using the half-life formula:
 * S(t) = S_0 * 2^(-elapsedDays / halfLifeDays)
 */
export function calculateDecayedScore(
  initialScore: number,
  elapsedDays: number,
  halfLifeDays: number = CONSTANTS.SCORE_DECAY_HALF_LIFE_DAYS
): number {
  if (initialScore <= 0 || elapsedDays <= 0) {
    return Math.max(0, initialScore);
  }
  const factor = Math.pow(2, -elapsedDays / halfLifeDays);
  return initialScore * factor;
}

/**
 * Computes elapsed days between two dates and applies exponential decay.
 */
export function applyDecay(
  currentScore: number,
  lastObservedAt: string | Date,
  now: Date = new Date(),
  halfLifeDays: number = CONSTANTS.SCORE_DECAY_HALF_LIFE_DAYS
): number {
  const lastDate = typeof lastObservedAt === 'string' ? new Date(lastObservedAt) : lastObservedAt;
  const elapsedMs = Math.max(0, now.getTime() - lastDate.getTime());
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  return calculateDecayedScore(currentScore, elapsedDays, halfLifeDays);
}

/**
 * Increments an entity's promotion score upon observing a new event,
 * with logarithmic dampening for rapid successive hits.
 * Marginal boost diminishes logarithmically as the score increases:
 * Delta S = weight / (1 + ln(1 + safeScore))
 */
export function boostScoreOnObservation(
  currentDecayedScore: number,
  weight: number = 1.0
): number {
  const safeScore = Math.max(0, currentDecayedScore);
  const dampenedBoost = weight / (1 + Math.log1p(safeScore));
  return safeScore + dampenedBoost;
}
