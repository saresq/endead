
import { GameState, ObjectiveType, Objective, EquipmentCard } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';
import { XPManager } from '../XPManager';
import { DeckService } from '../DeckService';
import type { EventCollector } from '../EventCollector';
import { handleAaahhTrap } from './ItemHandlers';

export function handleTakeObjective(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];
  const zone = state.zones[survivor.position.zoneId];
  const zoneId = zone.id;

  // --- Validate-first (SwarmComms §3.10 rule 1: throw before any mutation/emit) ---
  if (!zone.hasObjective) {
    throw new Error('No objective in this zone');
  }

  // Match XP to the specific token that was taken (by zoneId, with color as a
  // tiebreaker when multiple objectives sit in the same zone). No silent
  // fallback — a missing match indicates a misconfigured scenario.
  const candidates = (state.objectives || []).filter(
    (obj: Objective) =>
      obj.type === ObjectiveType.TakeObjective &&
      !obj.completed &&
      obj.zoneId === zoneId,
  );
  let matchingObj: Objective | undefined;
  if (candidates.length === 1) {
    matchingObj = candidates[0];
  } else if (candidates.length > 1) {
    const colorId = (intent.payload as { objectiveId?: string; color?: string } | undefined)?.objectiveId
      ?? (intent.payload as { objectiveId?: string; color?: string } | undefined)?.color;
    matchingObj = candidates.find(c => c.id === colorId) ?? candidates[0];
  }
  if (!matchingObj) {
    throw new Error(`No matching TakeObjective in zone ${zoneId}`);
  }
  if (typeof matchingObj.xpValue !== 'number') {
    throw new Error(`Objective ${matchingObj.id} has no xpValue`);
  }

  // --- Mutations + emits ---
  const objColor = zone.objectiveColor;
  const isEpicCrate = !!zone.isEpicCrate;

  // Take the objective token
  zone.hasObjective = false;
  collector.emit({
    type: 'OBJECTIVE_TAKEN',
    objectiveId: `${zoneId}-objective`,
    survivorId: intent.survivorId!,
    zoneId,
  });

  // Activate matching-color spawn zones (Blue/Green only — red is always active)
  if (objColor === 'blue' || objColor === 'green') {
    for (const z of Object.values(state.zones)) {
      if (z.spawnPoint && (z.spawnColor === objColor) && !z.activated) {
        z.activateNextPhase = true;
        collector.emit({
          type: 'ZONE_SPAWN_POINT_ACTIVATED',
          zoneId: z.id,
        });
      }
    }
  }

  // Epic Weapon Crate: pull a random Epic weapon into the picker.
  if (isEpicCrate) {
    if (!state.epicDeck) {
      const init = DeckService.initializeEpicDeck(state.seed);
      state.epicDeck = init.deck;
      state.seed = init.newSeed;
    }
    const epicCard: EquipmentCard | null = DeckService.drawEpicCard(state);
    // A null draw means the Epic deck ran dry mid-scenario. The map editor
    // should cap Epic Crate objectives at the Epic deck size; until that
    // constraint is enforced, surface an event so the client can show a
    // "deck exhausted" toast rather than silently dropping the reward.
    if (!epicCard) {
      collector.emit({
        type: 'EPIC_DECK_EXHAUSTED',
        zoneId,
        survivorId: intent.survivorId!,
      });
    } else {
      if (epicCard.keywords?.includes('aaahh')) {
        // Epic Aaahh!! trap: spawn a Walker, discard the card, never enter picker.
        // EPIC_CRATE_OPENED still fires — the crate was opened, the reward was a trap.
        handleAaahhTrap(state, intent.survivorId!, epicCard, collector);
        collector.emit({
          type: 'EPIC_CRATE_OPENED',
          zoneId,
          survivorId: intent.survivorId!,
          cardId: epicCard.id,
        });
      } else {
        const s = state.survivors[intent.survivorId!];
        if (!s.drawnCard) s.drawnCard = epicCard;
        else (s.drawnCardsQueue ||= []).push(epicCard);
        collector.emit({
          type: 'EPIC_CRATE_OPENED',
          zoneId,
          survivorId: intent.survivorId!,
          cardId: epicCard.id,
        });
        collector.emitPrivate(
          {
            type: 'CARD_DRAWN',
            survivorId: intent.survivorId!,
            card: epicCard,
          },
          [intent.survivorId!],
        );
      }
    }
    zone.isEpicCrate = false;
  }

  const xpReward = matchingObj.xpValue;
  state.survivors[intent.survivorId!] = XPManager.addXP(state.survivors[intent.survivorId!], xpReward);
  collector.emit({
    type: 'SURVIVOR_XP_GAINED',
    survivorId: intent.survivorId!,
    amount: xpReward,
    newTotal: state.survivors[intent.survivorId!].experience,
  });

  // Update the single matched objective, not every unmatched TakeObjective.
  matchingObj.amountCurrent += 1;
  collector.emit({
    type: 'OBJECTIVE_PROGRESS_UPDATED',
    objectiveId: matchingObj.id,
    amountCurrent: matchingObj.amountCurrent,
    amountRequired: matchingObj.amountRequired,
  });
  if (matchingObj.amountCurrent >= matchingObj.amountRequired) {
    matchingObj.completed = true;
    collector.emit({
      type: 'OBJECTIVE_COMPLETED',
      objectiveId: matchingObj.id,
    });
  }
}
