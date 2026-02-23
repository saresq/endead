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
  public static moveCardToSlot(survivor: Survivor, cardId: EntityId, targetSlot: 'HAND_1' | 'HAND_2' | 'BACKPACK'): Survivor {
    const newSurvivor = { ...survivor, inventory: [...survivor.inventory] };
    const card = newSurvivor.inventory.find(c => c.id === cardId);
    
    if (!card) throw new Error('Card not found');

    // If target slot is occupied, swap slots
    const occupant = newSurvivor.inventory.find(c => c.slot === targetSlot);
    
    if (occupant) {
      occupant.slot = card.slot;
      occupant.inHand = (card.slot === 'HAND_1' || card.slot === 'HAND_2');
    }

    card.slot = targetSlot;
    card.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');

    return newSurvivor;
  }
}
