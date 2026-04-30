
import { GameState, ObjectiveType, Objective, ObjectiveColor } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { XPManager } from '../XPManager';

export function handleTakeObjective(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];

  if (!zone.hasObjective) {
    throw new Error('No objective in this zone');
  }

  // Color of the token being taken. Default to Yellow for legacy compatibility
  // (compiled zones from v1 maps without explicit objectiveColor).
  const color: ObjectiveColor = zone.objectiveColor ?? ObjectiveColor.Yellow;

  // Remove objective token
  zone.hasObjective = false;
  zone.objectiveColor = undefined;

  // Per RULEBOOK §11: all non-Epic Objective tokens (yellow, blue, green) grant
  // 5 XP. Honour an objective's xpValue override if one is set on a matching
  // counter; otherwise default to 5.
  let xpReward = 5;
  const matchingObj = (newState.objectives || []).find((obj: Objective) => {
    if (obj.completed) return false;
    if (color === ObjectiveColor.Yellow) return obj.type === ObjectiveType.TakeObjective;
    return obj.type === ObjectiveType.TakeColorObjective && obj.objectiveColor === color;
  });
  if (matchingObj?.xpValue !== undefined) xpReward = matchingObj.xpValue;
  newState.survivors[intent.survivorId!] = XPManager.addXP(survivor, xpReward);

  // Update Objectives Progress — increment whichever counter matches the color.
  if (newState.objectives) {
      newState.objectives.forEach((obj: Objective) => {
          if (obj.completed) return;
          if (color === ObjectiveColor.Yellow && obj.type === ObjectiveType.TakeObjective) {
              obj.amountCurrent += 1;
              if (obj.amountCurrent >= obj.amountRequired) obj.completed = true;
          } else if (
              obj.type === ObjectiveType.TakeColorObjective &&
              obj.objectiveColor === color
          ) {
              obj.amountCurrent += 1;
              if (obj.amountCurrent >= obj.amountRequired) obj.completed = true;
          }
      });
  }

  // Color activation side effect (Blue/Green only). Idempotent: re-taking a
  // same-color Objective does not reset `activatedOnTurn`. Rollback note: this
  // mutation is intentionally NOT captured by the Lucky reroll snapshot — color
  // activation is taken via TAKE_OBJECTIVE, not ATTACK, so it is not reachable
  // from `handleRerollLucky`.
  let colorActivated: ObjectiveColor | undefined;
  if (color === ObjectiveColor.Blue || color === ObjectiveColor.Green) {
    const act = newState.spawnColorActivation[color];
    if (!act.activated) {
      newState.spawnColorActivation[color] = {
        activated: true,
        activatedOnTurn: newState.turn,
      };
      colorActivated = color;
    }
  }

  newState.lastAction = {
    type: ActionType.TAKE_OBJECTIVE,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: `Took ${color.toLowerCase()} Objective (+${xpReward} XP)`,
    ...(colorActivated ? { colorActivated } : {}),
  };

  newState.history.push({
      playerId: intent.playerId,
      survivorId: intent.survivorId || 'system',
      actionType: ActionType.TAKE_OBJECTIVE,
      timestamp: Date.now(),
      payload: { zoneId: zone.id, color, ...(colorActivated ? { colorActivated } : {}) },
  });

  return newState;
}
