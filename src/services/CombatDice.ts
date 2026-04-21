// src/services/CombatDice.ts
//
// Combat dice pipeline. Single entry point for attack rolls so callers can't
// accidentally skip the accuracy clamp, ammo reroll ordering, or bonus-cap.

import { Rng } from './Rng';

export type RerollSource = 'lucky' | 'plenty_of_bullets' | 'plenty_of_shells';

export interface AttackRollResult {
  /** Final per-die results (post-bonus, post-reroll). */
  rolls: number[];
  /** Count of `rolls` that met or exceeded the effective threshold. */
  hits: number;
  /** Original dice before any reroll, preserved for UI display. */
  rerolledFrom?: number[];
  /** Which reroll mechanic produced `rerolledFrom`. */
  rerollSource?: RerollSource;
  /** Clamped accuracy used for the hit check. */
  effectiveThreshold: number;
}

export interface AttackOptions {
  count: number;
  /** Raw weapon accuracy — will be clamped to ≥ 2 per rulebook §4/§10. */
  accuracy: number;
  /** Per-die flat bonus (e.g. Elle's +1 Ranged). Capped at 6 per die. */
  diceBonus?: number;
  /** True if the shooter carries Plenty of Bullets/Shells matching the weapon ammo type. */
  ammoReroll?: boolean;
  /** Reroll source label to attach if ammoReroll fires. */
  ammoSource?: Exclude<RerollSource, 'lucky'>;
}

/** Minimum accuracy per Zombicide 2E — auto-hits on any face are never allowed. */
const MIN_THRESHOLD = 2;
/** Upper clamp preserves "a natural 6 always hits" even if weapon data ships > 6. */
const MAX_THRESHOLD = 6;

function clampThreshold(raw: number): number {
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, raw));
}

function countHits(rolls: number[], threshold: number): number {
  let h = 0;
  for (const r of rolls) if (r >= threshold) h++;
  return h;
}

/**
 * Roll an attack with the full pipeline: accuracy clamp → initial roll → optional
 * ammo-reroll on misses. Lucky is handled separately via `applyLuckyReroll` so it
 * stays a player-initiated decision (rule-faithful: commit to the new result).
 */
export function rollAttack(rng: Rng, opts: AttackOptions): AttackRollResult {
  const threshold = clampThreshold(opts.accuracy);
  const bonus = opts.diceBonus ?? 0;

  const first = rng.rollD6(opts.count, threshold, bonus);
  let rolls = first.rolls;

  let rerolledFrom: number[] | undefined;
  let rerollSource: RerollSource | undefined;

  if (opts.ammoReroll) {
    const missIndices: number[] = [];
    for (let i = 0; i < rolls.length; i++) if (rolls[i] < threshold) missIndices.push(i);

    if (missIndices.length > 0) {
      const reroll = rng.rollD6(missIndices.length, threshold, bonus);
      const preRerollRolls = rolls.slice();
      const next = rolls.slice();
      for (let k = 0; k < missIndices.length; k++) next[missIndices[k]] = reroll.rolls[k];
      rolls = next;
      rerolledFrom = preRerollRolls;
      rerollSource = opts.ammoSource ?? 'plenty_of_bullets';
    }
  }

  return {
    rolls,
    hits: countHits(rolls, threshold),
    rerolledFrom,
    rerollSource,
    effectiveThreshold: threshold,
  };
}

/**
 * Apply a player-initiated Lucky reroll. Produces a fresh full-count roll that
 * REPLACES the prior result, even if worse. `prev.rolls` is preserved in
 * `rerolledFrom` for the combat log; any ammo reroll that happened on the prior
 * attempt is discarded along with it.
 */
export function applyLuckyReroll(
  rng: Rng,
  prev: AttackRollResult,
  opts: { accuracy: number; diceBonus?: number; ammoReroll?: boolean; ammoSource?: Exclude<RerollSource, 'lucky'> },
): AttackRollResult {
  const fresh = rollAttack(rng, {
    count: prev.rolls.length,
    accuracy: opts.accuracy,
    diceBonus: opts.diceBonus,
    ammoReroll: opts.ammoReroll,
    ammoSource: opts.ammoSource,
  });

  return {
    rolls: fresh.rolls,
    hits: fresh.hits,
    rerolledFrom: prev.rolls,
    rerollSource: 'lucky',
    effectiveThreshold: fresh.effectiveThreshold,
  };
}
