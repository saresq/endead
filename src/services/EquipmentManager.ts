// src/services/EquipmentManager.ts

import { GameState, Survivor, EquipmentCard, EntityId } from '../types/GameState';

export class EquipmentManager {
  private static MAX_HANDS = 2;
  private static MAX_BODY = 1; // Future expansion (armor/flashlight etc) - handled as backpack for now or slots
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
      card.slot = 'BACKPACK';
      card.inHand = false;
    }

    newSurvivor.inventory.push(card);
    return newSurvivor;
  }

  /**
   * Discards a specific card from the survivor's inventory.
   */
  public static discardCard(state: GameState, survivorId: EntityId, cardId: EntityId): GameState {
    const newState = JSON.parse(JSON.stringify(state));
    const survivor = newState.survivors[survivorId];
    
    const cardIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === cardId);
    if (cardIndex === -1) {
      // Check if it's the pending drawn card
      if (survivor.drawnCard && survivor.drawnCard.id === cardId) {
        newState.equipmentDiscard.push(survivor.drawnCard);
        survivor.drawnCard = undefined;
        return newState;
      }
      throw new Error('Card not found in inventory');
    }

    const [discarded] = survivor.inventory.splice(cardIndex, 1);
    newState.equipmentDiscard.push(discarded);
    
    return newState;
  }

  /**
   * Swaps items between the `drawnCard` temporary slot and the inventory.
   * effectively "Equip New, Discard Old".
   */
  public static swapDrawnCard(state: GameState, survivorId: EntityId, discardCardId: EntityId): GameState {
    const newState = JSON.parse(JSON.stringify(state));
    const survivor = newState.survivors[survivorId];

    if (!survivor.drawnCard) throw new Error('No pending card to resolve');

    // Remove the chosen card to discard
    const discardIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === discardCardId);
    if (discardIndex === -1) throw new Error('Discard target not found');

    const [oldCard] = survivor.inventory.splice(discardIndex, 1);
    
    // Add the new card (it takes the old card's slot ideally, or auto-slots)
    const newCard = survivor.drawnCard;
    newCard.slot = oldCard.slot; // Inherit slot
    newCard.inHand = oldCard.inHand;
    
    survivor.inventory.push(newCard);
    
    // Move old to discard pile
    newState.equipmentDiscard.push(oldCard);
    
    // Clear pending
    survivor.drawnCard = undefined;

    return newState;
  }

  /**
   * Organizes inventory (moves card to a specific slot).
   */
  public static moveCardToSlot(survivor: Survivor, cardId: EntityId, targetSlot: string): Survivor {
    const newSurvivor = { ...survivor }; // Shallow clone
    // Deep clone inventory to mutate
    newSurvivor.inventory = survivor.inventory.map(c => ({...c}));
    
    const card = newSurvivor.inventory.find(c => c.id === cardId);
    
    if (!card) throw new Error('Card not found');

    // Handle DISCARD slot
    if (targetSlot === 'DISCARD') {
        card.slot = 'DISCARD';
        card.inHand = false;
        return newSurvivor;
    }

    // If target slot is occupied by another item, we might need to swap
    // But if target is BACKPACK, we just add it to pile (since multiple items can be BACKPACK)
    if (targetSlot === 'BACKPACK') {
        card.slot = 'BACKPACK';
        card.inHand = false;
        return newSurvivor;
    }

    // For specific slots (HAND_1, HAND_2), check if occupied
    const occupant = newSurvivor.inventory.find(c => c.slot === targetSlot);
    
    if (occupant) {
      // Swap slots
      occupant.slot = card.slot;
      occupant.inHand = (card.slot === 'HAND_1' || card.slot === 'HAND_2');
    }

    card.slot = targetSlot as any;
    card.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');

    return newSurvivor;
  }

  /**
   * Validates if a proposed inventory configuration is legal.
   * Checks max slots and duplicate slots.
   */
  public static validateLoadout(inventory: { slot?: string }[]): boolean {
    const hands = inventory.filter(c => c.slot === 'HAND_1' || c.slot === 'HAND_2');
    const backpack = inventory.filter(c => c.slot === 'BACKPACK');
    const body = inventory.filter(c => c.slot === 'BODY'); // Future proofing

    if (hands.length > this.MAX_HANDS) return false;
    if (backpack.length > this.MAX_BACKPACK) return false;
    
    // Check for duplicate specific slots (e.g. two items in HAND_1)
    const hand1 = inventory.filter(c => c.slot === 'HAND_1');
    const hand2 = inventory.filter(c => c.slot === 'HAND_2');
    
    if (hand1.length > 1 || hand2.length > 1) return false;

    return true;
  }
}
