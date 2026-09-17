// src/services/CardDraw.ts
//
// One resolution for a drawn card, wherever it is drawn: a search, an Epic
// crate, or a Hold your nose kill. Before this existed each caller decided for
// itself what a drawn card was, and only the search knew what an Aaahh!! is —
// the other two filed it as equipment and let it into an inventory.

import { GameState, EquipmentCard, EntityId, ZombieType } from '../types/GameState';
import { EquipmentManager } from './EquipmentManager';
import { ZombiePhaseManager } from './ZombiePhaseManager';
import { DeckService } from './DeckService';

export type DrawOutcome =
  /** Taken straight into the inventory. */
  | 'KEPT'
  /** Staged in `survivor.drawnCard` — the player picks a slot or drops it. */
  | 'OFFERED'
  /** No room and a card already staged: discarded so it can't vanish. */
  | 'DISCARDED'
  /** Aaahh!! — a Walker spawned, the card was discarded, stop drawing. */
  | 'AAAHH';

export interface ResolveOptions {
  /**
   * Stage the card even when the inventory has room, so the player chooses its
   * slot. Epic crates do this: the weapon is worth a deliberate placement.
   */
  alwaysOffer?: boolean;
}

/**
 * Resolves one drawn card for `survivorId`, mutating `state` (every caller
 * already works on a clone). The returned outcome tells the caller what
 * happened; `'AAAHH'` means the draw that produced it must stop.
 *
 * The card always ends somewhere real — an inventory, the staging slot, or a
 * discard pile — so card totals are conserved on every path.
 */
export function resolveDrawnCard(
  state: GameState,
  survivorId: EntityId,
  card: EquipmentCard,
  options: ResolveOptions = {},
): DrawOutcome {
  const survivor = state.survivors[survivorId];

  // Aaahh!!: spawn a Walker in the survivor's zone, discard, stop the draw.
  if (card.keywords?.includes('aaahh')) {
    ZombiePhaseManager.spawnZombie(state, survivor.position.zoneId, ZombieType.Walker);
    DeckService.discard(state, card);
    return 'AAAHH';
  }

  const hasRoom = !EquipmentManager.isHandFull(survivor) && EquipmentManager.hasSpace(survivor);

  if (hasRoom && !options.alwaysOffer) {
    state.survivors[survivorId] = EquipmentManager.addCard(survivor, card);
    return 'KEPT';
  }

  // Only one card can be staged at a time; anything further would be lost, so
  // it goes to the discard instead of disappearing on an overflow `break`.
  if (survivor.drawnCard) {
    DeckService.discard(state, card);
    return 'DISCARDED';
  }

  survivor.drawnCard = card;
  return 'OFFERED';
}
