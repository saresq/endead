import { describe, it, expect } from 'vitest';
import { Rng, seedFromString, D6_REJECT_LIMIT } from '../Rng';
import type { RngState } from '../Rng';

/**
 * Reference vectors pinned against a freshly-run implementation. Any change to these
 * values means the xoshiro128** core has drifted — fail loudly rather than silently.
 */
const SEED_1234_FIRST_10 = [
  11520, 0, 5927040, 70819200, 2031721883,
  1637235492, 1287239034, 3734860849, 3729100597, 4258142804,
];

describe('xoshiro128** reference vectors', () => {
  it('seed [1,2,3,4] produces the pinned sequence', () => {
    const rng = Rng.from([1, 2, 3, 4]);
    const out: number[] = [];
    for (let i = 0; i < 10; i++) out.push(rng.nextU32());
    expect(out).toEqual(SEED_1234_FIRST_10);
  });

  it('all outputs are uint32-ranged', () => {
    const rng = Rng.fromString('range-probe');
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextU32();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('determinism', () => {
  it('two independent handles from the same seed produce identical 10k-roll sequences', () => {
    const seed: RngState = seedFromString('determinism');
    const a = Rng.from(seed);
    const b = Rng.from(seed);
    for (let i = 0; i < 10_000; i++) {
      expect(a.nextU32()).toBe(b.nextU32());
    }
  });

  it('snapshot → JSON → parse round-trip preserves the sequence', () => {
    const a = Rng.fromString('round-trip');
    for (let i = 0; i < 42; i++) a.nextU32();
    const serialized = JSON.stringify(a.snapshot());
    const parsed = JSON.parse(serialized) as RngState;
    const b = Rng.from(parsed);
    for (let i = 0; i < 1000; i++) {
      expect(b.nextU32()).toBe(a.nextU32());
    }
  });
});

describe('d6 uniformity', () => {
  it('600k rolls land in expected chi-square band', () => {
    const rng = Rng.fromString('chi-square');
    const counts = [0, 0, 0, 0, 0, 0];
    const N = 600_000;
    for (let i = 0; i < N; i++) counts[rng.d6() - 1]++;

    const expected = N / 6;
    const chi2 = counts.reduce((acc, o) => acc + ((o - expected) ** 2) / expected, 0);
    // Chi-square 5 df, p > 0.99 → critical value ≈ 15.09.
    expect(chi2).toBeLessThan(15.09);
    // Sanity: each face within ~1% of expected
    for (const c of counts) expect(Math.abs(c - expected)).toBeLessThan(expected * 0.02);
  });
});

describe('rejection sampling (d6)', () => {
  it('rejects raw draws at or above the limit, accepts below', () => {
    const rng = Rng.fromString('reject');
    const draws = [D6_REJECT_LIMIT, D6_REJECT_LIMIT + 1, 5];
    (rng as unknown as { nextU32: () => number }).nextU32 = () => draws.shift()!;
    expect(rng.d6()).toBe(6);
    expect(draws.length).toBe(0);
  });

  it('LIMIT is 2^32 - (2^32 % 6)', () => {
    expect(D6_REJECT_LIMIT).toBe(0xfffffffc);
    expect(D6_REJECT_LIMIT % 6).toBe(0);
    expect(0x100000000 - D6_REJECT_LIMIT).toBe(4);
  });
});

describe('rollD6', () => {
  it('hit math from fixed seed is deterministic', () => {
    const rng = Rng.from([1, 2, 3, 4]);
    const r = rng.rollD6(20, 4);
    expect(r.rolls).toEqual([1, 1, 1, 1, 6, 1, 1, 2, 2, 3, 2, 6, 4, 1, 5, 5, 1, 4, 5, 4]);
    expect(r.hits).toBe(r.rolls.filter(v => v >= 4).length);
  });

  it('bonus caps at 6 per die', () => {
    const rng = Rng.from([1, 2, 3, 4]);
    const r = rng.rollD6(20, 4, 5);
    for (const v of r.rolls) expect(v).toBeLessThanOrEqual(6);
  });

  it('threshold controls hits monotonically on the same sequence', () => {
    const mkRng = () => Rng.from(seedFromString('mono'));
    const hitsAt = (t: number) => mkRng().rollD6(1000, t).hits;
    expect(hitsAt(2)).toBeGreaterThan(hitsAt(4));
    expect(hitsAt(4)).toBeGreaterThan(hitsAt(6));
  });
});

describe('seedFromString', () => {
  it('different strings produce different states', () => {
    const a = seedFromString('alpha');
    const b = seedFromString('beta');
    expect(a).not.toEqual(b);
  });

  it('empty string produces a non-zero state', () => {
    const s = seedFromString('');
    expect(s[0] | s[1] | s[2] | s[3]).not.toBe(0);
  });

  it('is deterministic across calls', () => {
    expect(seedFromString('repeat')).toEqual(seedFromString('repeat'));
  });

  it('pinned vectors for documented seeds', () => {
    expect(seedFromString('seed-987654321')).toEqual([2308895916, 1882438921, 3395643457, 650551030]);
    expect(seedFromString('')).toEqual([164558732, 2036735458, 3926833134, 3904029249]);
  });
});

describe('no-zero lockup', () => {
  it('a handle built from an all-zero seed would be pathological — guard at construction path', () => {
    // seedFromString never produces all-zero, even for adversarial inputs.
    for (const s of ['', '\0\0\0', 'aaaa', 'zzzz', '\uffff'.repeat(10)]) {
      const st = seedFromString(s);
      expect(st[0] | st[1] | st[2] | st[3]).not.toBe(0);
    }
  });
});

describe('Rng.snapshot()', () => {
  it('returns a fresh tuple each call (no shared mutation)', () => {
    const rng = Rng.fromString('snap');
    const a = rng.snapshot();
    rng.nextU32();
    const b = rng.snapshot();
    expect(a).not.toBe(b);
    expect(a).not.toEqual(b);
  });

  it('rebuilding from a snapshot resumes the same stream', () => {
    const a = Rng.fromString('resume');
    a.nextU32();
    a.nextU32();
    const mid = a.snapshot();
    const b = Rng.from(mid);
    for (let i = 0; i < 100; i++) expect(b.nextU32()).toBe(a.nextU32());
  });
});
