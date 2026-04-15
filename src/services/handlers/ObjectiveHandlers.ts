
import { GameState, ObjectiveType, Objective } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { XPManager } from '../XPManager';

export function handleTakeObjective(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];

  if (!zone.hasObjective) {
    throw new Error('No objective in this zone');
  }

  // Remove objective token
  zone.hasObjective = false;

  // Grant XP (use objective-specific value or default 5)
  const matchingObj = (newState.objectives || []).find(
    (obj: Objective) => obj.type === ObjectiveType.TakeObjective && !obj.completed
  );
  const xpReward = matchingObj?.xpValue ?? 5;
  newState.survivors[intent.survivorId!] = XPManager.addXP(survivor, xpReward);

  // Update Objectives Progress
  if (newState.objectives) {
      newState.objectives.forEach((obj: Objective) => {
          if (obj.type === ObjectiveType.TakeObjective && !obj.completed) {
              obj.amountCurrent += 1;
              if (obj.amountCurrent >= obj.amountRequired) {
                  obj.completed = true;
              }
          }
      });
  }

  newState.history.push({
      playerId: intent.playerId,
      survivorId: intent.survivorId || 'system',
      actionType: ActionType.TAKE_OBJECTIVE,
      timestamp: Date.now(),
      payload: { zoneId: zone.id }
  });

  return newState;
}
