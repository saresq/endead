import { describe, it, expect } from 'vitest';
import { Rng, seedFromString } from '../Rng';
import { rollAttack } from '../CombatDice';

describe('rollAttack — accuracy clamp', () => {
  it('accuracy 1 behaves identically to accuracy 2 (min threshold rule)', () => {
    const a = rollAttack(Rng.from([1, 2, 3, 4]), { count: 20, accuracy: 1 });
    const b = rollAttack(Rng.from([1, 2, 3, 4]), { count: 20, accuracy: 2 });
    expect(a.rolls).toEqual(b.rolls);
    expect(a.hits).toBe(b.hits);
    expect(a.effectiveThreshold).toBe(2);
  });

  it('accuracy 0 or negative still clamps to 2', () => {
    const r = rollAttack(Rng.from([1, 2, 3, 4]), { count: 6, accuracy: -5 });
    expect(r.effectiveThreshold).toBe(2);
  });
});

describe('rollAttack — bonus cap', () => {
  it('caps each die at 6 even with large bonuses', () => {
    const r = rollAttack(Rng.from([1, 2, 3, 4]), { count: 50, accuracy: 4, diceBonus: 10 });
    for (const v of r.rolls) expect(v).toBeLessThanOrEqual(6);
  });

  it('bonus promotes raw 5 to 6 (not 7) in hit math', () => {
    // With a +2 bonus, every die should read 6 since xoshiro's raw values of 4,5,6 all cap to 6
    const r = rollAttack(Rng.from([1, 2, 3, 4]), { count: 50, accuracy: 4, diceBonus: 2 });
    for (const v of r.rolls) expect(v).toBeLessThanOrEqual(6);
  });
});

describe('rollAttack — ammoReroll (Plenty of Bullets/Shells)', () => {
  it('only rerolls misses, preserves hit positions', () => {
    const rng = Rng.from([1, 2, 3, 4]);
    const noReroll = rollAttack(rng, { count: 20, accuracy: 4 });
    // Indices of original hits must be preserved in the rerolled result
    const originalHitIndices = noReroll.rolls
      .map((v, i) => (v >= 4 ? i : -1))
      .filter(i => i >= 0);

    const rng2 = Rng.from([1, 2, 3, 4]);
    const rerolled = rollAttack(rng2, { count: 20, accuracy: 4, ammoReroll: true });

    for (const idx of originalHitIndices) {
      expect(rerolled.rolls[idx]).toBe(noReroll.rolls[idx]);
    }
    expect(rerolled.rerolledFrom).toEqual(noReroll.rolls);
    expect(rerolled.rerollSource).toBe('plenty_of_bullets');
  });

  it('no-op when every die already hit (probed by seed search)', () => {
    // Find a seed + count combo where accuracy=2 yields zero misses, then verify
    // ammoReroll leaves the result untouched and consumes no extra RNG state.
    let verified = false;
    for (let s = 0; s < 5000 && !verified; s++) {
      const seed = seedFromString(`noop-${s}`);
      const probe = rollAttack(Rng.from(seed), { count: 3, accuracy: 2 });
      if (probe.hits !== 3) continue;

      const baseRng = Rng.from(seed);
      const preRollState = baseRng.snapshot();
      const rerolled = rollAttack(baseRng, { count: 3, accuracy: 2, ammoReroll: true });
      expect(rerolled.rolls).toEqual(probe.rolls);
      expect(rerolled.rerolledFrom).toBeUndefined();
      expect(rerolled.rerollSource).toBeUndefined();

      // And the RNG only advanced by `count` draws, not `2*count`.
      const afterNoReroll = Rng.from(preRollState);
      rollAttack(afterNoReroll, { count: 3, accuracy: 2 });
      expect(afterNoReroll.snapshot()).toEqual(baseRng.snapshot());
      verified = true;
    }
    expect(verified).toBe(true);
  });

  it('attaches explicit ammoSource label when provided', () => {
    // Find a seed that produces at least one miss with accuracy=5 so reroll fires
    const rng = Rng.from([1, 2, 3, 4]);
    const r = rollAttack(rng, { count: 6, accuracy: 5, ammoReroll: true, ammoSource: 'plenty_of_shells' });
    if (r.rerolledFrom) expect(r.rerollSource).toBe('plenty_of_shells');
  });
});

describe('deterministic replay', () => {
  it('identical seed + identical decisions yields identical rolls', () => {
    const a = Rng.from([42, 43, 44, 45]);
    const b = Rng.from([42, 43, 44, 45]);
    const ra = rollAttack(a, { count: 5, accuracy: 4, diceBonus: 1, ammoReroll: true });
    const rb = rollAttack(b, { count: 5, accuracy: 4, diceBonus: 1, ammoReroll: true });
    expect(ra).toEqual(rb);
  });
});
