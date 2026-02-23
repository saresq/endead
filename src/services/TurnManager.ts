
import { GamePhase, type GameState } from '../types/GameState';
import type { ActionRequest, ActionError } from '../types/Action';

/**
 * Validates if an action request is permissible under the current game state.
 * Returns null if valid, or an ActionError if invalid.
 */
export function validateTurn(state: GameState, request: ActionRequest): ActionError | null {
  // 1. Check Game Phase
  if (state.phase !== GamePhase.Players) {
    return {
      code: 'INVALID_PHASE',
      message: `Cannot perform actions during ${state.phase} phase. Wait for Players phase.`,
    };
  }

  // 2. Check Active Player (Turn Lock)
  const activePlayerId = state.players[state.activePlayerIndex];
  if (request.playerId !== activePlayerId) {
    return {
      code: 'NOT_YOUR_TURN',
      message: `It is currently ${activePlayerId}'s turn. You are ${request.playerId}.`,
    };
  }

  // 3. Check Survivor Ownership
  if (request.survivorId) {
      const survivor = state.survivors[request.survivorId];
      if (!survivor) {
        return {
          code: 'SURVIVOR_NOT_FOUND',
          message: `Survivor ${request.survivorId} not found.`,
        };
      }
      
      if (survivor.playerId !== request.playerId) {
        return {
          code: 'NOT_OWNER',
          message: `You do not control survivor ${survivor.name}.`,
        };
      }

      // 4. Check Action Economy
      if (survivor.actionsRemaining <= 0) {
        return {
          code: 'NO_ACTIONS',
          message: `Survivor ${survivor.name} has no actions remaining.`,
        };
      }
  }

  return null;
}

/**
 * Advances the turn state after a successful action.
 * Handles:
 * - Decrementing action points
 * - Auto-ending player turn if all survivors are exhausted
 * - Auto-advancing to Zombie phase if all players are done
 */
export function advanceTurnState(state: GameState, survivorId: string): GameState {
  // Create a shallow copy of the state to modify
  const newState: GameState = { ...state };
  
  // 1. Decrement Actions
  // Clone survivors map and the specific survivor to avoid mutation
  const newSurvivors = { ...newState.survivors };
  const survivor = { ...newSurvivors[survivorId] };
  
  // Ensure we don't go below 0, though validation should prevent this
  survivor.actionsRemaining = Math.max(0, survivor.actionsRemaining - 1);
  newSurvivors[survivorId] = survivor;
  newState.survivors = newSurvivors;

  // 2. Check for Turn End (Auto-Pass)
  const activePlayerId = newState.players[newState.activePlayerIndex];
  
  // Find all survivors belonging to the active player
  const playerSurvivors = Object.values(newState.survivors).filter(
    (s) => s.playerId === activePlayerId
  );

  // Check if ANY survivor has actions remaining
  const hasActionsLeft = playerSurvivors.some((s) => s.actionsRemaining > 0);

  if (!hasActionsLeft) {
    // Player is done, move to next player
    newState.activePlayerIndex++;

    // 3. Check for Phase Change (End of Round)
    if (newState.activePlayerIndex >= newState.players.length) {
      newState.activePlayerIndex = 0;
      newState.phase = GamePhase.Zombies;
      // Note: Turn counter usually increments at the START of a new Players phase
    }
  }

  return newState;
}

/**
 * Helper to check if the current phase allows player actions
 */
export function canAct(state: GameState, playerId: string): boolean {
  return (
    state.phase === GamePhase.Players &&
    state.players[state.activePlayerIndex] === playerId
  );
}
