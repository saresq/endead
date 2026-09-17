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
  /** Roll 6: +1 Die — each 6 grants another die, rolled after any re-roll. */
  explodeOnSix?: boolean;
}

/** Guard against a pathological chain when every die keeps showing a 6. */
const MAX_EXPLOSIONS = 50;

/** Minimum accuracy per Zombicide 2E — auto-hits on any face are never allowed. */
const MIN_THRESHOLD = 2;

function clampThreshold(raw: number): number {
  return Math.max(MIN_THRESHOLD, raw);
}

function countHits(rolls: number[], threshold: number): number {
  let h = 0;
  for (const r of rolls) if (r >= threshold) h++;
  return h;
}

/**
 * Roll an attack with the full pipeline: accuracy clamp → initial roll → optional
 * ammo-reroll on misses. A Lucky reroll is a fresh call from the restored
 * pre-attack state, so it stays a player-initiated decision.
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

  // Roll 6: +1 Die — "keep rolling as long as 6s appear", after re-rolls
  // (rules/14-skills.md#roll-6-1-die-action). A die that reaches 6 through `diceBonus` counts too:
  // the skill reads the result on the table.
  if (opts.explodeOnSix) {
    let pending = rolls.filter(r => r === 6).length;
    let rolled = 0;
    while (pending > 0 && rolled < MAX_EXPLOSIONS) {
      const extra = rng.rollD6(Math.min(pending, MAX_EXPLOSIONS - rolled), threshold, bonus);
      rolled += extra.rolls.length;
      rolls = rolls.concat(extra.rolls);
      pending = extra.rolls.filter(r => r === 6).length;
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
