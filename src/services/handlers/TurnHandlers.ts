
import { GameState } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';
import type { EventCollector } from '../EventCollector';

export function handleNothing(_state: GameState, _intent: ActionRequest, _collector: EventCollector): void {
  // no-op
}

export function handleEndTurn(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];
  const hadActions = survivor.actionsRemaining > 0;
  survivor.actionsRemaining = 0;
  survivor.freeMovesRemaining = 0;
  survivor.freeSearchesRemaining = 0;
  survivor.freeCombatsRemaining = 0;
  survivor.freeMeleeRemaining = 0;
  survivor.freeRangedRemaining = 0;
  if (hadActions) {
    collector.emit({
      type: 'SURVIVOR_ACTIONS_REMAINING_CHANGED',
      survivorId: intent.survivorId!,
      newCount: 0,
    });
  }
}
