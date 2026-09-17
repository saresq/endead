// src/services/EquipmentManager.ts

import { GameState, Survivor, EquipmentCard, EntityId, EquipmentType } from '../types/GameState';
import { es } from '../strings/es';
import { DeckService } from './DeckService';

const BACKPACK_SLOTS = ['BACKPACK_0', 'BACKPACK_1', 'BACKPACK_2'] as const;

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
   * Weapons prefer hands; non-weapons prefer backpack so they don't block
   * weapon slots. Falls back to the other region when the preferred is full.
   */
  public static addCard(survivor: Survivor, card: EquipmentCard): Survivor {
    const newSurvivor = { ...survivor, inventory: [...survivor.inventory] };

    const handCount = newSurvivor.inventory.filter(c => c.slot === 'HAND_1' || c.slot === 'HAND_2').length;
    const openBackpack = this.firstOpenBackpackSlot(newSurvivor);
    const isWeapon = card.type === EquipmentType.Weapon;

    const placeInHand = () => {
      const hand1 = newSurvivor.inventory.find(c => c.slot === 'HAND_1');
      card.slot = !hand1 ? 'HAND_1' : 'HAND_2';
      card.inHand = true;
    };
    const placeInBackpack = () => {
      card.slot = openBackpack ?? 'BACKPACK_0';
      card.inHand = false;
    };

    if (isWeapon) {
      if (handCount < this.MAX_HANDS) placeInHand();
      else if (openBackpack) placeInBackpack();
      else placeInHand(); // both full — fall through; gating in caller should have caught it
    } else {
      if (openBackpack) placeInBackpack();
      else if (handCount < this.MAX_HANDS) placeInHand();
      else placeInBackpack();
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
   * Discards a specific card from the survivor's inventory.
   */
  public static discardCard(state: GameState, survivorId: EntityId, cardId: EntityId): GameState {
    const newState = structuredClone(state);
    const survivor = newState.survivors[survivorId];

    const cardIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === cardId);
    if (cardIndex === -1) {
      // Check if it's the pending drawn card
      if (survivor.drawnCard && survivor.drawnCard.id === cardId) {
        DeckService.discard(newState, survivor.drawnCard);
        survivor.drawnCard = undefined;
        return newState;
      }
      throw new Error('Card not found in inventory');
    }

    const [discarded] = survivor.inventory.splice(cardIndex, 1);
    DeckService.discard(newState, discarded);

    return newState;
  }

  /**
   * Swaps items between the `drawnCard` temporary slot and the inventory.
   * effectively "Equip New, Discard Old".
   */
  public static swapDrawnCard(state: GameState, survivorId: EntityId, discardCardId: EntityId): GameState {
    const newState = structuredClone(state);
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
    DeckService.discard(newState, oldCard);

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

    // If target slot is occupied by another item, swap
    const occupant = newSurvivor.inventory.find(c => c.slot === targetSlot && c.id !== cardId);
    if (occupant) {
      occupant.slot = card.slot;
      occupant.inHand = (card.slot === 'HAND_1' || card.slot === 'HAND_2');
    }

    card.slot = targetSlot as any;
    card.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');

    return newSurvivor;
  }

  /**
   * Checks a proposed inventory against the carrying rules: at most two cards
   * in hand, at most five in total, and never two cards in one slot. Returns
   * null when it is legal, or the message naming the rule it breaks — a
   * rejected trade that doesn't say which rule failed reads as a bug.
   */
  public static validateLoadout(inventory: { slot?: string }[]): string | null {
    const hands = inventory.filter(c => c.slot === 'HAND_1' || c.slot === 'HAND_2');
    if (hands.length > this.MAX_HANDS) return es.errors.loadoutTooManyHands;
    if (inventory.length > this.MAX_HANDS + this.MAX_BACKPACK) return es.errors.loadoutTooManyCards;

    const slots = new Set<string>();
    for (const card of inventory) {
      if (!card.slot || slots.has(card.slot)) return es.errors.loadoutSlotTaken;
      slots.add(card.slot);
    }

    return null;
  }
}
