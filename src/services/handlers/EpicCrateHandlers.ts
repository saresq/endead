import { GameState, ObjectiveType, Objective } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { Rng } from '../Rng';

/**
 * TAKE_EPIC_CRATE handler. Triggered when a survivor occupies a zone with a
 * red Epic Weapon Crate token and chooses to take it.
 *
 * Per RULEBOOK §14 / plan §4.3:
 *  1. Validate the zone has an Epic Crate.
 *  2. Draw the top card from `epicDeck` (reshuffle from `epicDiscard` if empty).
 *  3. Place it in `survivor.drawnCard` so the existing search-resolution UI
 *     opens in "reorganize" mode — the player picks a slot for the new
 *     weapon and freely shuffles the rest of their inventory in the same
 *     modal. The Reorganize is free (no AP cost) — same exemption as
 *     ORGANIZE during a search resolution at ActionProcessor.ts:175-177.
 *  4. Increment all open `TakeEpicCrate` objective counters.
 *  5. Do NOT award 5 XP — Epic Crates grant the weapon, not standard AP.
 */
export function handleTakeEpicCrate(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  if (!survivor) throw new Error('Survivor not found');

  const zone = newState.zones[survivor.position.zoneId];
  if (!zone?.hasEpicCrate) throw new Error('No Epic Crate in this zone');

  // The drawnCard staging slot must be free — otherwise the survivor has an
  // unresolved search and can't take a new card.
  if (survivor.drawnCard) throw new Error('Resolve pending card before taking Epic Crate');

  // Draw the top epic card (reshuffle from epicDiscard if empty).
  if (newState.epicDeck.length === 0 && newState.epicDiscard.length > 0) {
    const rng = Rng.from(newState.seed);
    // Fisher–Yates shuffle of epicDiscard back into epicDeck.
    const shuffled = [...newState.epicDiscard];
    for (let m = shuffled.length - 1; m > 0; m--) {
      const i = rng.nextInt(m + 1);
      const t = shuffled[m];
      shuffled[m] = shuffled[i];
      shuffled[i] = t;
    }
    newState.epicDeck = shuffled;
    newState.epicDiscard = [];
    newState.seed = rng.snapshot();
  }

  const card = newState.epicDeck.shift();
  if (!card) {
    // Both deck and discard empty — should not occur because EPIC_CRATE_LIMIT
    // clamps editor placements at the deck size, but guard explicitly so a
    // misconfigured map fails loudly.
    throw new Error('Epic deck empty — cannot draw a weapon for the crate');
  }

  // Stage the new card so the existing drawnCard UI lets the player slot it
  // and freely reorganize the rest of the inventory.
  survivor.drawnCard = card;

  // Remove the Epic Crate token from the zone.
  zone.hasEpicCrate = false;

  // Increment all open TakeEpicCrate counters.
  if (newState.objectives) {
    newState.objectives.forEach((obj: Objective) => {
      if (obj.type === ObjectiveType.TakeEpicCrate && !obj.completed) {
        obj.amountCurrent += 1;
        if (obj.amountCurrent >= obj.amountRequired) obj.completed = true;
      }
    });
  }

  newState.lastAction = {
    type: ActionType.TAKE_EPIC_CRATE,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: `Drew Epic Weapon: ${card.name}`,
    epicWeaponDrawn: card.equipmentId,
  };

  newState.history.push({
    playerId: intent.playerId,
    survivorId: intent.survivorId || 'system',
    actionType: ActionType.TAKE_EPIC_CRATE,
    timestamp: Date.now(),
    payload: { zoneId: zone.id, equipmentId: card.equipmentId },
  });

  return newState;
}
