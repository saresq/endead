// src/services/Rng.ts
//
// xoshiro128** deterministic PRNG for Endead.
// Passes BigCrush and PractRand to 32 TB. Pure 32-bit operations — no BigInt.
// Reference: Blackman & Vigna, 2018 (https://prng.di.unimi.it/xoshiro128starstar.c)

/** Immutable 4×uint32 state tuple. */
export type RngState = readonly [number, number, number, number];

const MUL_U32 = (a: number, b: number): number => Math.imul(a, b) >>> 0;
const ROTL = (x: number, k: number): number => (((x << k) | (x >>> (32 - k))) >>> 0);

/** Advance the state tuple by one step and return [newState, rawU32]. Pure. */
function step(s: RngState): { state: RngState; value: number } {
  const s0 = s[0] >>> 0;
  let s1 = s[1] >>> 0;
  let s2 = s[2] >>> 0;
  let s3 = s[3] >>> 0;

  const result = MUL_U32(ROTL(MUL_U32(s1, 5), 7), 9);

  const t = (s1 << 9) >>> 0;
  s2 = (s2 ^ s0) >>> 0;
  s3 = (s3 ^ s1) >>> 0;
  s1 = (s1 ^ s2) >>> 0;
  const ns0 = (s0 ^ s3) >>> 0;
  s2 = (s2 ^ t) >>> 0;
  s3 = ROTL(s3, 11);

  return { state: [ns0, s1, s2, s3] as const, value: result };
}

/**
 * Counter-mode SplitMix32: advance the counter by the golden-ratio constant and hash
 * the result through SplitMix32's finalizer. Used only during `seedFromString` to
 * decorrelate four consecutive 32-bit words of initial state.
 */
function splitmixStep(counter: number): { nextCounter: number; value: number } {
  const next = (counter + 0x9e3779b9) >>> 0;
  let z = next;
  z = MUL_U32(z ^ (z >>> 16), 0x85ebca6b);
  z = MUL_U32(z ^ (z >>> 13), 0xc2b2ae35);
  z = (z ^ (z >>> 16)) >>> 0;
  return { nextCounter: next, value: z };
}

/**
 * Deterministically expand an arbitrary string into a valid RngState.
 * Uses FNV-1a to fold the string into 32 bits, then SplitMix32 to expand.
 * Guarantees non-zero output (all-zero state is forbidden for xoshiro*).
 */
export function seedFromString(s: string): RngState {
  let h = 0x811c9dc5; // FNV-1a offset
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = MUL_U32(h, 0x01000193);
  }
  if (h === 0) h = 0xdeadbeef;

  let counter = h;
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = splitmixStep(counter);
    counter = r.nextCounter;
    out.push(r.value);
  }

  // Guard against all-zero state (vanishingly unlikely, but required by the algorithm).
  if ((out[0] | out[1] | out[2] | out[3]) === 0) {
    out[0] = 1;
  }
  return [out[0] >>> 0, out[1] >>> 0, out[2] >>> 0, out[3] >>> 0] as const;
}

/** Rejection-sampling limit so that [0, LIMIT) is evenly divisible by 6. */
export const D6_REJECT_LIMIT = 0xfffffffc; // 2^32 - (2^32 % 6) = 4294967292

/** Handle-based RNG wrapping an immutable RngState. Deterministic + serializable. */
export class Rng {
  private s: RngState;

  private constructor(state: RngState) {
    this.s = state;
  }

  static from(state: RngState): Rng {
    return new Rng([state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0] as const);
  }

  static fromString(seed: string): Rng {
    return new Rng(seedFromString(seed));
  }

  /** Current state snapshot — safe to persist into GameState. */
  snapshot(): RngState {
    return [this.s[0], this.s[1], this.s[2], this.s[3]] as const;
  }

  /** Next raw uint32. */
  nextU32(): number {
    const r = step(this.s);
    this.s = r.state;
    return r.value;
  }

  /** Uniform integer in [0, n). Uses rejection sampling for exact uniformity. */
  nextInt(n: number): number {
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`nextInt: n must be a positive integer, got ${n}`);
    }
    const bound = Math.floor(0x100000000 / n) * n;
    let u: number;
    do { u = this.nextU32(); } while (u >= bound);
    return u % n;
  }

  /** Uniform d6 roll in [1, 6] via rejection sampling. */
  d6(): number {
    let u: number;
    do { u = this.nextU32(); } while (u >= D6_REJECT_LIMIT);
    return (u % 6) + 1;
  }

  /**
   * Roll `count` d6 against `threshold`. Per-die flat `bonus` is applied then capped at 6
   * (matches the physical game — a 5 + 1 bonus still reads as a 6).
   */
  rollD6(count: number, threshold: number, bonus = 0): { hits: number; rolls: number[] } {
    const rolls: number[] = [];
    let hits = 0;
    for (let i = 0; i < count; i++) {
      const raw = this.d6();
      const roll = Math.min(6, raw + bonus);
      rolls.push(roll);
      if (roll >= threshold) hits++;
    }
    return { hits, rolls };
  }
}
