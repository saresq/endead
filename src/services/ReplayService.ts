// src/services/ReplayService.ts

import { type GameState } from '../types/GameState';
import { type ActionRequest, ActionType } from '../types/Action';
import { processAction } from './ActionProcessor';

/**
 * Replays a sequence of actions from an initial state to verify the final state.
 * 
 * @param initialState The pristine starting state of the game (seed must match).
 * @param actionHistory The list of historical actions (log entries) to re-apply.
 * @returns The calculated final GameState.
 */
export function replayGame(
  initialState: GameState, 
  actionHistory: GameState['history']
): GameState {
  // 1. Deep clone the initial state to ensure purity
  let currentState: GameState = structuredClone(initialState);
  
  // Reset history on the replay instance so we don't duplicate the logs
  // (ActionProcessor will generate new logs with new timestamps)
  currentState.history = [];

  // 2. Iterate and apply actions
  for (const logEntry of actionHistory) {
    // Map the history log format back to an ActionRequest
    const intent: ActionRequest = {
      playerId: logEntry.playerId,
      survivorId: logEntry.survivorId,
      type: logEntry.actionType as ActionType,
      payload: logEntry.payload,
    };

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

    currentState = result.newState;
  }

  return currentState;
}

/**
 * Deterministically compares two GameStates for equality.
 * 
 * NOTE: This function deliberately excludes the 'history' property from comparison.
 * Timestamps in the history log will naturally differ between the original run 
 * and the replay run. We strictly compare the resulting game board, entities, 
 * decks, and RNG seed.
 * 
 * @param stateA The original state
 * @param stateB The replayed state
 * @returns { boolean, diff?: string }
 */
export function compareStates(stateA: GameState, stateB: GameState): { equal: boolean; diff?: string } {
  // 1. Strip history for comparison
  const cleanA = removeHistory(stateA);
  const cleanB = removeHistory(stateB);

  // 2. Sort keys to ensure deterministic JSON stringification
  const jsonA = JSON.stringify(sortKeys(cleanA));
  const jsonB = JSON.stringify(sortKeys(cleanB));

  if (jsonA === jsonB) {
    return { equal: true };
  }

  // 3. If different, find a basic diff (first mismatch)
  return {
    equal: false,
    diff: findFirstDiff(cleanA, cleanB),
  };
}

// --- Helpers ---

function removeHistory(state: GameState): Omit<GameState, 'history'> {
  const { history, ...rest } = state;
  return rest;
}

function sortKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }

  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortKeys(obj[key]);
      return acc;
    }, {} as any);
}

function findFirstDiff(objA: any, objB: any, path = ''): string {
  if (objA === objB) return '';
  
  if (typeof objA !== typeof objB) {
    return `Type mismatch at ${path}: ${typeof objA} vs ${typeof objB}`;
  }

  if (typeof objA !== 'object' || objA === null || objB === null) {
    return `Value mismatch at ${path}: ${objA} vs ${objB}`;
  }

  const keysA = Object.keys(objA).sort();
  const keysB = Object.keys(objB).sort();

  if (keysA.length !== keysB.length) {
    // Find missing key
    const missingInB = keysA.find(k => !keysB.includes(k));
    if (missingInB) return `Missing key in State B at ${path}: ${missingInB}`;
    const missingInA = keysB.find(k => !keysA.includes(k));
    if (missingInA) return `Missing key in State A at ${path}: ${missingInA}`;
  }

  for (const key of keysA) {
    const diff = findFirstDiff(objA[key], objB[key], path ? `${path}.${key}` : key);
    if (diff) return diff;
  }

  return '';
}
