import { exportCandidatePool } from './pool';
import { LifecycleTier, PatternKind, TaskCategory, WorkflowPattern } from './types';

export interface RankedCandidate {
  id: string;
  promotionScore: number;
}

export interface RankResult {
  totalCandidates: number;
  returned: number;
  order: RankedCandidate[];
}

const MAX_PATTERNS = 50;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toPattern(value: unknown, nowIso: string): WorkflowPattern | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.id !== 'string' || record.id.length < 1 || record.id.length > 80) return null;
  const score = typeof record.promotionScore === 'number' && Number.isFinite(record.promotionScore)
    ? Math.max(0, Math.min(record.promotionScore, 1_000_000))
    : 0;
  const seen = typeof record.lastObservedAt === 'string' && !Number.isNaN(Date.parse(record.lastObservedAt))
    ? new Date(record.lastObservedAt).toISOString()
    : new Date(0).toISOString();
  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name.slice(0, 120) : record.id,
    description: '',
    kind: PatternKind.ShortcutCandidate,
    taskCategory: TaskCategory.Productivity,
    tier: LifecycleTier.Candidate,
    tierEnteredAt: nowIso,
    keepClockExpiresAt: null,
    reusabilityCount: 0,
    promotionScore: score,
    lastObservedAt: seen,
    lastExecutedAt: null,
    timesPrompted: 0,
    timesAccepted: 0,
    timesDismissed: 0,
    triggerSignature: { sourceApps: [] },
    createdBy: 'mishmash',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Rank caller-supplied rows with the same decay and capacity rules the
 * Registry candidate export uses. Rows are treated as candidates; this does
 * not read Firestore or execute anything in the payload.
 */
export function rankSuppliedCandidates(payload: unknown, now: Date = new Date()): RankResult | { error: string } {
  const record = asRecord(payload);
  if (!record) return { error: 'rank requires a payload object' };
  if (!Array.isArray(record.patterns)) return { error: 'rank requires payload.patterns' };
  if (record.patterns.length > MAX_PATTERNS) return { error: 'rank accepts at most 50 patterns' };

  const nowIso = now.toISOString();
  const patterns: WorkflowPattern[] = [];
  for (const item of record.patterns) {
    const built = toPattern(item, nowIso);
    if (!built) return { error: 'each pattern needs a string id' };
    patterns.push(built);
  }

  let capacity = Math.max(patterns.length, 1);
  if (typeof record.capacity === 'number' && Number.isFinite(record.capacity)) {
    capacity = Math.max(1, Math.min(MAX_PATTERNS, Math.floor(record.capacity)));
  }

  const exported = exportCandidatePool(patterns, capacity, now);
  return {
    totalCandidates: exported.totalCandidates,
    returned: exported.returned,
    order: exported.candidates.map((item) => ({
      id: item.id,
      promotionScore: item.promotionScore,
    })),
  };
}

export function isRankError(value: RankResult | { error: string }): value is { error: string } {
  return 'error' in value && !('order' in value);
}
