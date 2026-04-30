
import { GameState } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';

export function handleNothing(state: GameState, intent: ActionRequest): GameState {
  return state;
}

export function handleEndTurn(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const activePlayerId = newState.players[newState.activePlayerIndex];

  // Clear every blocker for the active player so the turn always advances,
  // regardless of remaining actions, free moves, drawn cards, or open trades.
  for (const survivor of Object.values(newState.survivors)) {
    if (survivor.playerId !== activePlayerId) continue;
    survivor.actionsRemaining = 0;
    survivor.freeMovesRemaining = 0;
    survivor.freeSearchesRemaining = 0;
    survivor.freeCombatsRemaining = 0;
    survivor.freeMeleeRemaining = 0;
    survivor.freeRangedRemaining = 0;
    survivor.hitAndRunFreeMove = false;
    if (survivor.drawnCard) {
      newState.equipmentDiscard.push(survivor.drawnCard);
      survivor.drawnCard = undefined;
    }
  }

  if (newState.activeTrade) {
    delete newState.activeTrade;
  }

  return newState;
}
