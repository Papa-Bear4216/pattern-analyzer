import { applyDecay, boostScoreOnObservation, calculateDecayedScore } from './decay';

describe('Decay Engine', () => {
  it('halves the score after one half-life period (30 days)', () => {
    const initialScore = 100;
    const decayed = calculateDecayedScore(initialScore, 30, 30);
    expect(decayed).toBeCloseTo(50, 1);
  });

  it('quarters the score after two half-life periods (60 days)', () => {
    const initialScore = 100;
    const decayed = calculateDecayedScore(initialScore, 60, 30);
    expect(decayed).toBeCloseTo(25, 1);
  });

  it('keeps the score identical when 0 days elapsed', () => {
    const initialScore = 42;
    const decayed = calculateDecayedScore(initialScore, 0, 30);
    expect(decayed).toBe(42);
  });

  it('applies decay based on date differences', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const t1 = new Date('2026-01-31T00:00:00Z'); // 30 days later
    const decayed = applyDecay(80, t0, t1, 30);
    expect(decayed).toBeCloseTo(40, 1);
  });

  it('boosts decayed score upon new observation with logarithmic dampening', () => {
    // Score starts at 0, first observation gets full weight (log1p(0) = 0 => boost = weight)
    const initialBoost = boostScoreOnObservation(0, 2.5);
    expect(initialBoost).toBe(2.5);

    // Rapid successive hit when score is already 10: boost should be logarithmically dampened
    const successiveBoost = boostScoreOnObservation(10, 2.5);
    expect(successiveBoost).toBeLessThan(12.5);
    expect(successiveBoost).toBeCloseTo(10 + 2.5 / (1 + Math.log(11)), 4);
  });

  it('demonstrates diminishing returns on rapid successive observations', () => {
    let score = 0;
    const deltas: number[] = [];
    for (let i = 0; i < 5; i++) {
      const nextScore = boostScoreOnObservation(score, 1.0);
      deltas.push(nextScore - score);
      score = nextScore;
    }
    // Each successive boost delta must be strictly smaller than the previous one
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeLessThan(deltas[i - 1]);
    }
  });
});
