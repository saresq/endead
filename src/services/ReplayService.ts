// src/services/ReplayService.ts

import { type GameState } from '../types/GameState';
import { type ActionRequest } from '../types/Action';
import { processAction } from './ActionProcessor';

/**
 * Replays a sequence of actions from an initial state to verify the final state.
 *
 * SwarmComms §3.5.1: input is now `ActionRequest[]` (`room.actionLog`) rather
 * than the deleted `state.history`. The reconstruction block (history-entry →
 * intent mapping, D8) collapses to a pass-through.
 *
 * @param initialState The pristine starting state of the game (seed must match).
 * @param actionLog The list of accepted intents to re-apply.
 * @returns The calculated final GameState.
 */
export function replayGame(
  initialState: GameState,
  actionLog: ActionRequest[],
): GameState {
  // Deep clone via JSON round-trip so the replay never shares references
  // with the input state. (No structuredClone — D21 acceptance grep.)
  const currentState: GameState = JSON.parse(JSON.stringify(initialState));

  for (const intent of actionLog) {
    const result = processAction(currentState, intent);

    if (!result.success) {
      throw new Error(
        `Replay Divergence Error: Action failed during replay.\n` +
        `Action: ${JSON.stringify(intent)}\n` +
        `Error: ${result.error?.message}`
      );
    }

    if (!result.newState) {
      throw new Error('Replay Error: Action succeeded but returned no state.');
    }
    // Note: with mutation-in-place, result.newState === currentState. The
    // reassignment is harmless and keeps the loop readable.
  }

  return currentState;
}

/**
 * Deterministically compares two GameStates for equality.
 *
 * SwarmComms D9 / D22 allowlist — fields that legitimately diverge between
 * replay and live, stripped before comparison:
 *   - `version` (Step 2; bumps once per accepted action; replay has identical
 *     count by definition, but if the comparison runs at different points the
 *     version differs harmlessly).
 *   - `lastAction.timestamp`, `spawnContext.timestamp` — `Date.now()` capture.
 *   - `_attackIsMelee`, `_extraAPCost` — lifted off `GameState` in Step 3
 *     (no longer present), but stripped defensively in case stale snapshots
 *     are compared.
 *   - `history` — removed in Step 3; not on `GameState` anymore. Stripped
 *     defensively.
 */
export function compareStates(stateA: GameState, stateB: GameState): { equal: boolean; diff?: string } {
  const cleanA = stripVolatileFields(stateA);
  const cleanB = stripVolatileFields(stateB);

  const jsonA = JSON.stringify(sortKeys(cleanA));
  const jsonB = JSON.stringify(sortKeys(cleanB));

  if (jsonA === jsonB) return { equal: true };

  return {
    equal: false,
    diff: findFirstDiff(cleanA, cleanB),
  };
}

// --- Helpers ---

function stripVolatileFields(state: GameState): unknown {
  // Defensive copy via JSON round-trip — we mutate the result.
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(state));
  delete out.version;
  delete out.history;
  delete out._attackIsMelee;
  delete out._extraAPCost;
  const last = out.lastAction as Record<string, unknown> | undefined;
  if (last && typeof last === 'object') delete last.timestamp;
  const ctx = out.spawnContext as Record<string, unknown> | undefined;
  if (ctx && typeof ctx === 'object') delete ctx.timestamp;
  return out;
}

function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortKeys((obj as Record<string, unknown>)[key]);
      return acc;
    }, {} as Record<string, unknown>);
}

function findFirstDiff(objA: unknown, objB: unknown, path = ''): string {
  if (objA === objB) return '';

  if (typeof objA !== typeof objB) {
    return `Type mismatch at ${path}: ${typeof objA} vs ${typeof objB}`;
  }

  if (typeof objA !== 'object' || objA === null || objB === null) {
    return `Value mismatch at ${path}: ${objA} vs ${objB}`;
  }

  const a = objA as Record<string, unknown>;
  const b = objB as Record<string, unknown>;
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();

  if (keysA.length !== keysB.length) {
    const missingInB = keysA.find(k => !keysB.includes(k));
    if (missingInB) return `Missing key in State B at ${path}: ${missingInB}`;
    const missingInA = keysB.find(k => !keysA.includes(k));
    if (missingInA) return `Missing key in State A at ${path}: ${missingInA}`;
  }

  for (const key of keysA) {
    const diff = findFirstDiff(a[key], b[key], path ? `${path}.${key}` : key);
    if (diff) return diff;
  }

  return '';
}
