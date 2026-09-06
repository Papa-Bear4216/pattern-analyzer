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

  it('boosts decayed score upon new observation', () => {
    const boosted = boostScoreOnObservation(10, 2.5);
    expect(boosted).toBe(12.5);
  });
});
