// src/services/DiceService.ts

export interface DiceResult {
  hits: number;
  rolls: number[];
  newSeed: string;
  /** When Lucky reroll was used, the original (discarded) dice rolls */
  luckyOriginal?: number[];
}

// LCG parameters (MINSTD)
const M = 2147483647;
const A = 48271;
const C = 0;

/**
 * Normalizes an arbitrary seed string into a 32-bit integer state.
 * Uses a simple hash (djb2 variation or similar) if not already a number.
 */
function normalizeSeed(seed: string): number {
  // If the seed is a numeric string representation of our internal state, use it directly
  if (/^\d+$/.test(seed)) {
    const num = parseInt(seed, 10);
    if (!isNaN(num) && num > 0 && num < M) {
      return num;
    }
  }

  // Otherwise, hash the string to generate a starting state
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) + seed.charCodeAt(i); /* hash * 33 + c */
  }
  
  // Ensure positive integer within range [1, M-1]
  const result = (h >>> 0) % (M - 1) + 1;
  return result;
}

/**
 * Generates the next random number in the sequence [0, 1).
 * Returns the value and the next state (seed).
 */
export function nextRandom(seed: string): { value: number; nextSeed: string } {
  const state = normalizeSeed(seed);
  const nextState = (A * state + C) % M;
  const value = (nextState - 1) / (M - 1);
  
  return {
    value,
    nextSeed: nextState.toString(),
  };
}

/**
 * Rolls a number of d6 dice against a threshold.
 * 
 * @param currentSeed The current seed string from GameState
 * @param count Number of dice to roll
 * @param threshold The target number (e.g. 4+) for a success
 * @returns {DiceResult} containing hits, individual roll values, and the new seed string
 */
export function rollDice(currentSeed: string, count: number, threshold: number): DiceResult {
  let seed = currentSeed;
  const rolls: number[] = [];
  let hits = 0;

  for (let i = 0; i < count; i++) {
    const { value, nextSeed } = nextRandom(seed);
    seed = nextSeed;
    
    // Map [0, 1) to integer [1, 6]
    const roll = Math.floor(value * 6) + 1;
    rolls.push(roll);

    if (roll >= threshold) {
      hits++;
    }
  }

  return {
    hits,
    rolls,
    newSeed: seed,
  };
}

/**
 * Rolls dice twice and keeps the better result (Lucky skill).
 * Both rolls consume seed state so newSeed always advances by 2*count,
 * preserving deterministic replay regardless of which result is kept.
 */
export function rollDiceWithReroll(currentSeed: string, count: number, threshold: number): DiceResult {
  const first = rollDice(currentSeed, count, threshold);
  const second = rollDice(first.newSeed, count, threshold);
  // Keep the result with more hits; always use the final seed
  if (second.hits >= first.hits) {
    return { ...second, luckyOriginal: first.rolls };
  }
  return { hits: first.hits, rolls: first.rolls, newSeed: second.newSeed, luckyOriginal: second.rolls };
}
