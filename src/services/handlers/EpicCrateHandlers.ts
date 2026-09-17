import { GameState, ObjectiveType, Objective } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { DeckService } from '../DeckService';
import { resolveDrawnCard } from '../CardDraw';
import { es, equipmentName } from '../../strings/es';

/**
 * TAKE_EPIC_CRATE handler. Triggered when a survivor occupies a zone with a
 * red Epic Weapon Crate token and chooses to take it.
 *
 * Per rules/16-card-registry.md / plan §4.3:
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
  if (!zone?.hasEpicCrate) throw new Error(es.errors.noEpicCrate);

  // The drawnCard staging slot must be free — otherwise the survivor has an
  // unresolved search and can't take a new card.
  if (survivor.drawnCard) throw new Error(es.errors.resolvePendingCard);

  // Draw the top epic card (reshuffle from epicDiscard if empty).
  if (newState.epicDeck.length === 0 && newState.epicDiscard.length > 0) {
    const reshuffled = DeckService.shuffleDeck(newState.epicDiscard, newState.seed);
    newState.epicDeck = reshuffled.deck;
    newState.epicDiscard = [];
    newState.seed = reshuffled.newSeed;
  }

  const card = newState.epicDeck.shift();
  if (!card) {
    // Both deck and discard empty — should not occur because EPIC_CRATE_LIMIT
    // clamps editor placements at the deck size, but guard explicitly so a
    // misconfigured map fails loudly.
    throw new Error(es.errors.epicDeckEmpty);
  }

  // Stage the new card so the existing drawnCard UI lets the player slot it
  // and freely reorganize the rest of the inventory. An Aaahh!! in the Epic
  // deck resolves as an Aaahh!! anywhere else does — Walker, discard, no
  // inventory — which is why this goes through the shared resolution.
  const outcome = resolveDrawnCard(newState, intent.survivorId!, card, { alwaysOffer: true });

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
    description: outcome === 'AAAHH' ? es.log.searchTrap : es.log.epicWeapon(equipmentName(card)),
    epicWeaponDrawn: outcome === 'AAAHH' ? undefined : card.equipmentId,
  };

  return newState;
}
