
import { GameState } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';

export function handleNothing(state: GameState, intent: ActionRequest): GameState {
  return state;
}

export function handleEndTurn(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  survivor.actionsRemaining = 0;
  survivor.freeMovesRemaining = 0;
  survivor.freeSearchesRemaining = 0;
  survivor.freeCombatsRemaining = 0;
  survivor.freeMeleeRemaining = 0;
  survivor.freeRangedRemaining = 0;
  survivor.hitAndRunFreeMove = false;
  return newState;
}
