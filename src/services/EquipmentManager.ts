// src/services/EquipmentManager.ts

import { GameState, Survivor, EquipmentCard, EntityId } from '../types/GameState';

const BACKPACK_SLOTS = ['BACKPACK_0', 'BACKPACK_1', 'BACKPACK_2'] as const;

export function isBackpackSlot(slot: string | undefined): boolean {
  return slot === 'BACKPACK_0' || slot === 'BACKPACK_1' || slot === 'BACKPACK_2' || slot === 'BACKPACK';
}

export class EquipmentManager {
  private static MAX_HANDS = 2;
  private static MAX_BACKPACK = 3;

  /**
   * Checks if inventory has space.
   */
  public static hasSpace(survivor: Survivor): boolean {
    return survivor.inventory.length < (this.MAX_HANDS + this.MAX_BACKPACK);
  }

  public static isHandFull(survivor: Survivor): boolean {
    const handCount = survivor.inventory.filter(c => c.slot === 'HAND_1' || c.slot === 'HAND_2').length;
    return handCount >= this.MAX_HANDS;
  }

  /**
   * Adds a card to the first available slot.
   * If full, it does NOT add, requiring a resolution action.
   */
  public static addCard(survivor: Survivor, card: EquipmentCard): Survivor {
    const newSurvivor = { ...survivor, inventory: [...survivor.inventory] };

    // Auto-assign slot
    // 1. Hands
    // 2. Backpack
    const handCount = newSurvivor.inventory.filter(c => c.slot === 'HAND_1' || c.slot === 'HAND_2').length;

    if (handCount < this.MAX_HANDS) {
      // Find empty hand slot
      const hand1 = newSurvivor.inventory.find(c => c.slot === 'HAND_1');
      const hand2 = newSurvivor.inventory.find(c => c.slot === 'HAND_2');

      card.slot = !hand1 ? 'HAND_1' : 'HAND_2';
      card.inHand = true;
    } else {
      card.slot = this.firstOpenBackpackSlot(newSurvivor) ?? 'BACKPACK_0';
      card.inHand = false;
    }

    newSurvivor.inventory.push(card);
    return newSurvivor;
  }

  /** Returns the first unoccupied BACKPACK_N slot, or null if all full. */
  public static firstOpenBackpackSlot(survivor: Survivor): EquipmentCard['slot'] | null {
    const occupied = new Set(survivor.inventory.map(c => c.slot));
    for (const slot of BACKPACK_SLOTS) {
      if (!occupied.has(slot)) return slot;
    }
    return null;
  }

  /**
   * Discards a specific card from the survivor's inventory. Mutates `state` in place.
   */
  public static discardCard(state: GameState, survivorId: EntityId, cardId: EntityId): void {
    const survivor = state.survivors[survivorId];

    const cardIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === cardId);
    if (cardIndex === -1) {
      // Check if it's the pending drawn card
      if (survivor.drawnCard && survivor.drawnCard.id === cardId) {
        state.equipmentDiscard.push(survivor.drawnCard);
        survivor.drawnCard = undefined;
        return;
      }
      throw new Error('Card not found in inventory');
    }

    const [discarded] = survivor.inventory.splice(cardIndex, 1);
    state.equipmentDiscard.push(discarded);
  }

  /**
   * Swaps the pending `drawnCard` with an inventory card; old goes to discard.
   * Mutates `state` in place. Validates first — throws before any mutation.
   */
  public static swapDrawnCard(state: GameState, survivorId: EntityId, discardCardId: EntityId): void {
    const survivor = state.survivors[survivorId];

    if (!survivor.drawnCard) throw new Error('No pending card to resolve');
    const discardIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === discardCardId);
    if (discardIndex === -1) throw new Error('Discard target not found');

    const [oldCard] = survivor.inventory.splice(discardIndex, 1);

    const newCard = survivor.drawnCard;
    newCard.slot = oldCard.slot;
    newCard.inHand = oldCard.inHand;

    survivor.inventory.push(newCard);
    state.equipmentDiscard.push(oldCard);
    survivor.drawnCard = undefined;
  }

  /**
   * Organizes inventory (moves card to a specific slot). Mutates `survivor`
   * in place — the caller already holds a live reference into `state.survivors`.
   */
  public static moveCardToSlot(survivor: Survivor, cardId: EntityId, targetSlot: string): void {
    const card = survivor.inventory.find(c => c.id === cardId);
    if (!card) throw new Error('Card not found');

    if (targetSlot === 'DISCARD') {
      card.slot = 'DISCARD';
      card.inHand = false;
      return;
    }

    const occupant = survivor.inventory.find(c => c.slot === targetSlot && c.id !== cardId);
    if (occupant) {
      occupant.slot = card.slot;
      occupant.inHand = (card.slot === 'HAND_1' || card.slot === 'HAND_2');
    }

    card.slot = targetSlot as EquipmentCard['slot'];
    card.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');
  }

  /**
   * Validates if a proposed inventory configuration is legal.
   * Checks max slots and duplicate slots.
   */
  public static validateLoadout(inventory: { slot?: string }[]): boolean {
    const hands = inventory.filter(c => c.slot === 'HAND_1' || c.slot === 'HAND_2');
    const backpack = inventory.filter(c => isBackpackSlot(c.slot));

    if (hands.length > this.MAX_HANDS) return false;
    if (backpack.length > this.MAX_BACKPACK) return false;

    // Check for duplicate specific slots (e.g. two items in HAND_1)
    const hand1 = inventory.filter(c => c.slot === 'HAND_1');
    const hand2 = inventory.filter(c => c.slot === 'HAND_2');

    if (hand1.length > 1 || hand2.length > 1) return false;

    return true;
  }
}
