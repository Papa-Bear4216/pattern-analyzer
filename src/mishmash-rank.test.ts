import { isRankError, rankSuppliedCandidates } from './mishmash-rank';

describe('mishmash rank', () => {
  const now = new Date('2026-10-08T00:00:00.000Z');
  const patterns = [
    { id: 'low', promotionScore: 1, lastObservedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'high', promotionScore: 10, lastObservedAt: '2026-10-01T00:00:00.000Z' },
  ];

  it('orders candidates by decayed score', () => {
    const ranked = rankSuppliedCandidates({ patterns }, now);
    expect(isRankError(ranked)).toBe(false);
    if (isRankError(ranked)) return;
    expect(ranked.order.map((item) => item.id)).toEqual(['high', 'low']);
    expect(ranked.returned).toBe(2);
  });

  it('rejects a payload that is not a pattern list', () => {
    const ranked = rankSuppliedCandidates({ patterns: [{ promotionScore: 1 }] }, now);
    expect(isRankError(ranked)).toBe(true);
  });
});
