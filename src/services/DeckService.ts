// src/services/DeckService.ts

import { GameState, EquipmentCard, SpawnCard } from '../types/GameState';
import { EQUIPMENT_CARDS, INITIAL_DECK_CONFIG, EPIC_EQUIPMENT_CARDS, INITIAL_EPIC_DECK_CONFIG } from '../config/EquipmentRegistry';
import { SPAWN_CARDS } from '../config/SpawnRegistry';
import { Rng, RngState } from './Rng';
import type { EventCollector } from './EventCollector';

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
   * Draws from the Epic deck. Mutates `state` in place.
   * Epic cards don't reshuffle from discard by default.
   */
  public static drawEpicCard(state: GameState): EquipmentCard | null {
    if (!state.epicDeck || state.epicDeck.length === 0) return null;
    const card = state.epicDeck.shift();
    return card ?? null;
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
   * Draws a card from the deck. Reshuffles discard if empty. Mutates `state`
   * in place. Optionally emits DECK_SHUFFLED on reshuffle (count-only payload —
   * never the order, per §3.2 / §A / §D13).
   */
  public static drawCard(state: GameState, collector?: EventCollector): EquipmentCard | null {
    if (state.equipmentDeck.length === 0) {
      if (state.equipmentDiscard.length === 0) return null;

      const rng = Rng.from(state.seed);
      state.equipmentDeck = this.shuffle(state.equipmentDiscard, rng);
      state.equipmentDiscard = [];
      state.seed = rng.snapshot();
      // Reshuffled reloadables re-enter the deck as fresh (B5).
      for (const c of state.equipmentDeck) {
        if (c.keywords?.includes('reload')) c.reloaded = true;
      }
      collector?.emit({
        type: 'DECK_SHUFFLED',
        deckSize: state.equipmentDeck.length,
        discardSize: 0,
      });
    }

    const card = state.equipmentDeck.shift();
    return card ?? null;
  }

  /**
   * Predicate-based equipment draw used by Matching Set (RULEBOOK.md:543 —
   * "take a second copy from the Equipment deck. Shuffle deck after").
   * Scans the live deck for the first card satisfying `predicate`; on a
   * miss, reshuffles the discard pile into the deck (emitting DECK_SHUFFLED)
   * and retries once. On a successful splice from the live deck the
   * remainder is re-shuffled and DECK_SHUFFLED emits — otherwise the order
   * of the un-drawn deck would leak information the rule forbids.
   * Mutates `state` in place. Returns `null` when no card matches anywhere.
   * Callers must still route any returned trap cards through the Aaahh!!
   * handler — this method does not inspect keywords.
   */
  public static drawCardWhere(
    state: GameState,
    predicate: (card: EquipmentCard) => boolean,
    collector?: EventCollector,
  ): EquipmentCard | null {
    const idx = state.equipmentDeck.findIndex(predicate);
    if (idx >= 0) {
      const card = state.equipmentDeck.splice(idx, 1)[0];
      // "Shuffle deck after" — shuffle the remaining deck and advertise it.
      const rng = Rng.from(state.seed);
      state.equipmentDeck = this.shuffle(state.equipmentDeck, rng);
      state.seed = rng.snapshot();
      collector?.emit({
        type: 'DECK_SHUFFLED',
        deckSize: state.equipmentDeck.length,
        discardSize: state.equipmentDiscard.length,
      });
      return card;
    }

    if (state.equipmentDeck.length === 0 && state.equipmentDiscard.length > 0) {
      const rng = Rng.from(state.seed);
      state.equipmentDeck = this.shuffle(state.equipmentDiscard, rng);
      state.equipmentDiscard = [];
      state.seed = rng.snapshot();
      for (const c of state.equipmentDeck) {
        if (c.keywords?.includes('reload')) c.reloaded = true;
      }
      // Reshuffle already put the deck in a fresh random order — this emit
      // satisfies both the reshuffle signal and the Matching-Set "shuffle
      // after" clause, so no second emit is needed on the post-splice path.
      collector?.emit({
        type: 'DECK_SHUFFLED',
        deckSize: state.equipmentDeck.length,
        discardSize: 0,
      });
      const idx2 = state.equipmentDeck.findIndex(predicate);
      if (idx2 >= 0) return state.equipmentDeck.splice(idx2, 1)[0];
    }
    return null;
  }

  /**
   * Draws a spawn card. Mutates `state` in place. Optionally emits
   * DECK_SHUFFLED on reshuffle.
   */
  public static drawSpawnCard(state: GameState, collector?: EventCollector): SpawnCard | null {
    if (state.spawnDeck.length === 0) {
      if (state.spawnDiscard.length === 0) return null;

      const rng = Rng.from(state.seed);
      state.spawnDeck = this.shuffle(state.spawnDiscard, rng);
      state.spawnDiscard = [];
      state.seed = rng.snapshot();
      collector?.emit({
        type: 'DECK_SHUFFLED',
        deckSize: state.spawnDeck.length,
        discardSize: 0,
      });
    }

    const card = state.spawnDeck.shift();
    if (card) state.spawnDiscard.push(card);
    return card ?? null;
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
