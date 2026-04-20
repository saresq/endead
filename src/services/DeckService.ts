// src/services/DeckService.ts

import { GameState, EquipmentCard, SpawnCard } from '../types/GameState';
import { EQUIPMENT_CARDS, INITIAL_DECK_CONFIG, EPIC_EQUIPMENT_CARDS, INITIAL_EPIC_DECK_CONFIG } from '../config/EquipmentRegistry';
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
        const card: EquipmentCard = {
          id: `card-${cardKey}-${cardCounter++}`,
          ...template,
          inHand: false,
          slot: 'BACKPACK',
        };
        if (template.keywords?.includes('reload')) card.reloaded = true;
        deck.push(card);
      }
    }

    const rng = Rng.from(seed);
    const shuffled = this.shuffle(deck, rng);
    return { deck: shuffled, newSeed: rng.snapshot() };
  }

  /**
   * Initializes the Epic Weapons Deck (red-back). Granted by Epic Weapon Crate
   * objectives (RULEBOOK §9, Mission Elements).
   */
  public static initializeEpicDeck(seed: RngState): { deck: EquipmentCard[], newSeed: RngState } {
    const deck: EquipmentCard[] = [];
    let cardCounter = 0;
    for (const cardKey of INITIAL_EPIC_DECK_CONFIG) {
      const template = EPIC_EQUIPMENT_CARDS[cardKey];
      if (template) {
        const card: EquipmentCard = {
          id: `epic-${cardKey}-${cardCounter++}`,
          ...template,
          inHand: false,
          slot: 'BACKPACK',
        };
        if (template.keywords?.includes('reload')) card.reloaded = true;
        deck.push(card);
      }
    }
    const rng = Rng.from(seed);
    const shuffled = this.shuffle(deck, rng);
    return { deck: shuffled, newSeed: rng.snapshot() };
  }

  /**
   * Draws from the Epic deck (separate from the standard Equipment deck).
   * Epic cards don't reshuffle from discard by default — once used, they stay gone.
   */
  public static drawEpicCard(state: GameState): { card: EquipmentCard | null, newState: GameState } {
    const newState = structuredClone(state);
    if (!newState.epicDeck || newState.epicDeck.length === 0) {
      return { card: null, newState };
    }
    const card = newState.epicDeck.shift();
    return { card: card || null, newState };
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
      // Reshuffled reloadables re-enter the deck as fresh (B5). A card can only
      // rejoin play via reshuffle, so this is the single choke point.
      for (const c of newState.equipmentDeck) {
        if (c.keywords?.includes('reload')) c.reloaded = true;
      }
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
