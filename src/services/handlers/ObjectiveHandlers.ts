
import { GameState, ObjectiveType, Objective, EquipmentCard } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { XPManager } from '../XPManager';
import { DeckService } from '../DeckService';

export function handleTakeObjective(state: GameState, intent: ActionRequest): GameState {
  let newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];

  if (!zone.hasObjective) {
    throw new Error('No objective in this zone');
  }

  // Remove objective token
  zone.hasObjective = false;

  // RULEBOOK §9: taking a Blue/Green Objective activates every matching-color
  // spawn zone. They begin spawning at the next Zombie Phase.
  const objColor = zone.objectiveColor;
  if (objColor === 'blue' || objColor === 'green') {
    for (const z of Object.values(newState.zones)) {
      if (z.spawnPoint && (z.spawnColor === objColor) && !z.activated) {
        z.activateNextPhase = true;
      }
    }
  }

  // Epic Weapon Crate: grant a random Epic weapon. Free reorganize is covered
  // by ActionProcessor routing: ORGANIZE is free while `drawnCard` is set.
  if (zone.isEpicCrate) {
    if (!newState.epicDeck) {
      const init = DeckService.initializeEpicDeck(newState.seed);
      newState.epicDeck = init.deck;
      newState.seed = init.newSeed;
    }
    const draw = DeckService.drawEpicCard(newState);
    newState = draw.newState;
    const epicCard: EquipmentCard | null = draw.card;
    if (epicCard) {
      const s = newState.survivors[intent.survivorId!];
      if (!s.drawnCard) s.drawnCard = epicCard;
      else (s.drawnCardsQueue ||= []).push(epicCard);
    }
    zone.isEpicCrate = false;
  }

  // Grant XP (use objective-specific value or default 5)
  const matchingObj = (newState.objectives || []).find(
    (obj: Objective) => obj.type === ObjectiveType.TakeObjective && !obj.completed
  );
  const xpReward = matchingObj?.xpValue ?? 5;
  newState.survivors[intent.survivorId!] = XPManager.addXP(newState.survivors[intent.survivorId!], xpReward);

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
