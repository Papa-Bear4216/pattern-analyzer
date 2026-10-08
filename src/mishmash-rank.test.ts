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

  it('rejects a payload that is not a pattern list or event list', () => {
    const ranked = rankSuppliedCandidates({ patterns: [{ promotionScore: 1 }] }, now);
    expect(isRankError(ranked)).toBe(true);
  });

  it('clusters ambient telemetry events by package and ranks them', () => {
    const events = [
      { package: 'com.android.chrome', app_label: 'Chrome', timestamp: '2026-10-07T12:00:00.000Z' },
      { package: 'com.android.chrome', app_label: 'Chrome', timestamp: '2026-10-07T13:00:00.000Z' },
      { package: 'com.google.android.keep', app_label: 'Keep', timestamp: '2026-10-07T11:00:00.000Z' },
    ];
    const ranked = rankSuppliedCandidates({ events }, now);
    expect(isRankError(ranked)).toBe(false);
    if (isRankError(ranked)) return;
    expect(ranked.returned).toBe(2);
    expect(ranked.order[0].id).toBe('cluster-com.android.chrome');
    expect(ranked.order[1].id).toBe('cluster-com.google.android.keep');
  });
});
