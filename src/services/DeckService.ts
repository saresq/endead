// src/services/DeckService.ts

import { GameState, EquipmentCard, SpawnCard } from '../types/GameState';
import {
  EQUIPMENT_CARDS,
  EPIC_EQUIPMENT_CARDS,
  INITIAL_DECK_CONFIG,
  INITIAL_EPIC_DECK_CONFIG,
} from '../config/EquipmentRegistry';
import { SPAWN_CARDS } from '../config/SpawnRegistry';
import { Rng, RngState } from './Rng';

export class DeckService {

  /**
   * Initializes the Equipment Deck with a fresh, shuffled set of cards based on the config.
   */
  public static initializeDeck(seed: RngState): { deck: EquipmentCard[], newSeed: RngState } {
    const deck: EquipmentCard[] = [];

    let cardCounter = 0;
    for (const cardKey of INITIAL_DECK_CONFIG) {
      const template = EQUIPMENT_CARDS[cardKey];
      if (template) {
        deck.push({
          id: `card-${cardKey}-${cardCounter++}`,
          equipmentId: cardKey,
          ...template,
          inHand: false,
          slot: 'BACKPACK'
        });
      }
    }

    const rng = Rng.from(seed);
    const shuffled = this.shuffle(deck, rng);
    return { deck: shuffled, newSeed: rng.snapshot() };
  }

  /**
   * Initializes the Epic Equipment Deck (red-back, drawn on Epic Crate take).
   * Stamps `equipmentId` from the registry key — same convention as the
   * standard deck so `CollectItems` win conditions can reference Epic IDs.
   */
  public static initializeEpicDeck(seed: RngState): { deck: EquipmentCard[], newSeed: RngState } {
    const deck: EquipmentCard[] = [];

    let cardCounter = 0;
    for (const cardKey of INITIAL_EPIC_DECK_CONFIG) {
      const template = EPIC_EQUIPMENT_CARDS[cardKey];
      if (template) {
        deck.push({
          id: `epic-${cardKey}-${cardCounter++}`,
          equipmentId: cardKey,
          ...template,
          inHand: false,
          slot: 'BACKPACK'
        });
      }
    }

    const rng = Rng.from(seed);
    const shuffled = this.shuffle(deck, rng);
    return { deck: shuffled, newSeed: rng.snapshot() };
  }

  /**
   * Initializes the Spawn Deck.
   */
  public static initializeSpawnDeck(seed: RngState): { deck: SpawnCard[], newSeed: RngState } {
    const deck: SpawnCard[] = SPAWN_CARDS.map(c => ({ ...c }));
    const rng = Rng.from(seed);
    const shuffled = this.shuffle(deck, rng);
    return { deck: shuffled, newSeed: rng.snapshot() };
  }

  /**
   * Draws a card from the deck. Reshuffles discard if empty.
   */
  public static drawCard(state: GameState): { card: EquipmentCard | null, newState: GameState } {
    const newState = structuredClone(state);

    if (newState.equipmentDeck.length === 0) {
      if (newState.equipmentDiscard.length === 0) {
        return { card: null, newState };
      }

      const rng = Rng.from(newState.seed);
      newState.equipmentDeck = this.shuffle(newState.equipmentDiscard, rng);
      newState.equipmentDiscard = [];
      newState.seed = rng.snapshot();
    }

    const card = newState.equipmentDeck.shift();
    return { card: card || null, newState };
  }

  /**
   * Draws a spawn card.
   */
  public static drawSpawnCard(state: GameState): { card: SpawnCard | null, newState: GameState } {
    const newState = structuredClone(state);

    if (newState.spawnDeck.length === 0) {
      if (newState.spawnDiscard.length === 0) {
        return { card: null, newState };
      }

      const rng = Rng.from(newState.seed);
      newState.spawnDeck = this.shuffle(newState.spawnDiscard, rng);
      newState.spawnDiscard = [];
      newState.seed = rng.snapshot();
    }

    const card = newState.spawnDeck.shift();
    if (card) {
      newState.spawnDiscard.push(card);
    }
    return { card: card || null, newState };
  }

  /**
   * Fisher-Yates shuffle using the handle-based Rng. Advances the handle's state
   * in place; caller reads `.snapshot()` afterwards to persist the new seed.
   */
  private static shuffle<T>(array: T[], rng: Rng): T[] {
    const deck = [...array];
    for (let m = deck.length - 1; m > 0; m--) {
      const i = rng.nextInt(m + 1);
      const t = deck[m];
      deck[m] = deck[i];
      deck[i] = t;
    }
    return deck;
  }
}
