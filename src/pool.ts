import { applyDecay, boostScoreOnObservation } from './decay';
import { CONSTANTS, LifecycleTier, WorkflowPattern } from './types';

export interface PoolUpdateResult {
  pool: WorkflowPattern[];
  insertedOrUpdated: boolean;
  evicted?: WorkflowPattern;
}

/**
 * Manages the bounded Candidate Promotion Pool using LFU-with-decay.
 */
export class CandidatePool {
  private capacity: number;

  constructor(capacity: number = CONSTANTS.CANDIDATE_POOL_CAPACITY) {
    this.capacity = capacity;
  }

  /**
   * Updates existing candidate or inserts a new one if score beats the weakest occupant.
   */
  public addOrUpdate(
    currentPool: WorkflowPattern[],
    candidate: WorkflowPattern,
    weight: number = 1.0,
    now: Date = new Date()
  ): PoolUpdateResult {
    // 1. Decay all existing candidates up to current time
    const updatedPool = currentPool.map((item) => {
      const decayed = applyDecay(item.promotionScore, item.lastObservedAt, now);
      return {
        ...item,
        promotionScore: decayed,
      };
    });

    const existingIndex = updatedPool.findIndex((item) => item.id === candidate.id);

    // Case A: Existing candidate in pool -> boost score
    if (existingIndex >= 0) {
      const existing = updatedPool[existingIndex];
      const newScore = boostScoreOnObservation(existing.promotionScore, weight);
      updatedPool[existingIndex] = {
        ...existing,
        promotionScore: newScore,
        lastObservedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      return { pool: updatedPool, insertedOrUpdated: true };
    }

    // Prepare new candidate with initial score
    const newCandidateScore = boostScoreOnObservation(candidate.promotionScore || 0, weight);
    const preparedCandidate: WorkflowPattern = {
      ...candidate,
      tier: LifecycleTier.Candidate,
      tierEnteredAt: candidate.tier === LifecycleTier.Candidate ? candidate.tierEnteredAt : now.toISOString(),
      promotionScore: newCandidateScore,
      lastObservedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // Case B: Pool has available capacity
    if (updatedPool.length < this.capacity) {
      return {
        pool: [...updatedPool, preparedCandidate],
        insertedOrUpdated: true,
      };
    }

    // Case C: Pool is full -> find weakest occupant
    let minIndex = 0;
    let minScore = updatedPool[0].promotionScore;

    for (let i = 1; i < updatedPool.length; i++) {
      if (updatedPool[i].promotionScore < minScore) {
        minScore = updatedPool[i].promotionScore;
        minIndex = i;
      }
    }

    // Only evict if the new candidate beats the weakest occupant
    if (newCandidateScore > minScore) {
      const evicted = updatedPool[minIndex];
      const newPool = [...updatedPool];
      newPool[minIndex] = preparedCandidate;
      return {
        pool: newPool,
        insertedOrUpdated: true,
        evicted,
      };
    }

    // Rejected: candidate score did not beat minimum
    return {
      pool: updatedPool,
      insertedOrUpdated: false,
    };
  }

  /**
   * Sorts candidates by decayed score descending.
   */
  public rankCandidates(pool: WorkflowPattern[], now: Date = new Date()): WorkflowPattern[] {
    return [...pool]
      .map((item) => ({
        ...item,
        promotionScore: applyDecay(item.promotionScore, item.lastObservedAt, now),
      }))
      .sort((a, b) => b.promotionScore - a.promotionScore);
  }

  /**
   * Exports the bounded candidate pool, applying recency decay, sorting descending,
   * and slicing strictly to the pool capacity.
   */
  public exportPool(pool: WorkflowPattern[], now: Date = new Date()): CandidatePoolExport {
    const candidates = this.rankCandidates(
      pool.filter((p) => p.tier === LifecycleTier.Candidate),
      now
    ).slice(0, this.capacity);

    return {
      capacity: this.capacity,
      totalCandidates: candidates.length,
      exportedAt: now.toISOString(),
      candidates,
    };
  }
}

export interface CandidatePoolExport {
  capacity: number;
  totalCandidates: number;
  exportedAt: string;
  candidates: WorkflowPattern[];
}

/**
 * Convenience helper to export and rank a bounded candidate pool up to capacity.
 */
export function exportCandidatePool(
  pool: WorkflowPattern[],
  capacity: number = CONSTANTS.CANDIDATE_POOL_CAPACITY,
  now: Date = new Date()
): CandidatePoolExport {
  const candidatePool = new CandidatePool(capacity);
  return candidatePool.exportPool(pool, now);
}
