// src/services/DeckService.ts

import { GameState, EquipmentCard, SpawnCard } from '../types/GameState';
import { EQUIPMENT_CARDS, INITIAL_DECK_CONFIG } from '../config/EquipmentRegistry';
import { SPAWN_CARDS } from '../config/SpawnRegistry';
import { nextRandom } from './DiceService';

export class DeckService {
  
  /**
   * Initializes the Equipment Deck with a fresh, shuffled set of cards based on the config.
   */
  public static initializeDeck(seed: string): { deck: EquipmentCard[], newSeed: string } {
    let currentSeed = seed;
    const deck: EquipmentCard[] = [];

    // 1. Build Deck
    let cardCounter = 0;
    for (const cardKey of INITIAL_DECK_CONFIG) {
      const template = EQUIPMENT_CARDS[cardKey];
      if (template) {
        deck.push({
          id: `card-${cardKey}-${cardCounter++}`,
          ...template,
          inHand: false,
          slot: 'BACKPACK' // Default
        });
      }
    }

    // 2. Shuffle
    const shuffled = this.shuffle(deck, currentSeed);
    
    return {
      deck: shuffled.deck,
      newSeed: shuffled.newSeed
    };
  }

  /**
   * Initializes the Spawn Deck.
   */
  public static initializeSpawnDeck(seed: string): { deck: SpawnCard[], newSeed: string } {
    let currentSeed = seed;
    // Clone spawn cards to avoid mutation of registry
    const deck: SpawnCard[] = SPAWN_CARDS.map(c => ({ ...c }));
    
    const shuffled = this.shuffle(deck, currentSeed);
    return {
      deck: shuffled.deck,
      newSeed: shuffled.newSeed
    };
  }

  /**
   * Draws a card from the deck. Reshuffles discard if empty.
   */
  public static drawCard(state: GameState): { card: EquipmentCard | null, newState: GameState } {
    const newState = structuredClone(state);
    
    if (newState.equipmentDeck.length === 0) {
      if (newState.equipmentDiscard.length === 0) {
        return { card: null, newState }; // Totally empty
      }
      
      // Reshuffle Discard
      const result = this.shuffle(newState.equipmentDiscard, newState.seed);
      newState.equipmentDeck = result.deck;
      newState.equipmentDiscard = [];
      newState.seed = result.newSeed;
    }

    const card = newState.equipmentDeck.shift(); // Remove from top (front)
    
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
      
      const result = this.shuffle(newState.spawnDiscard, newState.seed);
      newState.spawnDeck = result.deck;
      newState.spawnDiscard = [];
      newState.seed = result.newSeed;
    }

    const card = newState.spawnDeck.shift();
    if (card) {
      newState.spawnDiscard.push(card);
    }
    return { card: card || null, newState };
  }

  /**
   * Fisher-Yates Shuffle using deterministic PRNG.
   */
  private static shuffle<T>(array: T[], seed: string): { deck: T[], newSeed: string } {
    const deck = [...array];
    let currentSeed = seed;
    let m = deck.length, t, i;

    while (m) {
      const result = nextRandom(currentSeed);
      currentSeed = result.nextSeed;
      i = Math.floor(result.value * m--);

      t = deck[m];
      deck[m] = deck[i];
      deck[i] = t;
    }

    return { deck, newSeed: currentSeed };
  }
}
